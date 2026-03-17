import json
import os
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import Boolean, Column, Integer, Float, String, DateTime, Text, ForeignKey
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, relationship

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

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_async_engine(DATABASE_URL, connect_args=_connect_args)
AsyncSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


# Interaction scoring log
class InteractionLog(Base):
    __tablename__ = "interaction_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String(64), index=True, default="unknown")
    user_email = Column(String(255), index=True, default="anonymous")
    timestamp = Column(DateTime, default=_now, index=True)
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
    updated_at = Column(DateTime, default=_now, onupdate=_now)


# Chat history

class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(String(36), primary_key=True, default=_uuid)
    user_email = Column(String(255), index=True, default="anonymous")
    title = Column(String(255), default="Новий чат")
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    messages = relationship(
        "ChatMessage",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at",
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(36), ForeignKey("chat_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    role = Column(String(16), nullable=False)
    content = Column(Text, default="")
    created_at = Column(DateTime, default=_now, index=True)
    metadata_json = Column(Text, default="{}")

    session = relationship("ChatSession", back_populates="messages")


# ML feedback (replaces ml_feedback.csv)

class MLFeedback(Base):
    __tablename__ = "ml_feedback"

    id = Column(Integer, primary_key=True, autoincrement=True)
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
    created_at = Column(DateTime, default=_now)


# ML model cache (replaces ml_model.json)

class PromptTemplateDB(Base):
    __tablename__ = "prompt_templates"

    id = Column(String(36), primary_key=True, default=_uuid)
    user_email = Column(String(255), index=True, default="anonymous")
    title = Column(String(255), default="")
    description = Column(Text, default="")
    category_name = Column(String(64), default="")
    category_color = Column(String(32), default="blue")
    prompt = Column(Text, default="")
    system_message = Column(Text, default="")
    variables_json = Column(Text, default="[]")
    is_favorite = Column(Boolean, default=False)
    order_index = Column(Integer, default=0)
    created_at = Column(DateTime, default=_now)


class MLModelCache(Base):
    __tablename__ = "ml_model_cache"

    id = Column(Integer, primary_key=True, default=1)
    weights_json = Column(Text, nullable=False)
    model_type = Column(String(64), default="LogisticRegression")
    accuracy = Column(Float, default=0.0)
    f1_score = Column(Float, default=0.0)
    classification_report_json = Column(Text, default="{}")
    samples_used = Column(Integer, default=0)
    updated_at = Column(DateTime, default=_now, onupdate=_now)


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
):
    log = InteractionLog(
        session_id=session_id,
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