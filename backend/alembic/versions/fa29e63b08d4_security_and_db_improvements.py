"""security_and_db_improvements

Revision ID: fa29e63b08d4
Revises: 1738f58453a9
Create Date: 2026-03-17 21:41:37.537689
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'fa29e63b08d4'
down_revision: Union[str, None] = '1738f58453a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


FK_NAME = "fk_interaction_logs_session_id_chat_sessions"


def _bind():
    return op.get_bind()


def _has_table(table_name: str) -> bool:
    return sa.inspect(_bind()).has_table(table_name)


def _has_column(table_name: str, column_name: str) -> bool:
    if not _has_table(table_name):
        return False
    columns = sa.inspect(_bind()).get_columns(table_name)
    return any(column["name"] == column_name for column in columns)


def _has_index(table_name: str, index_name: str) -> bool:
    if not _has_table(table_name):
        return False
    indexes = sa.inspect(_bind()).get_indexes(table_name)
    return any(index["name"] == index_name for index in indexes)


def _has_foreign_key(table_name: str, referred_table: str, constrained_columns: list[str]) -> bool:
    if not _has_table(table_name):
        return False
    foreign_keys = sa.inspect(_bind()).get_foreign_keys(table_name)
    for foreign_key in foreign_keys:
        if (
            foreign_key.get("referred_table") == referred_table
            and foreign_key.get("constrained_columns") == constrained_columns
        ):
            return True
    return False


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str]) -> None:
    if not _has_index(table_name, index_name):
        op.create_index(index_name, table_name, columns, unique=False)


def _drop_index_if_exists(index_name: str, table_name: str) -> None:
    if _has_index(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)


def _is_postgresql() -> bool:
    return _bind().dialect.name == "postgresql"


def _is_sqlite() -> bool:
    return _bind().dialect.name == "sqlite"


def _alter_timestamp_column_if_possible(table_name: str, column_name: str, timezone: bool) -> None:
    if _is_postgresql() and _has_column(table_name, column_name):
        op.alter_column(
            table_name,
            column_name,
            existing_type=sa.DateTime(),
            type_=sa.DateTime(timezone=timezone),
            existing_nullable=True,
        )


def upgrade() -> None:
    _alter_timestamp_column_if_possible("chat_messages", "created_at", True)
    _alter_timestamp_column_if_possible("chat_sessions", "created_at", True)
    _alter_timestamp_column_if_possible("chat_sessions", "updated_at", True)
    _alter_timestamp_column_if_possible("interaction_logs", "timestamp", True)
    _alter_timestamp_column_if_possible("ml_feedback", "created_at", True)
    _alter_timestamp_column_if_possible("ml_model_cache", "updated_at", True)
    _alter_timestamp_column_if_possible("prompt_templates", "created_at", True)
    _alter_timestamp_column_if_possible("user_profiles", "updated_at", True)

    if (
        not _is_sqlite()
        and
        _has_table("interaction_logs")
        and _has_table("chat_sessions")
        and _has_column("interaction_logs", "session_id")
        and _has_column("chat_sessions", "id")
        and not _has_foreign_key("interaction_logs", "chat_sessions", ["session_id"])
    ):
        op.create_foreign_key(
            FK_NAME,
            "interaction_logs",
            "chat_sessions",
            ["session_id"],
            ["id"],
            ondelete="SET NULL",
        )

    _create_index_if_missing(op.f("ix_prompt_templates_category_name"), "prompt_templates", ["category_name"])
    _create_index_if_missing(op.f("ix_prompt_templates_created_at"), "prompt_templates", ["created_at"])


def downgrade() -> None:
    if not _is_sqlite() and _has_foreign_key("interaction_logs", "chat_sessions", ["session_id"]):
        op.drop_constraint(FK_NAME, "interaction_logs", type_="foreignkey")

    _drop_index_if_exists(op.f("ix_prompt_templates_created_at"), "prompt_templates")
    _drop_index_if_exists(op.f("ix_prompt_templates_category_name"), "prompt_templates")

    _alter_timestamp_column_if_possible("user_profiles", "updated_at", False)
    _alter_timestamp_column_if_possible("prompt_templates", "created_at", False)
    _alter_timestamp_column_if_possible("ml_model_cache", "updated_at", False)
    _alter_timestamp_column_if_possible("ml_feedback", "created_at", False)
    _alter_timestamp_column_if_possible("interaction_logs", "timestamp", False)
    _alter_timestamp_column_if_possible("chat_sessions", "updated_at", False)
    _alter_timestamp_column_if_possible("chat_sessions", "created_at", False)
    _alter_timestamp_column_if_possible("chat_messages", "created_at", False)