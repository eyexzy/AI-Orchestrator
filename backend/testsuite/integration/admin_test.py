import csv
import io
import json
from datetime import datetime, timezone
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from database import Base, InteractionLog, MLFeedback, MLModelCache, ChatSession

@pytest_asyncio.fixture()
async def db():
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        yield session
    await engine.dispose()
USER = 'admin-test@example.com'
CHAT_ID = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff'
SESSION_ID = 'sess-1234'

async def _seed_interaction(db: AsyncSession, chat_id: str | None=CHAT_ID) -> InteractionLog:
    if chat_id:
        chat = ChatSession(id=chat_id, user_email=USER, title='Test')
        db.add(chat)
    log = InteractionLog(session_id=SESSION_ID, chat_id=chat_id, user_email=USER, user_level=2, prompt_text='Test prompt for admin export', score_awarded=5.5, normalized_score=0.37, typing_speed=4.2, metrics_json=json.dumps({'session_message_count': 3}))
    db.add(log)
    await db.flush()
    return log

class TestExportCsvFieldnames:

    def test_to_csv_row_contains_chat_id_key(self):
        log = InteractionLog(session_id='s1', chat_id='c1', user_email='x@y.com', user_level=1, prompt_text='hello', timestamp=datetime.now(timezone.utc))
        row = log.to_csv_row()
        assert 'ChatID' in row
        assert row['ChatID'] == 'c1'

    def test_csv_writer_accepts_to_csv_row(self):
        fieldnames = ['Timestamp', 'SessionID', 'ChatID', 'UserEmail', 'Level', 'Prompt', 'Score', 'NormalizedScore', 'TypingSpeed', 'Metrics']
        log = InteractionLog(session_id='s1', chat_id='c1', user_email='x@y.com', user_level=2, prompt_text='test', score_awarded=1.0, normalized_score=0.1, typing_speed=3.0, metrics_json='{}', timestamp=datetime.now(timezone.utc))
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerow(log.to_csv_row())
        output.seek(0)
        reader = csv.DictReader(output)
        rows = list(reader)
        assert len(rows) == 1
        assert rows[0]['ChatID'] == 'c1'
        assert rows[0]['SessionID'] == 's1'

    def test_csv_writer_without_chat_id_fieldname_raises(self):
        old_fieldnames = ['Timestamp', 'SessionID', 'UserEmail', 'Level', 'Prompt', 'Score', 'NormalizedScore', 'TypingSpeed', 'Metrics']
        log = InteractionLog(session_id='s1', chat_id='c1', user_email='x@y.com', user_level=1, prompt_text='test', score_awarded=0.0, normalized_score=0.0, typing_speed=0.0, metrics_json='{}', timestamp=datetime.now(timezone.utc))
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=old_fieldnames)
        with pytest.raises(ValueError, match='dict contains'):
            writer.writerow(log.to_csv_row())

    @pytest.mark.asyncio
    async def test_full_csv_export_with_chat_id(self, db: AsyncSession):
        log = await _seed_interaction(db)
        await db.commit()
        fieldnames = ['Timestamp', 'SessionID', 'ChatID', 'UserEmail', 'Level', 'Prompt', 'Score', 'NormalizedScore', 'TypingSpeed', 'Metrics']
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerow(log.to_csv_row())
        output.seek(0)
        reader = csv.DictReader(output)
        rows = list(reader)
        assert len(rows) == 1
        assert rows[0]['ChatID'] == CHAT_ID
        assert rows[0]['UserEmail'] == USER

class TestMlStatsImports:

    def test_has_structured_patterns_importable(self):
        from services.scoring import has_structured_patterns
        assert callable(has_structured_patterns)

    def test_has_structured_patterns_works(self):
        from services.scoring import has_structured_patterns
        assert has_structured_patterns("```python\nprint('hello')\n```") is True
        assert has_structured_patterns('simple text') is False

    def test_ml_classifier_importable(self):
        import ml_classifier
        assert hasattr(ml_classifier, 'ml_predict_batch')
        assert hasattr(ml_classifier, '_classifier')

    def test_ml_predict_batch_with_has_structured_patterns(self):
        import ml_classifier
        from services.scoring import has_structured_patterns
        if not ml_classifier._classifier.is_trained:
            ml_classifier._train_fresh()
        results = ml_classifier.ml_predict_batch(['Explain async generators in Python'], [{'session_message_count': 1, 'chars_per_second': 4.0}], has_structured_patterns)
        assert len(results) == 1
        level, conf = results[0]
        assert level in (1, 2, 3)
        assert 0.0 <= conf <= 1.0

    def test_admin_module_imports_resolve(self):
        import routers.admin as admin_mod
        assert hasattr(admin_mod, 'export_csv')
        assert hasattr(admin_mod, 'ml_stats')
        assert hasattr(admin_mod, 'has_structured_patterns')
        assert hasattr(admin_mod, 'ml_classifier')
