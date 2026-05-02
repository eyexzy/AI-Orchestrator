import json
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import (
    AdaptationDecision,
    AdaptationFeedback,
    ChatMessage,
    ChatSession,
    DailyUsage,
    InteractionLog,
    MLFeedback,
    Project,
    ProductFeedback,
    PromptTemplateDB,
    SessionMetrics,
    UserEvent,
    UserExperienceProfile,
    UserProfile,
)
from dependencies import limiter, get_db, get_current_user
from routers.generate import (
    get_daily_usage, get_weekly_usage, get_usage_history,
    DAILY_TOKEN_LIMIT, WEEKLY_TOKEN_LIMIT, _today_utc,
)
from sqlalchemy import func as sa_func
from schemas.api import (
    AccountDeletionResponse,
    AccountStatsResponse,
    BulkDeleteResponse,
    DashboardDecisionItem,
    DashboardResponse,
    ProfilePreferencesResponse,
    ProfilePreferencesUpdate,
)

router = APIRouter()

MIN_USER_LEVEL = 1


def _valid_level(value: int | None) -> int | None:
    return value if value in (1, 2, 3) else None


def _manual_override(
    profile: UserProfile | None,
    exp: UserExperienceProfile | None,
) -> int | None:
    return (
        _valid_level(exp.manual_level_override if exp else None)
        or _valid_level(profile.manual_level_override if profile else None)
    )


def _auto_current_level(
    profile: UserProfile | None,
    exp: UserExperienceProfile | None,
) -> int:
    return (
        _valid_level(exp.current_level if exp else None)
        or _valid_level(profile.current_level if profile else None)
        or MIN_USER_LEVEL
    )


def _effective_current_level(
    profile: UserProfile | None,
    exp: UserExperienceProfile | None,
) -> int:
    return _manual_override(profile, exp) or _auto_current_level(profile, exp)


def _build_response(
    profile: UserProfile | None,
    exp: UserExperienceProfile | None,
) -> ProfilePreferencesResponse:
    auto_level = _auto_current_level(profile, exp)
    override = _manual_override(profile, exp)
    effective_level = override or auto_level

    return ProfilePreferencesResponse(
        theme=(profile.theme if profile else None) or "system",
        language=(profile.language if profile else None) or "en",
        current_level=effective_level,
        auto_level=auto_level,
        effective_level=effective_level,
        initial_level=exp.initial_level if exp else MIN_USER_LEVEL,
        self_assessed_level=exp.self_assessed_level if exp else None,
        manual_level_override=override,
        onboarding_completed=bool(exp and exp.onboarding_completed),
        hidden_templates=json.loads(
            (profile.hidden_templates_json if profile else None) or "[]"
        ),
        display_name=(profile.display_name if profile else None),
        notify_level_up=bool(profile.notify_level_up) if profile else True,
        notify_micro_feedback=bool(profile.notify_micro_feedback) if profile else True,
        notify_tutor_suggestions=bool(profile.notify_tutor_suggestions) if profile else True,
        tracking_enabled=bool(profile.tracking_enabled) if profile else True,
    )


async def _get_both(db: AsyncSession, user_email: str):
    r1 = await db.execute(
        select(UserProfile).where(UserProfile.user_email == user_email)
    )
    profile = r1.scalars().first()

    r2 = await db.execute(
        select(UserExperienceProfile).where(
            UserExperienceProfile.user_email == user_email
        )
    )
    exp = r2.scalars().first()
    return profile, exp


@limiter.limit("30/minute")
@router.get("/profile/preferences", response_model=ProfilePreferencesResponse)
async def get_preferences(
    request: Request,
    user_email: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile, exp = await _get_both(db, user_email)
    return _build_response(profile, exp)


@limiter.limit("30/minute")
@router.patch("/profile/preferences", response_model=ProfilePreferencesResponse)
async def update_preferences(
    request: Request,
    body: ProfilePreferencesUpdate,
    user_email: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile, exp = await _get_both(db, user_email)

    # Ensure UserProfile row exists (for theme/language/hidden_templates)
    if not profile:
        profile = UserProfile(user_email=user_email)
        db.add(profile)

    if body.theme is not None:
        profile.theme = body.theme
    if body.language is not None:
        profile.language = body.language
    if body.hidden_templates is not None:
        profile.hidden_templates_json = json.dumps(body.hidden_templates)
    if "display_name" in body.model_fields_set:
        trimmed = (body.display_name or "").strip()
        profile.display_name = trimmed or None
    if body.notify_level_up is not None:
        profile.notify_level_up = bool(body.notify_level_up)
    if body.notify_micro_feedback is not None:
        profile.notify_micro_feedback = bool(body.notify_micro_feedback)
    if body.notify_tutor_suggestions is not None:
        profile.notify_tutor_suggestions = bool(body.notify_tutor_suggestions)
    if body.tracking_enabled is not None:
        profile.tracking_enabled = bool(body.tracking_enabled)

    # Handle experience-profile level fields
    # UserExperienceProfile is the source of truth — always ensure it exists
    if body.self_assessed_level is not None or body.onboarding_completed is not None or "manual_level_override" in body.model_fields_set:
        if not exp:
            exp = UserExperienceProfile(user_email=user_email)
            db.add(exp)

        if body.onboarding_completed is not None:
            exp.onboarding_completed = body.onboarding_completed

        if body.self_assessed_level is not None:
            exp.self_assessed_level = body.self_assessed_level
            # On first onboarding, seed the real Auto level.
            if exp.initial_level == 1 and exp.current_level == 1:
                exp.initial_level = body.self_assessed_level
                exp.current_level = body.self_assessed_level
            # Sync Auto level to legacy UserProfile for backward compat.
            profile.current_level = exp.current_level

        if "manual_level_override" in body.model_fields_set:
            exp.manual_level_override = body.manual_level_override
            # Sync to legacy UserProfile for backward compat
            profile.manual_level_override = body.manual_level_override

    await db.commit()
    await db.refresh(profile)
    if exp:
        await db.refresh(exp)

    return _build_response(profile, exp)


DASHBOARD_HISTORY_LIMIT = 20


@limiter.limit("30/minute")
@router.get("/profile/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    request: Request,
    user_email: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """User-scoped dashboard: persisted profile state + recent adaptation decisions."""
    profile, exp = await _get_both(db, user_email)

    # Recent adaptation decisions
    decisions_stmt = (
        select(AdaptationDecision)
        .where(AdaptationDecision.user_email == user_email)
        .order_by(AdaptationDecision.created_at.desc())
        .limit(DASHBOARD_HISTORY_LIMIT)
    )
    decisions_result = await db.execute(decisions_stmt)
    decisions = decisions_result.scalars().all()

    decision_items = []
    for d in decisions:
        try:
            transition_reason = json.loads(d.transition_reason_json or "{}")
        except (json.JSONDecodeError, TypeError):
            transition_reason = {}
        decision_items.append(
            DashboardDecisionItem(
                rule_score=d.rule_score,
                rule_level=d.rule_level,
                ml_score=d.ml_score,
                ml_level=d.ml_level,
                final_level=d.final_level,
                auto_level=transition_reason.get("auto_level") or d.final_level,
                effective_ui_level=transition_reason.get("effective_ui_level") or d.final_level,
                manual_override_active=bool(transition_reason.get("manual_override_active")),
                confidence=d.confidence,
                transition_reason=transition_reason,
                created_at=d.created_at,
            )
        )

    if not exp:
        return DashboardResponse(recent_decisions=decision_items)

    level_history: list[int] = []
    try:
        level_history = json.loads(exp.level_history_json or "[]")
    except (json.JSONDecodeError, TypeError):
        pass

    profile_features: dict = {}
    try:
        profile_features = json.loads(exp.profile_features_json or "{}")
    except (json.JSONDecodeError, TypeError):
        pass

    auto_level = _auto_current_level(profile, exp)
    override = _manual_override(profile, exp)
    effective_level = override or auto_level

    return DashboardResponse(
        current_level=auto_level,
        auto_level=auto_level,
        effective_level=effective_level,
        manual_level_override=override,
        suggested_level=exp.suggested_level_last,
        self_assessed_level=exp.self_assessed_level,
        initial_level=exp.initial_level or 1,
        rule_score=exp.rule_score_last,
        ml_score=exp.ml_score_last,
        confidence=exp.confidence_last,
        profile_features=profile_features,
        level_history=level_history,
        recent_decisions=decision_items,
        updated_at=exp.updated_at,
    )


async def _count(db: AsyncSession, model, user_email: str) -> int:
    stmt = select(func.count()).select_from(model).where(model.user_email == user_email)
    result = await db.execute(stmt)
    return int(result.scalar() or 0)


def _to_iso_day(value: object) -> str | None:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, str):
        return value[:10]
    return None


@limiter.limit("30/minute")
@router.get("/profile/stats", response_model=AccountStatsResponse)
async def get_account_stats(
    request: Request,
    user_email: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """User-scoped counters for the settings page."""
    chats_count = await _count(db, ChatSession, user_email)
    projects_count = await _count(db, Project, user_email)
    templates_count = await _count(db, PromptTemplateDB, user_email)
    events_count = await _count(db, UserEvent, user_email)
    decisions_count = await _count(db, AdaptationDecision, user_email)

    # Messages count requires a join through ChatSession to stay user-scoped
    messages_stmt = (
        select(func.count(ChatMessage.id))
        .join(ChatSession, ChatMessage.session_id == ChatSession.id)
        .where(ChatSession.user_email == user_email)
    )
    messages_count = int((await db.execute(messages_stmt)).scalar() or 0)

    return AccountStatsResponse(
        chats_count=chats_count,
        messages_count=messages_count,
        projects_count=projects_count,
        templates_count=templates_count,
        events_count=events_count,
        decisions_count=decisions_count,
    )


@limiter.limit("30/minute")
@router.get("/profile/activity")
async def get_profile_activity(
    request: Request,
    user_email: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    range_days = 364
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    since = today - timedelta(days=range_days - 1)

    message_stmt = (
        select(sa_func.date(ChatMessage.created_at).label("day"), func.count(ChatMessage.id).label("count"))
        .join(ChatSession, ChatMessage.session_id == ChatSession.id)
        .where(
            ChatSession.user_email == user_email,
            ChatMessage.created_at >= since,
        )
        .group_by(sa_func.date(ChatMessage.created_at))
    )

    counts_by_day: dict[str, int] = {}
    total_messages = 0

    for row in (await db.execute(message_stmt)).all():
        day_key = _to_iso_day(row.day)
        if not day_key:
            continue
        count = int(row.count or 0)
        counts_by_day[day_key] = counts_by_day.get(day_key, 0) + count
        total_messages += count

    days = [
        {"date": day_key, "count": counts_by_day[day_key]}
        for day_key in sorted(counts_by_day.keys())
    ]

    return {
        "days": days,
        "total_active_days": sum(1 for count in counts_by_day.values() if count > 0),
        "total_events": total_messages,
        "total_messages": total_messages,
        "range_days": range_days,
    }


@limiter.limit("6/minute")
@router.delete("/profile/chats", response_model=BulkDeleteResponse)
async def delete_all_chats(
    request: Request,
    user_email: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete every chat session (and its messages via cascade) owned by user."""
    chat_ids_stmt = select(ChatSession.id).where(ChatSession.user_email == user_email)
    chat_ids = [row[0] for row in (await db.execute(chat_ids_stmt)).all()]

    if chat_ids:
        await db.execute(delete(ChatMessage).where(ChatMessage.session_id.in_(chat_ids)))
        await db.execute(delete(ChatSession).where(ChatSession.id.in_(chat_ids)))
        await db.commit()

    return BulkDeleteResponse(ok=True, deleted=len(chat_ids))


@limiter.limit("3/minute")
@router.delete("/profile/account", response_model=AccountDeletionResponse)
async def delete_account(
    request: Request,
    user_email: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete all user data. Irreversible."""
    deleted: dict[str, int] = {}

    chat_ids_stmt = select(ChatSession.id).where(ChatSession.user_email == user_email)
    chat_ids = [row[0] for row in (await db.execute(chat_ids_stmt)).all()]

    if chat_ids:
        result = await db.execute(delete(ChatMessage).where(ChatMessage.session_id.in_(chat_ids)))
        deleted["messages"] = int(result.rowcount or 0)

    scoped_models = [
        ("chats",                ChatSession),
        ("projects",             Project),
        ("templates",            PromptTemplateDB),
        ("events",               UserEvent),
        ("session_metrics",      SessionMetrics),
        ("interaction_logs",     InteractionLog),
        ("adaptation_decisions", AdaptationDecision),
        ("adaptation_feedback",  AdaptationFeedback),
        ("product_feedback",     ProductFeedback),
        ("ml_feedback",          MLFeedback),
        ("experience_profile",   UserExperienceProfile),
        ("profile",              UserProfile),
    ]

    for key, model in scoped_models:
        result = await db.execute(
            delete(model).where(model.user_email == user_email)
        )
        deleted[key] = int(result.rowcount or 0)

    await db.commit()

    return AccountDeletionResponse(ok=True, deleted=deleted)


@limiter.limit("60/minute")
@router.get("/profile/usage")
async def get_usage(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    from datetime import datetime, timezone, timedelta
    daily_used, daily_limit = await get_daily_usage(db, user_email)
    weekly_used, weekly_limit = await get_weekly_usage(db, user_email)
    now = datetime.now(timezone.utc)
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    days_until_monday = (7 - now.weekday()) % 7 or 7
    next_monday = (now + timedelta(days=days_until_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
    return {
        "daily": {
            "used": daily_used,
            "limit": daily_limit,
            "remaining": max(0, daily_limit - daily_used),
            "reset_at": tomorrow.isoformat(),
        },
        "weekly": {
            "used": weekly_used,
            "limit": weekly_limit,
            "remaining": max(0, weekly_limit - weekly_used),
            "reset_at": next_monday.isoformat(),
        },
        "date": _today_utc(),
    }


@limiter.limit("60/minute")
@router.get("/profile/usage/history")
async def get_usage_history_endpoint(
    request: Request,
    days: int = 30,
    page: int = 1,
    page_size: int = 10,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    page_size = min(max(1, page_size), 50)
    page = max(1, page)
    days = min(max(1, days), 365)
    return await get_usage_history(db, user_email, days=days, page=page, page_size=page_size)
