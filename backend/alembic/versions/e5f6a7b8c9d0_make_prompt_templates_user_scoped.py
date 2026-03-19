"""make_prompt_templates_user_scoped

Revision ID: e5f6a7b8c9d0
Revises: b8a7c9d4e1f2
Create Date: 2026-03-19 02:20:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "b8a7c9d4e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


PROMPT_TEMPLATE_COLUMNS = [
    "id",
    "user_email",
    "title",
    "description",
    "category_name",
    "category_color",
    "prompt",
    "system_message",
    "variables_json",
    "is_favorite",
    "order_index",
    "created_at",
]


def _has_table(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _primary_key_columns(table_name: str) -> list[str]:
    if not _has_table(table_name):
        return []
    primary_key = sa.inspect(op.get_bind()).get_pk_constraint(table_name)
    constrained_columns = primary_key.get("constrained_columns") or []
    return [column for column in constrained_columns if column is not None]


def _matches_primary_key(table_name: str, expected_columns: list[str]) -> bool:
    columns = _primary_key_columns(table_name)
    return len(columns) == len(expected_columns) and set(columns) == set(expected_columns)


def _rebuild_prompt_templates(composite_primary_key: bool) -> None:
    tmp_table_name = "prompt_templates__tmp_scope_migration"
    primary_key_columns = ["id", "user_email"] if composite_primary_key else ["id"]

    op.create_table(
        tmp_table_name,
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
        sa.PrimaryKeyConstraint(*primary_key_columns),
    )

    column_list = ", ".join(PROMPT_TEMPLATE_COLUMNS)
    op.execute(
        sa.text(
            f"""
            INSERT INTO {tmp_table_name} ({column_list})
            SELECT
              id,
              COALESCE(NULLIF(TRIM(user_email), ''), 'anonymous') AS user_email,
              title,
              description,
              category_name,
              category_color,
              prompt,
              system_message,
              variables_json,
              COALESCE(is_favorite, 0) AS is_favorite,
              COALESCE(order_index, 0) AS order_index,
              created_at
            FROM prompt_templates
            """
        )
    )

    op.drop_table("prompt_templates")
    op.rename_table(tmp_table_name, "prompt_templates")
    op.create_index(op.f("ix_prompt_templates_user_email"), "prompt_templates", ["user_email"], unique=False)
    op.create_index(op.f("ix_prompt_templates_category_name"), "prompt_templates", ["category_name"], unique=False)
    op.create_index(op.f("ix_prompt_templates_created_at"), "prompt_templates", ["created_at"], unique=False)
    op.create_index(
        "ix_prompt_templates_user_email_order_index",
        "prompt_templates",
        ["user_email", "order_index"],
        unique=False,
    )


def upgrade() -> None:
    if not _has_table("prompt_templates"):
        return

    if _matches_primary_key("prompt_templates", ["id", "user_email"]):
        return

    _rebuild_prompt_templates(composite_primary_key=True)


def downgrade() -> None:
    if not _has_table("prompt_templates"):
        return

    duplicate_id = op.get_bind().execute(
        sa.text(
            """
            SELECT id
            FROM prompt_templates
            GROUP BY id
            HAVING COUNT(*) > 1
            LIMIT 1
            """
        )
    ).scalar_one_or_none()
    if duplicate_id is not None:
        raise RuntimeError(
            "Cannot downgrade prompt_templates to a global id primary key because duplicate ids exist across users."
        )

    if _matches_primary_key("prompt_templates", ["id"]):
        return

    _rebuild_prompt_templates(composite_primary_key=False)