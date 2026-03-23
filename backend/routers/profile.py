import json

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import UserProfile, UserExperienceProfile, AdaptationDecision
from dependencies import limiter, get_db, get_current_user
from schemas.api import (
    ProfilePreferencesUpdate,
    ProfilePreferencesResponse,
    DashboardResponse,
    DashboardDecisionItem,
)

router = APIRouter()

MIN_USER_LEVEL = 1


def _effective_current_level(
    profile: UserProfile | None,
    exp: UserExperienceProfile | None,
) -> int:
    # Manual override wins
    override = None
    if exp and exp.manual_level_override in (1, 2, 3):
        override = exp.manual_level_override
    elif profile and profile.manual_level_override in (1, 2, 3):
        override = profile.manual_level_override
    if override:
        return override

    # Experience profile is the source of truth
    if exp and exp.current_level in (1, 2, 3):
        return exp.current_level

    # Fall back to legacy profile
    if profile and profile.current_level in (1, 2, 3):
        return profile.current_level

    return MIN_USER_LEVEL


def _build_response(
    profile: UserProfile | None,
    exp: UserExperienceProfile | None,
) -> ProfilePreferencesResponse:
    level = _effective_current_level(profile, exp)

    # manual_level_override: exp is source of truth, legacy profile is fallback
    override = exp.manual_level_override if exp else None
    if override is None and profile:
        override = profile.manual_level_override

    return ProfilePreferencesResponse(
        theme=(profile.theme if profile else None) or "system",
        language=(profile.language if profile else None) or "en",
        current_level=level,
        initial_level=exp.initial_level if exp else MIN_USER_LEVEL,
        self_assessed_level=exp.self_assessed_level if exp else None,
        manual_level_override=override,
        onboarding_completed=bool(exp and exp.onboarding_completed),
        hidden_templates=json.loads(
            (profile.hidden_templates_json if profile else None) or "[]"
        ),
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
            # On first onboarding, set initial_level and current_level
            if exp.initial_level == 1 and exp.current_level == 1:
                exp.initial_level = body.self_assessed_level
                exp.current_level = body.self_assessed_level
            # Sync to legacy UserProfile for backward compat
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
    _, exp = await _get_both(db, user_email)

    # Recent adaptation decisions
    decisions_stmt = (
        select(AdaptationDecision)
        .where(AdaptationDecision.user_email == user_email)
        .order_by(AdaptationDecision.created_at.desc())
        .limit(DASHBOARD_HISTORY_LIMIT)
    )
    decisions_result = await db.execute(decisions_stmt)
    decisions = decisions_result.scalars().all()

    decision_items = [
        DashboardDecisionItem(
            rule_score=d.rule_score,
            rule_level=d.rule_level,
            ml_score=d.ml_score,
            ml_level=d.ml_level,
            final_level=d.final_level,
            confidence=d.confidence,
            transition_reason=json.loads(d.transition_reason_json or "{}"),
            created_at=d.created_at,
        )
        for d in decisions
    ]

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

    return DashboardResponse(
        current_level=exp.current_level or 1,
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