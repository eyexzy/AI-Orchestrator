import json
import uuid
import numpy as np
import pytest
import pytest_asyncio
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from database import Base, MLFeedback, ProductFeedback

@pytest_asyncio.fixture()
async def db():
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        yield session
    await engine.dispose()
USER = 'test-fb@example.com'

@pytest.mark.asyncio
async def test_product_feedback_stored_separately(db: AsyncSession):
    db.add(ProductFeedback(user_email=USER, session_id=str(uuid.uuid4()), mood='smile', feedback_text='Great app!'))
    await db.flush()
    pf_count = await db.execute(select(func.count(ProductFeedback.id)))
    assert pf_count.scalar() == 1
    ml_count = await db.execute(select(func.count(MLFeedback.id)))
    assert ml_count.scalar() == 0

@pytest.mark.asyncio
async def test_ml_feedback_untouched(db: AsyncSession):
    db.add(MLFeedback(user_email=USER, prompt_text='Explain Python decorators', prompt_length=28.0, word_count=3.0, tech_term_count=2.0, has_structure=0.0, chars_per_second=4.5, session_message_count=5.0, avg_prompt_length=30.0, used_advanced_features_count=0.0, tooltip_click_count=0.0, actual_level=2))
    await db.flush()
    ml_count = await db.execute(select(func.count(MLFeedback.id)))
    assert ml_count.scalar() == 1
    pf_count = await db.execute(select(func.count(ProductFeedback.id)))
    assert pf_count.scalar() == 0

@pytest.mark.asyncio
async def test_bronze_tier_excludes_product_feedback(db: AsyncSession):
    from dataset_builder import _build_bronze_samples
    db.add(ProductFeedback(user_email=USER, mood='sad', feedback_text='Too complex for me'))
    db.add(MLFeedback(user_email=USER, prompt_text='How to use asyncio.gather?', prompt_length=29.0, word_count=5.0, tech_term_count=2.0, has_structure=0.0, chars_per_second=3.0, session_message_count=3.0, avg_prompt_length=25.0, used_advanced_features_count=1.0, tooltip_click_count=0.0, actual_level=2))
    await db.flush()
    samples = await _build_bronze_samples(db)
    assert len(samples) == 1
    assert samples[0].prompt_text == 'How to use asyncio.gather?'
    assert samples[0].label == 2
    assert samples[0].tier == 'bronze'

@pytest.mark.asyncio
async def test_product_feedback_mood_only(db: AsyncSession):
    db.add(ProductFeedback(user_email=USER, session_id=str(uuid.uuid4()), mood='neutral', feedback_text=''))
    await db.flush()
    result = await db.execute(select(ProductFeedback).where(ProductFeedback.user_email == USER))
    row = result.scalars().first()
    assert row is not None
    assert row.mood == 'neutral'
    assert row.feedback_text == ''

@pytest.mark.asyncio
async def test_mixed_data_training_clean(db: AsyncSession):
    from dataset_builder import _build_bronze_samples
    for mood in ('sad', 'neutral', 'smile'):
        db.add(ProductFeedback(user_email=USER, mood=mood, feedback_text=f'Feeling {mood}'))
    for lvl in (1, 3):
        db.add(MLFeedback(user_email=USER, prompt_text=f'Prompt for level {lvl}', prompt_length=20.0, word_count=4.0, tech_term_count=1.0, has_structure=0.0, chars_per_second=3.0, session_message_count=2.0, avg_prompt_length=20.0, used_advanced_features_count=0.0, tooltip_click_count=0.0, actual_level=lvl))
    await db.flush()
    samples = await _build_bronze_samples(db)
    assert len(samples) == 2
    labels = {s.label for s in samples}
    assert labels == {1, 3}
    texts = {s.prompt_text for s in samples}
    assert all(('Feeling' not in t for t in texts))
