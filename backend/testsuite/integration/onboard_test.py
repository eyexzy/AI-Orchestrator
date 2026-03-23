import json
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from database import Base, UserProfile, UserExperienceProfile
from routers.profile import _build_response

@pytest_asyncio.fixture()
async def db():
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        yield session
    await engine.dispose()
USER = 'onb-test@example.com'

@pytest.mark.asyncio
async def test_fresh_user_onboarding_not_completed(db: AsyncSession):
    profile = UserProfile(user_email=USER)
    db.add(profile)
    await db.flush()
    resp = _build_response(profile, None)
    assert resp.onboarding_completed is False

@pytest.mark.asyncio
async def test_skip_persists_without_self_assessed_level(db: AsyncSession):
    profile = UserProfile(user_email=USER)
    exp = UserExperienceProfile(user_email=USER, onboarding_completed=True, self_assessed_level=None)
    db.add(profile)
    db.add(exp)
    await db.flush()
    resp = _build_response(profile, exp)
    assert resp.onboarding_completed is True
    assert resp.self_assessed_level is None

@pytest.mark.asyncio
async def test_completion_persists_with_self_assessed_level(db: AsyncSession):
    profile = UserProfile(user_email=USER)
    exp = UserExperienceProfile(user_email=USER, onboarding_completed=True, self_assessed_level=2, initial_level=2, current_level=2)
    db.add(profile)
    db.add(exp)
    await db.flush()
    resp = _build_response(profile, exp)
    assert resp.onboarding_completed is True
    assert resp.self_assessed_level == 2
    assert resp.current_level == 2

@pytest.mark.asyncio
async def test_self_assessed_level_alone_does_not_imply_onboarding(db: AsyncSession):
    profile = UserProfile(user_email=USER)
    exp = UserExperienceProfile(user_email=USER, self_assessed_level=3, onboarding_completed=False)
    db.add(profile)
    db.add(exp)
    await db.flush()
    resp = _build_response(profile, exp)
    assert resp.onboarding_completed is False
    assert resp.self_assessed_level == 3

@pytest.mark.asyncio
async def test_onboarding_completed_default_is_false(db: AsyncSession):
    exp = UserExperienceProfile(user_email=USER)
    db.add(exp)
    await db.flush()
    assert exp.onboarding_completed is False

@pytest.mark.asyncio
async def test_skip_round_trip_persisted(db: AsyncSession):
    profile = UserProfile(user_email=USER)
    exp = UserExperienceProfile(user_email=USER)
    db.add(profile)
    db.add(exp)
    await db.commit()
    exp.onboarding_completed = True
    await db.commit()
    await db.refresh(exp)
    assert exp.onboarding_completed is True
    resp = _build_response(profile, exp)
    assert resp.onboarding_completed is True
    assert resp.self_assessed_level is None
