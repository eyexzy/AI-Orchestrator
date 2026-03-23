import asyncio
import json
import uuid
from datetime import datetime, timezone
import pytest
import pytest_asyncio
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from database import Base, InteractionLog, UserEvent, SessionMetrics, UserExperienceProfile, AdaptationFeedback, ChatSession, save_interaction
from services.aggregation import aggregate_session, aggregate_user_profile, run_aggregation_for_session
from services.events import save_event, save_events_batch

@pytest_asyncio.fixture()
async def db():
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        yield session
    await engine.dispose()
USER_EMAIL = 'test@example.com'
CHAT_ID = str(uuid.uuid4())

async def _create_chat(db: AsyncSession, chat_id: str=CHAT_ID) -> ChatSession:
    chat = ChatSession(id=chat_id, user_email=USER_EMAIL, title='Test Chat')
    db.add(chat)
    await db.flush()
    return chat

async def _emit_events(db: AsyncSession, session_id: str, chat_id: str, event_types: list[str]) -> None:
    for et in event_types:
        db.add(UserEvent(user_email=USER_EMAIL, session_id=session_id, chat_id=chat_id, event_type=et, event_context_json='{}', payload_json='{}'))
    await db.flush()

@pytest.mark.asyncio
async def test_multiple_sessions_same_chat_produce_separate_metrics(db: AsyncSession):
    await _create_chat(db)
    session_a = str(uuid.uuid4())
    session_b = str(uuid.uuid4())
    await save_interaction(db, session_id=session_a, chat_id=CHAT_ID, user_email=USER_EMAIL, user_level=1, prompt_text='Hello world', score=0.2, normalized=0.2, typing_speed=3.0)
    await _emit_events(db, session_a, CHAT_ID, ['prompt_submitted', 'prompt_submitted', 'tooltip_opened'])
    await save_interaction(db, session_id=session_b, chat_id=CHAT_ID, user_email=USER_EMAIL, user_level=2, prompt_text='Explain async generators in Python', score=0.6, normalized=0.6, typing_speed=5.5)
    await _emit_events(db, session_b, CHAT_ID, ['prompt_submitted', 'model_changed', 'system_prompt_edited'])
    sm_a = await aggregate_session(db, user_email=USER_EMAIL, session_id=session_a, chat_id=CHAT_ID)
    sm_b = await aggregate_session(db, user_email=USER_EMAIL, session_id=session_b, chat_id=CHAT_ID)
    await db.commit()
    assert sm_a.session_id == session_a
    assert sm_b.session_id == session_b
    assert sm_a.session_id != sm_b.session_id
    assert sm_a.chat_id == CHAT_ID
    assert sm_b.chat_id == CHAT_ID
    assert sm_a.tooltip_open_count == 1
    assert sm_b.tooltip_open_count == 0
    assert sm_b.advanced_actions_count == 2
    assert sm_a.advanced_actions_count == 0
    count_result = await db.execute(select(func.count(SessionMetrics.id)).where(SessionMetrics.user_email == USER_EMAIL))
    assert count_result.scalar() == 2

@pytest.mark.asyncio
async def test_user_profile_aggregation_uses_per_session_rows(db: AsyncSession):
    await _create_chat(db)
    sessions = [str(uuid.uuid4()) for _ in range(3)]
    for i, sid in enumerate(sessions):
        await save_interaction(db, session_id=sid, chat_id=CHAT_ID, user_email=USER_EMAIL, user_level=1, prompt_text=f'Prompt in session {i}', score=0.3, normalized=0.3, typing_speed=4.0)
        await _emit_events(db, sid, CHAT_ID, ['prompt_submitted'])
        await aggregate_session(db, user_email=USER_EMAIL, session_id=sid, chat_id=CHAT_ID)
    features = await aggregate_user_profile(db, user_email=USER_EMAIL)
    await db.commit()
    assert features['sessions_count'] == 3

@pytest.mark.asyncio
async def test_interaction_log_stores_both_ids(db: AsyncSession):
    await _create_chat(db)
    session_id = str(uuid.uuid4())
    log = await save_interaction(db, session_id=session_id, chat_id=CHAT_ID, user_email=USER_EMAIL, user_level=1, prompt_text='Test prompt', score=0.5, normalized=0.5, typing_speed=3.0)
    assert log.session_id == session_id
    assert log.chat_id == CHAT_ID
    assert log.session_id != log.chat_id

@pytest.mark.asyncio
async def test_events_store_both_ids(db: AsyncSession):
    await _create_chat(db)
    session_id = str(uuid.uuid4())
    event = await save_event(db, user_email=USER_EMAIL, session_id=session_id, chat_id=CHAT_ID, event_type='prompt_submitted', event_context={}, payload={})
    await db.commit()
    assert event.session_id == session_id
    assert event.chat_id == CHAT_ID
    assert event.session_id != event.chat_id

@pytest.mark.asyncio
async def test_full_pipeline_two_sessions_one_chat(db: AsyncSession):
    await _create_chat(db)
    s1 = str(uuid.uuid4())
    s2 = str(uuid.uuid4())
    await save_interaction(db, session_id=s1, chat_id=CHAT_ID, user_email=USER_EMAIL, user_level=1, prompt_text='What is Python?', score=0.15, normalized=0.15, typing_speed=2.0)
    await _emit_events(db, s1, CHAT_ID, ['prompt_submitted'])
    features1 = await run_aggregation_for_session(db, user_email=USER_EMAIL, session_id=s1, chat_id=CHAT_ID)
    assert features1['sessions_count'] == 1
    await save_interaction(db, session_id=s2, chat_id=CHAT_ID, user_email=USER_EMAIL, user_level=2, prompt_text='Explain metaclasses with __init_subclass__', score=0.7, normalized=0.7, typing_speed=6.0)
    await _emit_events(db, s2, CHAT_ID, ['prompt_submitted', 'system_prompt_edited', 'variable_added'])
    features2 = await run_aggregation_for_session(db, user_email=USER_EMAIL, session_id=s2, chat_id=CHAT_ID)
    assert features2['sessions_count'] == 2
    assert features2['advanced_actions_per_session'] > 0
    exp_result = await db.execute(select(UserExperienceProfile).where(UserExperienceProfile.user_email == USER_EMAIL))
    exp = exp_result.scalars().first()
    assert exp is not None
    stored_features = json.loads(exp.profile_features_json)
    assert stored_features['sessions_count'] == 2
