from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "User",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("email", sa.Text(), nullable=True),
        sa.Column("emailVerified", sa.DateTime(timezone=False), nullable=True),
        sa.Column("image", sa.Text(), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=False), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updatedAt", sa.DateTime(timezone=False), nullable=False),
        sa.PrimaryKeyConstraint("id", name="User_pkey"),
    )
    op.create_index("User_email_key", "User", ["email"], unique=True)

    op.create_table(
        "VerificationToken",
        sa.Column("identifier", sa.Text(), nullable=False),
        sa.Column("token", sa.Text(), nullable=False),
        sa.Column("expires", sa.DateTime(timezone=False), nullable=False),
    )
    op.create_index(
        "VerificationToken_identifier_token_key",
        "VerificationToken",
        ["identifier", "token"],
        unique=True,
    )

    op.create_table(
        "Account",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("userId", sa.Text(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("providerAccountId", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=True),
        sa.Column("access_token", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.Integer(), nullable=True),
        sa.Column("token_type", sa.Text(), nullable=True),
        sa.Column("scope", sa.Text(), nullable=True),
        sa.Column("id_token", sa.Text(), nullable=True),
        sa.Column("session_state", sa.Text(), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=False), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updatedAt", sa.DateTime(timezone=False), nullable=False),
        sa.ForeignKeyConstraint(["userId"], ["User.id"], name="Account_userId_fkey", ondelete="CASCADE", onupdate="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="Account_pkey"),
    )
    op.create_index(
        "Account_provider_providerAccountId_key",
        "Account",
        ["provider", "providerAccountId"],
        unique=True,
    )

    op.create_table(
        "Session",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("sessionToken", sa.Text(), nullable=False),
        sa.Column("userId", sa.Text(), nullable=False),
        sa.Column("expires", sa.DateTime(timezone=False), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=False), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updatedAt", sa.DateTime(timezone=False), nullable=False),
        sa.ForeignKeyConstraint(["userId"], ["User.id"], name="Session_userId_fkey", ondelete="CASCADE", onupdate="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="Session_pkey"),
    )
    op.create_index("Session_sessionToken_key", "Session", ["sessionToken"], unique=True)

    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_email", sa.String(length=255), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("is_favorite", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_chat_sessions_user_email"), "chat_sessions", ["user_email"], unique=False)
    op.create_index("ix_chat_sessions_user_email_updated_at", "chat_sessions", ["user_email", "updated_at"], unique=False)

    op.create_table(
        "ml_feedback",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_email", sa.String(length=255), nullable=False),
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
    op.create_index(op.f("ix_ml_feedback_user_email"), "ml_feedback", ["user_email"], unique=False)

    op.create_table(
        "product_feedback",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_email", sa.String(length=255), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=True),
        sa.Column("mood", sa.String(length=16), nullable=True),
        sa.Column("feedback_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_product_feedback_user_email"), "product_feedback", ["user_email"], unique=False)

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
    op.create_index("ix_ml_model_cache_updated_at_id", "ml_model_cache", ["updated_at", "id"], unique=False)

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
    op.create_index(op.f("ix_prompt_templates_category_name"), "prompt_templates", ["category_name"], unique=False)
    op.create_index(op.f("ix_prompt_templates_created_at"), "prompt_templates", ["created_at"], unique=False)
    op.create_index(op.f("ix_prompt_templates_user_email"), "prompt_templates", ["user_email"], unique=False)
    op.create_index("ix_prompt_templates_user_email_order_index", "prompt_templates", ["user_email", "order_index"], unique=False)

    op.create_table(
        "user_experience_profile",
        sa.Column("user_email", sa.String(length=255), nullable=False),
        sa.Column("self_assessed_level", sa.Integer(), nullable=True),
        sa.Column("initial_level", sa.Integer(), nullable=True),
        sa.Column("current_level", sa.Integer(), nullable=True),
        sa.Column("suggested_level_last", sa.Integer(), nullable=True),
        sa.Column("rule_score_last", sa.Float(), nullable=True),
        sa.Column("ml_score_last", sa.Float(), nullable=True),
        sa.Column("confidence_last", sa.Float(), nullable=True),
        sa.Column("manual_level_override", sa.Integer(), nullable=True),
        sa.Column("onboarding_completed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("profile_features_json", sa.Text(), nullable=True),
        sa.Column("level_history_json", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("user_email"),
    )

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

    op.create_table(
        "adaptation_decisions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_email", sa.String(length=255), nullable=False),
        sa.Column("session_id", sa.String(length=64), nullable=True),
        sa.Column("chat_id", sa.String(length=36), nullable=True),
        sa.Column("rule_score", sa.Float(), nullable=True),
        sa.Column("rule_level", sa.Integer(), nullable=True),
        sa.Column("ml_score", sa.Float(), nullable=True),
        sa.Column("ml_level", sa.Integer(), nullable=True),
        sa.Column("ml_confidence", sa.Float(), nullable=True),
        sa.Column("final_level", sa.Integer(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("transition_applied", sa.Boolean(), nullable=True),
        sa.Column("transition_reason_json", sa.Text(), nullable=True),
        sa.Column("rule_breakdown_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["chat_id"], ["chat_sessions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_adaptation_decisions_chat_id"), "adaptation_decisions", ["chat_id"], unique=False)
    op.create_index(op.f("ix_adaptation_decisions_created_at"), "adaptation_decisions", ["created_at"], unique=False)
    op.create_index(op.f("ix_adaptation_decisions_session_id"), "adaptation_decisions", ["session_id"], unique=False)
    op.create_index(op.f("ix_adaptation_decisions_user_email"), "adaptation_decisions", ["user_email"], unique=False)
    op.create_index("ix_adaptation_decisions_user_email_created_at", "adaptation_decisions", ["user_email", "created_at"], unique=False)

    op.create_table(
        "adaptation_feedback",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_email", sa.String(length=255), nullable=False),
        sa.Column("session_id", sa.String(length=64), nullable=True),
        sa.Column("chat_id", sa.String(length=36), nullable=True),
        sa.Column("ui_level_at_time", sa.Integer(), nullable=True),
        sa.Column("suggested_level_at_time", sa.Integer(), nullable=True),
        sa.Column("question_type", sa.String(length=64), nullable=False),
        sa.Column("answer_value", sa.String(length=255), nullable=False),
        sa.Column("feature_snapshot_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["chat_id"], ["chat_sessions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_adaptation_feedback_chat_id"), "adaptation_feedback", ["chat_id"], unique=False)
    op.create_index(op.f("ix_adaptation_feedback_created_at"), "adaptation_feedback", ["created_at"], unique=False)
    op.create_index(op.f("ix_adaptation_feedback_session_id"), "adaptation_feedback", ["session_id"], unique=False)
    op.create_index(op.f("ix_adaptation_feedback_user_email"), "adaptation_feedback", ["user_email"], unique=False)
    op.create_index("ix_adaptation_feedback_user_email_created_at", "adaptation_feedback", ["user_email", "created_at"], unique=False)

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
    op.create_index(op.f("ix_chat_messages_created_at"), "chat_messages", ["created_at"], unique=False)
    op.create_index(op.f("ix_chat_messages_session_id"), "chat_messages", ["session_id"], unique=False)
    op.create_index("ix_chat_messages_session_id_created_at", "chat_messages", ["session_id", "created_at"], unique=False)

    op.create_table(
        "interaction_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.String(length=64), nullable=True),
        sa.Column("chat_id", sa.String(length=36), nullable=True),
        sa.Column("user_email", sa.String(length=255), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_level", sa.Integer(), nullable=True),
        sa.Column("prompt_text", sa.Text(), nullable=True),
        sa.Column("score_awarded", sa.Float(), nullable=True),
        sa.Column("normalized_score", sa.Float(), nullable=True),
        sa.Column("typing_speed", sa.Float(), nullable=True),
        sa.Column("metrics_json", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["chat_id"], ["chat_sessions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_interaction_logs_chat_id"), "interaction_logs", ["chat_id"], unique=False)
    op.create_index(op.f("ix_interaction_logs_id"), "interaction_logs", ["id"], unique=False)
    op.create_index(op.f("ix_interaction_logs_session_id"), "interaction_logs", ["session_id"], unique=False)
    op.create_index(op.f("ix_interaction_logs_timestamp"), "interaction_logs", ["timestamp"], unique=False)
    op.create_index(op.f("ix_interaction_logs_user_email"), "interaction_logs", ["user_email"], unique=False)
    op.create_index(op.f("ix_interaction_logs_user_level"), "interaction_logs", ["user_level"], unique=False)

    op.create_table(
        "session_metrics",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_email", sa.String(length=255), nullable=False),
        sa.Column("session_id", sa.String(length=64), nullable=True),
        sa.Column("chat_id", sa.String(length=36), nullable=True),
        sa.Column("prompts_count", sa.Integer(), nullable=True),
        sa.Column("avg_prompt_length", sa.Float(), nullable=True),
        sa.Column("median_prompt_length", sa.Float(), nullable=True),
        sa.Column("structured_prompt_ratio", sa.Float(), nullable=True),
        sa.Column("help_open_count", sa.Integer(), nullable=True),
        sa.Column("tooltip_open_count", sa.Integer(), nullable=True),
        sa.Column("refine_accept_count", sa.Integer(), nullable=True),
        sa.Column("refine_reject_count", sa.Integer(), nullable=True),
        sa.Column("advanced_actions_count", sa.Integer(), nullable=True),
        sa.Column("cancel_actions_count", sa.Integer(), nullable=True),
        sa.Column("backtracking_count", sa.Integer(), nullable=True),
        sa.Column("session_duration_seconds", sa.Float(), nullable=True),
        sa.Column("task_success_proxy", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["chat_id"], ["chat_sessions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_session_metrics_chat_id"), "session_metrics", ["chat_id"], unique=False)
    op.create_index(op.f("ix_session_metrics_created_at"), "session_metrics", ["created_at"], unique=False)
    op.create_index(op.f("ix_session_metrics_session_id"), "session_metrics", ["session_id"], unique=False)
    op.create_index(op.f("ix_session_metrics_user_email"), "session_metrics", ["user_email"], unique=False)
    op.create_index("ix_session_metrics_user_email_created_at", "session_metrics", ["user_email", "created_at"], unique=False)

    op.create_table(
        "user_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_email", sa.String(length=255), nullable=False),
        sa.Column("session_id", sa.String(length=64), nullable=True),
        sa.Column("chat_id", sa.String(length=36), nullable=True),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("event_context_json", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["chat_id"], ["chat_sessions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_events_chat_id"), "user_events", ["chat_id"], unique=False)
    op.create_index(op.f("ix_user_events_created_at"), "user_events", ["created_at"], unique=False)
    op.create_index(op.f("ix_user_events_event_type"), "user_events", ["event_type"], unique=False)
    op.create_index("ix_user_events_session_event_type", "user_events", ["session_id", "event_type"], unique=False)
    op.create_index(op.f("ix_user_events_session_id"), "user_events", ["session_id"], unique=False)
    op.create_index(op.f("ix_user_events_user_email"), "user_events", ["user_email"], unique=False)
    op.create_index("ix_user_events_user_email_created_at", "user_events", ["user_email", "created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_user_events_user_email_created_at", table_name="user_events")
    op.drop_index(op.f("ix_user_events_user_email"), table_name="user_events")
    op.drop_index(op.f("ix_user_events_session_id"), table_name="user_events")
    op.drop_index("ix_user_events_session_event_type", table_name="user_events")
    op.drop_index(op.f("ix_user_events_event_type"), table_name="user_events")
    op.drop_index(op.f("ix_user_events_created_at"), table_name="user_events")
    op.drop_index(op.f("ix_user_events_chat_id"), table_name="user_events")
    op.drop_table("user_events")

    op.drop_index("ix_session_metrics_user_email_created_at", table_name="session_metrics")
    op.drop_index(op.f("ix_session_metrics_user_email"), table_name="session_metrics")
    op.drop_index(op.f("ix_session_metrics_session_id"), table_name="session_metrics")
    op.drop_index(op.f("ix_session_metrics_created_at"), table_name="session_metrics")
    op.drop_index(op.f("ix_session_metrics_chat_id"), table_name="session_metrics")
    op.drop_table("session_metrics")

    op.drop_index(op.f("ix_interaction_logs_user_level"), table_name="interaction_logs")
    op.drop_index(op.f("ix_interaction_logs_user_email"), table_name="interaction_logs")
    op.drop_index(op.f("ix_interaction_logs_timestamp"), table_name="interaction_logs")
    op.drop_index(op.f("ix_interaction_logs_session_id"), table_name="interaction_logs")
    op.drop_index(op.f("ix_interaction_logs_id"), table_name="interaction_logs")
    op.drop_index(op.f("ix_interaction_logs_chat_id"), table_name="interaction_logs")
    op.drop_table("interaction_logs")

    op.drop_index("ix_chat_messages_session_id_created_at", table_name="chat_messages")
    op.drop_index(op.f("ix_chat_messages_session_id"), table_name="chat_messages")
    op.drop_index(op.f("ix_chat_messages_created_at"), table_name="chat_messages")
    op.drop_table("chat_messages")

    op.drop_index("ix_adaptation_feedback_user_email_created_at", table_name="adaptation_feedback")
    op.drop_index(op.f("ix_adaptation_feedback_user_email"), table_name="adaptation_feedback")
    op.drop_index(op.f("ix_adaptation_feedback_session_id"), table_name="adaptation_feedback")
    op.drop_index(op.f("ix_adaptation_feedback_created_at"), table_name="adaptation_feedback")
    op.drop_index(op.f("ix_adaptation_feedback_chat_id"), table_name="adaptation_feedback")
    op.drop_table("adaptation_feedback")

    op.drop_index("ix_adaptation_decisions_user_email_created_at", table_name="adaptation_decisions")
    op.drop_index(op.f("ix_adaptation_decisions_user_email"), table_name="adaptation_decisions")
    op.drop_index(op.f("ix_adaptation_decisions_session_id"), table_name="adaptation_decisions")
    op.drop_index(op.f("ix_adaptation_decisions_created_at"), table_name="adaptation_decisions")
    op.drop_index(op.f("ix_adaptation_decisions_chat_id"), table_name="adaptation_decisions")
    op.drop_table("adaptation_decisions")

    op.drop_table("user_profiles")
    op.drop_table("user_experience_profile")

    op.drop_index("ix_prompt_templates_user_email_order_index", table_name="prompt_templates")
    op.drop_index(op.f("ix_prompt_templates_user_email"), table_name="prompt_templates")
    op.drop_index(op.f("ix_prompt_templates_created_at"), table_name="prompt_templates")
    op.drop_index(op.f("ix_prompt_templates_category_name"), table_name="prompt_templates")
    op.drop_table("prompt_templates")

    op.drop_index("ix_ml_model_cache_updated_at_id", table_name="ml_model_cache")
    op.drop_table("ml_model_cache")

    op.drop_index(op.f("ix_product_feedback_user_email"), table_name="product_feedback")
    op.drop_table("product_feedback")

    op.drop_index(op.f("ix_ml_feedback_user_email"), table_name="ml_feedback")
    op.drop_table("ml_feedback")

    op.drop_index("ix_chat_sessions_user_email_updated_at", table_name="chat_sessions")
    op.drop_index(op.f("ix_chat_sessions_user_email"), table_name="chat_sessions")
    op.drop_table("chat_sessions")

    op.drop_index("Session_sessionToken_key", table_name="Session")
    op.drop_table("Session")

    op.drop_index("Account_provider_providerAccountId_key", table_name="Account")
    op.drop_table("Account")

    op.drop_index("VerificationToken_identifier_token_key", table_name="VerificationToken")
    op.drop_table("VerificationToken")

    op.drop_index("User_email_key", table_name="User")
    op.drop_table("User")
