import json
import os
import uuid
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, relationship


def _get_env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


# Build async-compatible DATABASE_URL
_raw_url = os.getenv("DATABASE_URL", "")

if _raw_url.startswith("postgresql://"):
    DATABASE_URL = _raw_url.replace("postgresql://", "postgresql+asyncpg://", 1)
elif _raw_url.startswith("postgresql+asyncpg://"):
    DATABASE_URL = _raw_url
elif _raw_url:
    DATABASE_URL = _raw_url
else:
    DATABASE_URL = "sqlite+aiosqlite:///./orchestrator.db"

DATABASE_URL = DATABASE_URL.replace("sslmode=", "ssl=")

# asyncpg doesn't support channel_binding as a connect() kwarg — strip it
import re
DATABASE_URL = re.sub(r"[&?]channel_binding=[^&]*", "", DATABASE_URL)


def _ensure_asyncpg_stable_url(url: str) -> str:
    """Harden asyncpg against stale prepared statements after schema changes.

    SQLAlchemy's asyncpg dialect caches prepared statements by default. After
    Alembic migrations / DDL changes this can surface as InvalidCachedStatementError
    on live requests. Disable the cache unless the URL already specifies a value.
    Official docs:
    https://docs.sqlalchemy.org/20/dialects/postgresql.html#prepared-statement-cache
    """
    if not url.startswith("postgresql+asyncpg://"):
        return url

    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query.setdefault("prepared_statement_cache_size", "0")
    return urlunsplit(parts._replace(query=urlencode(query)))


DATABASE_URL = _ensure_asyncpg_stable_url(DATABASE_URL)

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
ENGINE_RUNTIME_CONFIG = {
    "db_backend": "sqlite" if DATABASE_URL.startswith("sqlite") else "postgresql",
    "pool_pre_ping": not DATABASE_URL.startswith("sqlite"),
    "pool_use_lifo": not DATABASE_URL.startswith("sqlite"),
    "pool_size": _get_env_int("DB_POOL_SIZE", 10),
    "max_overflow": _get_env_int("DB_MAX_OVERFLOW", 20),
    "pool_timeout": _get_env_int("DB_POOL_TIMEOUT_SECONDS", 30),
    "pool_recycle": _get_env_int("DB_POOL_RECYCLE_SECONDS", 1800),
}

_engine_kwargs = {"connect_args": _connect_args} if _connect_args else {}
if not DATABASE_URL.startswith("sqlite"):
    _engine_kwargs.update(
        {
            "pool_pre_ping": ENGINE_RUNTIME_CONFIG["pool_pre_ping"],
            "pool_use_lifo": ENGINE_RUNTIME_CONFIG["pool_use_lifo"],
            "pool_size": ENGINE_RUNTIME_CONFIG["pool_size"],
            "max_overflow": ENGINE_RUNTIME_CONFIG["max_overflow"],
            "pool_timeout": ENGINE_RUNTIME_CONFIG["pool_timeout"],
            "pool_recycle": ENGINE_RUNTIME_CONFIG["pool_recycle"],
        }
    )

engine = create_async_engine(DATABASE_URL, **_engine_kwargs)
AsyncSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


# Interaction scoring log
class InteractionLog(Base):
    __tablename__ = "interaction_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    # session_id is a plain behavioral-session UUID (NOT a FK to chat_sessions).
    # One chat can have many sessions (one per page-visit / app-open).
    session_id = Column(String(64), index=True, nullable=True, default="unknown")
    # chat_id links back to the persistent chat thread for correlation.
    chat_id = Column(String(36), ForeignKey("chat_sessions.id", ondelete="SET NULL"), index=True, nullable=True)
    user_email = Column(String(255), index=True, default="anonymous")
    timestamp = Column(DateTime(timezone=True), default=_now, index=True)
    user_level = Column(Integer, default=1, index=True)
    prompt_text = Column(Text, default="")
    score_awarded = Column(Float, default=0.0)
    normalized_score = Column(Float, default=0.0)
    typing_speed = Column(Float, default=0.0)
    metrics_json = Column(Text, default="{}")

    def to_csv_row(self) -> dict:
        return {
            "Timestamp": self.timestamp.isoformat() if self.timestamp else "",
            "SessionID": self.session_id or "",
            "ChatID": self.chat_id or "",
            "UserEmail": self.user_email or "",
            "Level": self.user_level,
            "Prompt": (self.prompt_text or "").replace("\n", " "),
            "Score": self.score_awarded,
            "NormalizedScore": self.normalized_score,
            "TypingSpeed": self.typing_speed,
            "Metrics": self.metrics_json or "{}",
        }


# User profile (hysteresis state) — keyed by user_email

class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_email = Column(String(255), primary_key=True)
    current_level = Column(Integer, default=1)
    level_history_json = Column(Text, default="[]")
    theme = Column(String(32), default="system")
    language = Column(String(8), default="en")
    manual_level_override = Column(Integer, nullable=True)
    hidden_templates_json = Column(Text, default="[]")
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


# Chat history

class ChatSession(Base):
    __tablename__ = "chat_sessions"
    __table_args__ = (
        Index("ix_chat_sessions_user_email_updated_at", "user_email", "updated_at"),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    user_email = Column(String(255), index=True, default="anonymous")
    title = Column(String(255), default="Новий чат")
    is_favorite = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    messages = relationship(
        "ChatMessage",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at",
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        Index("ix_chat_messages_session_id_created_at", "session_id", "created_at"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(36), ForeignKey("chat_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    role = Column(String(16), nullable=False)
    content = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), default=_now, index=True)
    metadata_json = Column(Text, default="{}")

    session = relationship("ChatSession", back_populates="messages")


# ML feedback (replaces ml_feedback.csv)

class MLFeedback(Base):
    __tablename__ = "ml_feedback"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_email = Column(String(255), index=True, nullable=False, default="anonymous")
    prompt_text = Column(Text, default="")
    prompt_length = Column(Float, default=0.0)
    word_count = Column(Float, default=0.0)
    tech_term_count = Column(Float, default=0.0)
    has_structure = Column(Float, default=0.0)
    chars_per_second = Column(Float, default=0.0)
    session_message_count = Column(Float, default=0.0)
    avg_prompt_length = Column(Float, default=0.0)
    used_advanced_features_count = Column(Float, default=0.0)
    tooltip_click_count = Column(Float, default=0.0)
    actual_level = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)


# Product feedback (mood / free-text from FeedbackModal — NOT for ML training)

class ProductFeedback(Base):
    __tablename__ = "product_feedback"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_email = Column(String(255), index=True, nullable=False, default="anonymous")
    session_id = Column(String(36), nullable=True)
    mood = Column(String(16), nullable=True)  # "sad" | "neutral" | "smile"
    feedback_text = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), default=_now)


# ML model cache (replaces ml_model.json)

class PromptTemplateDB(Base):
    __tablename__ = "prompt_templates"
    __table_args__ = (
        Index("ix_prompt_templates_user_email_order_index", "user_email", "order_index"),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    user_email = Column(String(255), primary_key=True, index=True, nullable=False, default="anonymous")
    title = Column(String(255), default="")
    description = Column(Text, default="")
    category_name = Column(String(64), default="", index=True)
    category_color = Column(String(32), default="blue")
    prompt = Column(Text, default="")
    system_message = Column(Text, default="")
    variables_json = Column(Text, default="[]")
    is_favorite = Column(Boolean, default=False)
    order_index = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=_now, index=True)


class MLModelCache(Base):
    __tablename__ = "ml_model_cache"
    __table_args__ = (
        Index("ix_ml_model_cache_updated_at_id", "updated_at", "id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    weights_json = Column(Text, nullable=False)
    model_type = Column(String(64), default="LogisticRegression")
    accuracy = Column(Float, default=0.0)
    f1_score = Column(Float, default=0.0)
    classification_report_json = Column(Text, default="{}")
    samples_used = Column(Integer, default=0)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


# Raw user behavioral events (Layer 1)

class UserEvent(Base):
    __tablename__ = "user_events"
    __table_args__ = (
        Index("ix_user_events_user_email_created_at", "user_email", "created_at"),
        Index("ix_user_events_session_event_type", "session_id", "event_type"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_email = Column(String(255), index=True, nullable=False, default="anonymous")
    session_id = Column(String(64), index=True, nullable=True)
    chat_id = Column(String(36), ForeignKey("chat_sessions.id", ondelete="SET NULL"), index=True, nullable=True)
    event_type = Column(String(64), nullable=False, index=True)
    event_context_json = Column(Text, default="{}")
    payload_json = Column(Text, default="{}")
    created_at = Column(DateTime(timezone=True), default=_now, index=True)


# Session-level aggregated metrics (Layer 2)

class SessionMetrics(Base):
    __tablename__ = "session_metrics"
    __table_args__ = (
        Index("ix_session_metrics_user_email_created_at", "user_email", "created_at"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_email = Column(String(255), index=True, nullable=False, default="anonymous")
    session_id = Column(String(64), index=True, nullable=True)
    chat_id = Column(String(36), ForeignKey("chat_sessions.id", ondelete="SET NULL"), index=True, nullable=True)
    prompts_count = Column(Integer, default=0)
    avg_prompt_length = Column(Float, default=0.0)
    median_prompt_length = Column(Float, default=0.0)
    structured_prompt_ratio = Column(Float, default=0.0)
    help_open_count = Column(Integer, default=0)
    tooltip_open_count = Column(Integer, default=0)
    refine_accept_count = Column(Integer, default=0)
    refine_reject_count = Column(Integer, default=0)
    advanced_actions_count = Column(Integer, default=0)
    cancel_actions_count = Column(Integer, default=0)
    backtracking_count = Column(Integer, default=0)
    session_duration_seconds = Column(Float, default=0.0)
    task_success_proxy = Column(Float, default=0.0)
    created_at = Column(DateTime(timezone=True), default=_now, index=True)


# User experience profile — user-level aggregates (Layer 3)

class UserExperienceProfile(Base):
    __tablename__ = "user_experience_profile"

    user_email = Column(String(255), primary_key=True)
    self_assessed_level = Column(Integer, nullable=True)
    initial_level = Column(Integer, default=1)
    current_level = Column(Integer, default=1)
    suggested_level_last = Column(Integer, nullable=True)
    rule_score_last = Column(Float, nullable=True)
    ml_score_last = Column(Float, nullable=True)
    confidence_last = Column(Float, nullable=True)
    manual_level_override = Column(Integer, nullable=True)
    onboarding_completed = Column(Boolean, default=False, nullable=False, server_default="0")
    profile_features_json = Column(Text, default="{}")
    level_history_json = Column(Text, default="[]")
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


# Explicit adaptation feedback from users

class AdaptationFeedback(Base):
    __tablename__ = "adaptation_feedback"
    __table_args__ = (
        Index("ix_adaptation_feedback_user_email_created_at", "user_email", "created_at"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_email = Column(String(255), index=True, nullable=False, default="anonymous")
    session_id = Column(String(64), index=True, nullable=True)
    chat_id = Column(String(36), ForeignKey("chat_sessions.id", ondelete="SET NULL"), index=True, nullable=True)
    ui_level_at_time = Column(Integer, nullable=True)
    suggested_level_at_time = Column(Integer, nullable=True)
    question_type = Column(String(64), nullable=False)
    answer_value = Column(String(255), nullable=False)
    feature_snapshot_json = Column(Text, default="{}")
    created_at = Column(DateTime(timezone=True), default=_now, index=True)


# Full adaptation decision log (Layer 6)

class AdaptationDecision(Base):
    __tablename__ = "adaptation_decisions"
    __table_args__ = (
        Index("ix_adaptation_decisions_user_email_created_at", "user_email", "created_at"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_email = Column(String(255), index=True, nullable=False, default="anonymous")
    session_id = Column(String(64), index=True, nullable=True)
    chat_id = Column(String(36), ForeignKey("chat_sessions.id", ondelete="SET NULL"), index=True, nullable=True)
    rule_score = Column(Float, nullable=True)
    rule_level = Column(Integer, nullable=True)
    ml_score = Column(Float, nullable=True)
    ml_level = Column(Integer, nullable=True)
    ml_confidence = Column(Float, nullable=True)
    final_level = Column(Integer, nullable=False)
    confidence = Column(Float, nullable=True)
    transition_applied = Column(Boolean, default=False)
    transition_reason_json = Column(Text, default="{}")
    rule_breakdown_json = Column(Text, default="{}")
    created_at = Column(DateTime(timezone=True), default=_now, index=True)


# DB helpers

async def init_db():
    """Initialize database connection. Schema is managed by Alembic migrations.
    Run: cd backend && alembic upgrade head
    """
    # Verify the engine can connect
    async with engine.begin():
        pass


async def get_db():
    async with AsyncSessionLocal() as db:
        try:
            yield db
        finally:
            await db.close()


async def save_interaction(
    db: AsyncSession,
    session_id: str,
    user_email: str,
    user_level: int,
    prompt_text: str,
    score: float,
    normalized: float,
    typing_speed: float,
    metrics: dict | None = None,
    chat_id: str | None = None,
):
    log = InteractionLog(
        session_id=session_id,
        chat_id=chat_id,
        user_email=user_email,
        user_level=user_level,
        prompt_text=prompt_text,
        score_awarded=score,
        normalized_score=normalized,
        typing_speed=typing_speed,
        metrics_json=json.dumps(metrics or {}, ensure_ascii=False),
    )
    db.add(log)
    await db.commit()
    return log


async def save_adaptation_decision(
    db: AsyncSession,
    user_email: str,
    session_id: str | None,
    chat_id: str | None,
    rule_score: float,
    rule_level: int,
    ml_score: float | None,
    ml_level: int | None,
    ml_confidence: float | None,
    final_level: int,
    previous_level: int,
    confidence: float,
    transition_reason: dict | None = None,
    rule_breakdown: list | None = None,
):
    decision = AdaptationDecision(
        user_email=user_email,
        session_id=session_id,
        chat_id=chat_id,
        rule_score=rule_score,
        rule_level=rule_level,
        ml_score=ml_score,
        ml_level=ml_level,
        ml_confidence=ml_confidence,
        final_level=final_level,
        confidence=confidence,
        transition_applied=(final_level != previous_level),
        transition_reason_json=json.dumps(transition_reason or {}, ensure_ascii=False),
        rule_breakdown_json=json.dumps(rule_breakdown or [], ensure_ascii=False),
    )
    db.add(decision)
    await db.commit()
    return decision
