"""initial schema

Revision ID: 71b2786d9ec9
Revises:
Create Date: 2026-03-17 04:48:36.115994
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '71b2786d9ec9'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add missing indexes for query performance
    op.create_index(op.f('ix_chat_messages_created_at'), 'chat_messages', ['created_at'], unique=False)
    op.create_index(op.f('ix_interaction_logs_timestamp'), 'interaction_logs', ['timestamp'], unique=False)
    op.create_index(op.f('ix_interaction_logs_user_level'), 'interaction_logs', ['user_level'], unique=False)

    # Remove dead column (was written but never read)
    op.drop_column('user_profiles', 'consecutive_high')


def downgrade() -> None:
    op.add_column('user_profiles', op.Column('consecutive_high', op.INTEGER(), autoincrement=False, nullable=True))
    op.drop_index(op.f('ix_interaction_logs_user_level'), table_name='interaction_logs')
    op.drop_index(op.f('ix_interaction_logs_timestamp'), table_name='interaction_logs')
    op.drop_index(op.f('ix_chat_messages_created_at'), table_name='chat_messages')
