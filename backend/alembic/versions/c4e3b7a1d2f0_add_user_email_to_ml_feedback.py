"""add_user_email_to_ml_feedback

Revision ID: c4e3b7a1d2f0
Revises: fa29e63b08d4
Create Date: 2026-03-18 08:15:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4e3b7a1d2f0"
down_revision: Union[str, None] = "fa29e63b08d4"
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


def upgrade() -> None:
    if _has_table("ml_feedback") and not _has_column("ml_feedback", "user_email"):
        op.add_column(
            "ml_feedback",
            sa.Column("user_email", sa.String(length=255), nullable=False, server_default="anonymous"),
        )

    if not _has_index("ml_feedback", op.f("ix_ml_feedback_user_email")):
        op.create_index(op.f("ix_ml_feedback_user_email"), "ml_feedback", ["user_email"], unique=False)


def downgrade() -> None:
    if _has_index("ml_feedback", op.f("ix_ml_feedback_user_email")):
        op.drop_index(op.f("ix_ml_feedback_user_email"), table_name="ml_feedback")
    if _has_table("ml_feedback") and _has_column("ml_feedback", "user_email"):
        op.drop_column("ml_feedback", "user_email")