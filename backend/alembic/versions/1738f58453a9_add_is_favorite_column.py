"""add is_favorite column

Revision ID: 1738f58453a9
Revises: 71b2786d9ec9
Create Date: 2026-03-17 06:08:51.619308
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1738f58453a9'
down_revision: Union[str, None] = '71b2786d9ec9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _has_column(table_name: str, column_name: str) -> bool:
    if not _has_table(table_name):
        return False
    columns = sa.inspect(op.get_bind()).get_columns(table_name)
    return any(column["name"] == column_name for column in columns)


def upgrade() -> None:
    if _has_table("chat_sessions") and not _has_column("chat_sessions", "is_favorite"):
        op.add_column("chat_sessions", sa.Column("is_favorite", sa.Boolean(), nullable=True))


def downgrade() -> None:
    if _has_table("chat_sessions") and _has_column("chat_sessions", "is_favorite"):
        op.drop_column("chat_sessions", "is_favorite")