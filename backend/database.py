import json
import os
import uuid
from datetime import datetime, timezone

from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import sessionmaker, DeclarativeBase, relationship

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./orchestrator.db")

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


# ── Interaction scoring log ──────────────────────────────────────────

class InteractionLog(Base):
    __tablename__ = "interaction_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String(64), index=True, default="unknown")
    user_email = Column(String(255), index=True, default="anonymous")
    timestamp = Column(DateTime, default=_now)
    user_level = Column(Integer, default=1)
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


# ── User profile (hysteresis state) — keyed by user_email ────────────
# FIXED: was keyed by session_id, which reset on every page reload.
# Now keyed by user_email so the level persists across sessions.

class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_email = Column(String(255), primary_key=True)   # ← changed from session_id
    current_level = Column(Integer, default=1)
    level_history_json = Column(Text, default="[]")
    consecutive_high = Column(Integer, default=0)
    updated_at = Column(DateTime, default=_now, onupdate=_now)


# ── Chat history ────────────────────────────────────────────────────

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
    created_at = Column(DateTime, default=_now)
    metadata_json = Column(Text, default="{}")

    session = relationship("ChatSession", back_populates="messages")


# ── DB helpers ──────────────────────────────────────────────────────

def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def save_interaction(
    db,
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
    db.commit()
    return log