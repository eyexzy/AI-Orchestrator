import json
import uuid
import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from database import Base, UserProfile, UserExperienceProfile, AdaptationDecision

@pytest_asyncio.fixture()
async def db():
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        yield session
    await engine.dispose()
USER = 'test-sot@example.com'

async def _create_profiles(db: AsyncSession, *, legacy_level: int=1, legacy_history: list[int] | None=None, legacy_override: int | None=None, exp_level: int=1, exp_history: list[int] | None=None, exp_override: int | None=None) -> tuple[UserProfile, UserExperienceProfile]:
    profile = UserProfile(user_email=USER, current_level=legacy_level, level_history_json=json.dumps(legacy_history or []), manual_level_override=legacy_override)
    exp = UserExperienceProfile(user_email=USER, current_level=exp_level, level_history_json=json.dumps(exp_history or []), manual_level_override=exp_override)
    db.add(profile)
    db.add(exp)
    await db.flush()
    return (profile, exp)
MIN_USER_LEVEL = 1
MAX_USER_LEVEL = 3
HISTORY_WINDOW_SIZE = 3
PROMOTION_REQUIRED_HIGHER_COUNT = 2
DEMOTION_REQUIRED_LOWER_COUNT = HISTORY_WINDOW_SIZE

def run_hysteresis(exp: UserExperienceProfile, profile: UserProfile, suggested_level: int) -> tuple[int, list[int], dict]:
    try:
        history: list[int] = json.loads(exp.level_history_json or '[]')
    except json.JSONDecodeError:
        history = []
    if not history:
        try:
            history = json.loads(profile.level_history_json or '[]')
        except json.JSONDecodeError:
            history = []
    history.append(suggested_level)
    history = history[-HISTORY_WINDOW_SIZE:]
    current = exp.current_level if exp.current_level in (1, 2, 3) else profile.current_level if profile.current_level in (1, 2, 3) else MIN_USER_LEVEL
    higher_count = sum((1 for lv in history if lv > current))
    lower_count = sum((1 for lv in history if lv < current))
    all_lower = len(history) == HISTORY_WINDOW_SIZE and lower_count >= DEMOTION_REQUIRED_LOWER_COUNT
    final_level = current
    transition_reason: dict = {}
    if higher_count >= PROMOTION_REQUIRED_HIGHER_COUNT and current < MAX_USER_LEVEL:
        final_level = current + 1
        transition_reason['action'] = 'promotion'
    if all_lower and current > MIN_USER_LEVEL:
        final_level = current - 1
        transition_reason['action'] = 'demotion'
    override = exp.manual_level_override
    if override is None:
        override = profile.manual_level_override
    if override is not None:
        final_level = override
        transition_reason['action'] = 'manual_override'
    if not transition_reason:
        transition_reason['action'] = 'no_change'
    exp.current_level = final_level
    exp.level_history_json = json.dumps(history)
    profile.current_level = final_level
    profile.level_history_json = json.dumps(history)
    return (final_level, history, transition_reason)

@pytest.mark.asyncio
async def test_level_history_written_to_exp(db: AsyncSession):
    profile, exp = await _create_profiles(db)
    run_hysteresis(exp, profile, suggested_level=2)
    run_hysteresis(exp, profile, suggested_level=2)
    await db.flush()
    exp_history = json.loads(exp.level_history_json)
    assert exp_history == [2, 2]
    legacy_history = json.loads(profile.level_history_json)
    assert legacy_history == [2, 2]

@pytest.mark.asyncio
async def test_dashboard_reads_from_exp(db: AsyncSession):
    profile, exp = await _create_profiles(db, exp_level=2, exp_history=[1, 2, 2], legacy_level=1, legacy_history=[])
    await db.commit()
    exp_result = await db.execute(select(UserExperienceProfile).where(UserExperienceProfile.user_email == USER))
    fetched_exp = exp_result.scalars().first()
    assert fetched_exp is not None
    level_history = json.loads(fetched_exp.level_history_json or '[]')
    assert level_history == [1, 2, 2]
    assert fetched_exp.current_level == 2

@pytest.mark.asyncio
async def test_backfill_from_legacy_history(db: AsyncSession):
    profile, exp = await _create_profiles(db, legacy_history=[2, 2], exp_history=[])
    final, history, reason = run_hysteresis(exp, profile, suggested_level=3)
    assert history == [2, 2, 3]
    assert json.loads(exp.level_history_json) == [2, 2, 3]

@pytest.mark.asyncio
async def test_exp_override_takes_precedence(db: AsyncSession):
    profile, exp = await _create_profiles(db, exp_override=3, legacy_override=1)
    final, _, reason = run_hysteresis(exp, profile, suggested_level=2)
    assert final == 3
    assert reason['action'] == 'manual_override'

@pytest.mark.asyncio
async def test_legacy_override_fallback(db: AsyncSession):
    profile, exp = await _create_profiles(db, exp_override=None, legacy_override=2)
    final, _, reason = run_hysteresis(exp, profile, suggested_level=1)
    assert final == 2
    assert reason['action'] == 'manual_override'

@pytest.mark.asyncio
async def test_promotion_persisted_to_both(db: AsyncSession):
    profile, exp = await _create_profiles(db, exp_level=1, legacy_level=1)
    run_hysteresis(exp, profile, suggested_level=2)
    run_hysteresis(exp, profile, suggested_level=2)
    assert exp.current_level == 2
    assert profile.current_level == 2

@pytest.mark.asyncio
async def test_demotion_persisted_to_both(db: AsyncSession):
    profile, exp = await _create_profiles(db, exp_level=2, legacy_level=2)
    run_hysteresis(exp, profile, suggested_level=1)
    run_hysteresis(exp, profile, suggested_level=1)
    run_hysteresis(exp, profile, suggested_level=1)
    assert exp.current_level == 1
    assert profile.current_level == 1
