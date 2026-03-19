import json

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import UserProfile
from dependencies import limiter, get_db, get_current_user
from schemas.api import ProfilePreferencesUpdate, ProfilePreferencesResponse

router = APIRouter()

MIN_USER_LEVEL = 1


def _effective_current_level(profile: UserProfile | None) -> int:
    if not profile:
        return MIN_USER_LEVEL
    if profile.manual_level_override in (1, 2, 3):
        return profile.manual_level_override
    return profile.current_level or MIN_USER_LEVEL


@limiter.limit("30/minute")
@router.get("/profile/preferences", response_model=ProfilePreferencesResponse)
async def get_preferences(
    request: Request,
    user_email: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(UserProfile).where(UserProfile.user_email == user_email))
    profile = result.scalars().first()
    if not profile:
        return ProfilePreferencesResponse(
            theme="system",
            language="en",
            current_level=MIN_USER_LEVEL,
            manual_level_override=None,
            hidden_templates=[],
        )
    return ProfilePreferencesResponse(
        theme=profile.theme or "system",
        language=profile.language or "en",
        current_level=_effective_current_level(profile),
        manual_level_override=profile.manual_level_override,
        hidden_templates=json.loads(profile.hidden_templates_json or "[]"),
    )


@limiter.limit("30/minute")
@router.patch("/profile/preferences", response_model=ProfilePreferencesResponse)
async def update_preferences(
    request: Request,
    body: ProfilePreferencesUpdate,
    user_email: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(UserProfile).where(UserProfile.user_email == user_email))
    profile = result.scalars().first()
    if not profile:
        profile = UserProfile(user_email=user_email)
        db.add(profile)

    if body.theme is not None:
        profile.theme = body.theme
    if body.language is not None:
        profile.language = body.language
    if "manual_level_override" in body.model_fields_set:
        profile.manual_level_override = body.manual_level_override
    if body.hidden_templates is not None:
        profile.hidden_templates_json = json.dumps(body.hidden_templates)

    await db.commit()
    await db.refresh(profile)

    return ProfilePreferencesResponse(
        theme=profile.theme or "system",
        language=profile.language or "en",
        current_level=_effective_current_level(profile),
        manual_level_override=profile.manual_level_override,
        hidden_templates=json.loads(profile.hidden_templates_json or "[]"),
    )