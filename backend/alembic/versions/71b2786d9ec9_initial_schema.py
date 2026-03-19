"""initial schema

Revision ID: 71b2786d9ec9
Revises:
Create Date: 2026-03-17 04:48:36.115994
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '71b2786d9ec9'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _has_column(table_name: str, column_name: str) -> bool:
    if not _has_table(table_name):
        return False
    columns = sa.inspect(op.get_bind()).get_columns(table_name)
    return any(column["name"] == column_name for column in columns)


def _has_index(table_name: str, index_name: str) -> bool:
    if not _has_table(table_name):
        return False
    indexes = sa.inspect(op.get_bind()).get_indexes(table_name)
    return any(index["name"] == index_name for index in indexes)


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str]) -> None:
    if not _has_index(table_name, index_name):
        op.create_index(index_name, table_name, columns, unique=False)


def upgrade() -> None:
    if not _has_table("user_profiles"):
        op.create_table(
            "user_profiles",
            sa.Column("user_email", sa.String(length=255), nullable=False),
            sa.Column("current_level", sa.Integer(), nullable=True),
            sa.Column("level_history_json", sa.Text(), nullable=True),
            sa.Column("theme", sa.String(length=32), nullable=True),
            sa.Column("language", sa.String(length=8), nullable=True),
            sa.Column("manual_level_override", sa.Integer(), nullable=True),
            sa.Column("hidden_templates_json", sa.Text(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("user_email"),
        )

    if not _has_table("chat_sessions"):
        op.create_table(
            "chat_sessions",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_email", sa.String(length=255), nullable=True),
            sa.Column("title", sa.String(length=255), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _has_table("chat_messages"):
        op.create_table(
            "chat_messages",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("session_id", sa.String(length=36), nullable=False),
            sa.Column("role", sa.String(length=16), nullable=False),
            sa.Column("content", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("metadata_json", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["session_id"], ["chat_sessions.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _has_table("interaction_logs"):
        op.create_table(
            "interaction_logs",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("session_id", sa.String(length=64), nullable=True),
            sa.Column("user_email", sa.String(length=255), nullable=True),
            sa.Column("timestamp", sa.DateTime(timezone=True), nullable=True),
            sa.Column("user_level", sa.Integer(), nullable=True),
            sa.Column("prompt_text", sa.Text(), nullable=True),
            sa.Column("score_awarded", sa.Float(), nullable=True),
            sa.Column("normalized_score", sa.Float(), nullable=True),
            sa.Column("typing_speed", sa.Float(), nullable=True),
            sa.Column("metrics_json", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["session_id"], ["chat_sessions.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _has_table("ml_feedback"):
        op.create_table(
            "ml_feedback",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("prompt_text", sa.Text(), nullable=True),
            sa.Column("prompt_length", sa.Float(), nullable=True),
            sa.Column("word_count", sa.Float(), nullable=True),
            sa.Column("tech_term_count", sa.Float(), nullable=True),
            sa.Column("has_structure", sa.Float(), nullable=True),
            sa.Column("chars_per_second", sa.Float(), nullable=True),
            sa.Column("session_message_count", sa.Float(), nullable=True),
            sa.Column("avg_prompt_length", sa.Float(), nullable=True),
            sa.Column("used_advanced_features_count", sa.Float(), nullable=True),
            sa.Column("tooltip_click_count", sa.Float(), nullable=True),
            sa.Column("actual_level", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _has_table("prompt_templates"):
        op.create_table(
            "prompt_templates",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_email", sa.String(length=255), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("category_name", sa.String(length=64), nullable=True),
            sa.Column("category_color", sa.String(length=32), nullable=True),
            sa.Column("prompt", sa.Text(), nullable=True),
            sa.Column("system_message", sa.Text(), nullable=True),
            sa.Column("variables_json", sa.Text(), nullable=True),
            sa.Column("is_favorite", sa.Boolean(), nullable=True),
            sa.Column("order_index", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id", "user_email"),
        )

    if not _has_table("ml_model_cache"):
        op.create_table(
            "ml_model_cache",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("weights_json", sa.Text(), nullable=False),
            sa.Column("model_type", sa.String(length=64), nullable=True),
            sa.Column("accuracy", sa.Float(), nullable=True),
            sa.Column("f1_score", sa.Float(), nullable=True),
            sa.Column("classification_report_json", sa.Text(), nullable=True),
            sa.Column("samples_used", sa.Integer(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )

    _create_index_if_missing(op.f("ix_chat_messages_created_at"), "chat_messages", ["created_at"])
    _create_index_if_missing(op.f("ix_chat_messages_session_id"), "chat_messages", ["session_id"])
    _create_index_if_missing(op.f("ix_chat_sessions_user_email"), "chat_sessions", ["user_email"])
    _create_index_if_missing(op.f("ix_interaction_logs_session_id"), "interaction_logs", ["session_id"])
    _create_index_if_missing(op.f("ix_interaction_logs_timestamp"), "interaction_logs", ["timestamp"])
    _create_index_if_missing(op.f("ix_interaction_logs_user_email"), "interaction_logs", ["user_email"])
    _create_index_if_missing(op.f("ix_interaction_logs_user_level"), "interaction_logs", ["user_level"])
    _create_index_if_missing(op.f("ix_prompt_templates_user_email"), "prompt_templates", ["user_email"])

    if _has_column("user_profiles", "consecutive_high"):
        op.drop_column("user_profiles", "consecutive_high")


def downgrade() -> None:
    if _has_table("user_profiles") and not _has_column("user_profiles", "consecutive_high"):
        op.add_column(
            "user_profiles",
            sa.Column("consecutive_high", sa.Integer(), autoincrement=False, nullable=True),
        )

    if _has_index("interaction_logs", op.f("ix_interaction_logs_user_level")):
        op.drop_index(op.f("ix_interaction_logs_user_level"), table_name="interaction_logs")
    if _has_index("interaction_logs", op.f("ix_interaction_logs_user_email")):
        op.drop_index(op.f("ix_interaction_logs_user_email"), table_name="interaction_logs")
    if _has_index("interaction_logs", op.f("ix_interaction_logs_timestamp")):
        op.drop_index(op.f("ix_interaction_logs_timestamp"), table_name="interaction_logs")
    if _has_index("interaction_logs", op.f("ix_interaction_logs_session_id")):
        op.drop_index(op.f("ix_interaction_logs_session_id"), table_name="interaction_logs")
    if _has_index("chat_sessions", op.f("ix_chat_sessions_user_email")):
        op.drop_index(op.f("ix_chat_sessions_user_email"), table_name="chat_sessions")
    if _has_index("chat_messages", op.f("ix_chat_messages_session_id")):
        op.drop_index(op.f("ix_chat_messages_session_id"), table_name="chat_messages")
    if _has_index("chat_messages", op.f("ix_chat_messages_created_at")):
        op.drop_index(op.f("ix_chat_messages_created_at"), table_name="chat_messages")
    if _has_index("prompt_templates", op.f("ix_prompt_templates_user_email")):
        op.drop_index(op.f("ix_prompt_templates_user_email"), table_name="prompt_templates")

    if _has_table("ml_model_cache"):
        op.drop_table("ml_model_cache")
    if _has_table("prompt_templates"):
        op.drop_table("prompt_templates")
    if _has_table("ml_feedback"):
        op.drop_table("ml_feedback")
    if _has_table("interaction_logs"):
        op.drop_table("interaction_logs")
    if _has_table("chat_messages"):
        op.drop_table("chat_messages")
    if _has_table("chat_sessions"):
        op.drop_table("chat_sessions")
    if _has_table("user_profiles"):
        op.drop_table("user_profiles")