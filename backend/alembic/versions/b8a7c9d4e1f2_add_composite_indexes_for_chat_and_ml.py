"""add_composite_indexes_for_chat_and_ml

Revision ID: b8a7c9d4e1f2
Revises: c4e3b7a1d2f0
Create Date: 2026-03-18 18:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b8a7c9d4e1f2"
down_revision: Union[str, None] = "c4e3b7a1d2f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _has_index(table_name: str, index_name: str) -> bool:
    if not _has_table(table_name):
        return False
    indexes = sa.inspect(op.get_bind()).get_indexes(table_name)
    return any(index["name"] == index_name for index in indexes)


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str]) -> None:
    if not _has_index(table_name, index_name):
        op.create_index(index_name, table_name, columns, unique=False)


def upgrade() -> None:
    _create_index_if_missing(
        "ix_chat_sessions_user_email_updated_at",
        "chat_sessions",
        ["user_email", "updated_at"],
    )
    _create_index_if_missing(
        "ix_chat_messages_session_id_created_at",
        "chat_messages",
        ["session_id", "created_at"],
    )
    _create_index_if_missing(
        "ix_prompt_templates_user_email_order_index",
        "prompt_templates",
        ["user_email", "order_index"],
    )
    _create_index_if_missing(
        "ix_ml_model_cache_updated_at_id",
        "ml_model_cache",
        ["updated_at", "id"],
    )


def downgrade() -> None:
    if _has_index("ml_model_cache", "ix_ml_model_cache_updated_at_id"):
        op.drop_index("ix_ml_model_cache_updated_at_id", table_name="ml_model_cache")
    if _has_index("prompt_templates", "ix_prompt_templates_user_email_order_index"):
        op.drop_index("ix_prompt_templates_user_email_order_index", table_name="prompt_templates")
    if _has_index("chat_messages", "ix_chat_messages_session_id_created_at"):
        op.drop_index("ix_chat_messages_session_id_created_at", table_name="chat_messages")
    if _has_index("chat_sessions", "ix_chat_sessions_user_email_updated_at"):
        op.drop_index("ix_chat_sessions_user_email_updated_at", table_name="chat_sessions")