from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

# Analyze endpoint schemas
class BehavioralMetrics(BaseModel):
    chars_per_second:            float = Field(default=0, ge=0, le=50.0)
    session_message_count:       int   = Field(default=0, ge=0, le=10000)
    avg_prompt_length:           float = Field(default=0, ge=0, le=10000)
    changed_temperature:         bool  = False
    changed_model:               bool  = False
    used_system_prompt:          bool  = False
    used_variables:              bool  = False
    used_advanced_features_count: int  = Field(default=0, ge=0, le=1000)
    tooltip_click_count:         int   = Field(default=0, ge=0, le=10000)
    suggestion_click_count:      int   = Field(default=0, ge=0, le=10000)
    cancel_action_count:         int   = Field(default=0, ge=0, le=10000)
    level_transition_count:      int   = Field(default=0, ge=0, le=1000)
    session_duration_seconds:    float = Field(default=0, ge=0, le=86400)


class TrainingFeedback(BaseModel):
    prompt_text:  str = Field(..., max_length=10000)
    metrics:      BehavioralMetrics
    actual_level: int = Field(ge=1, le=3)


class AnalyzeRequest(BaseModel):
    prompt_text: str = Field(..., max_length=10000)
    metrics:     BehavioralMetrics | None = None
    session_id:  str = "unknown"
    # chat_id is the persistent chat thread; session_id is one page-visit UUID.
    chat_id:     Optional[str] = None
    user_email:  str = "anonymous"


class ScoreBreakdown(BaseModel):
    category:   str
    points:     float
    max_points: float
    detail:     str


class AnalyzeResponse(BaseModel):
    suggested_level: int   = Field(ge=1, le=3)
    final_level:     int   = Field(ge=1, le=3)
    confidence:      float = Field(ge=0, le=1)
    reasoning:       list[str]
    score:           float
    normalized_score: float = Field(ge=0, le=1)
    breakdown:       list[ScoreBreakdown]
    thresholds:      dict


# Generate endpoint schemas
class HistoryMessage(BaseModel):
    role:    str # "user" "assistant"
    content: str


class InlineAttachment(BaseModel):
    """File sent inline as base64 — processed directly by the LLM (vision/document)."""
    filename: str
    mime_type: str
    data: str  # base64-encoded file bytes


class GenerateRequest(BaseModel):
    prompt:         str
    system_message: str = ""
    model:          str = "gemini-2.0-flash"
    temperature:    float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens:     int   = Field(default=2048, ge=1, le=4096)
    top_p:          float = Field(default=1.0, ge=0.0, le=1.0)
    stream:         bool  = False
    session_id:     str | None = None
    history:        list[HistoryMessage] = Field(default_factory=list)
    history_limit:  int = Field(default=20, ge=0, le=100)
    continuation_text: str = ""
    continuation_message_id: int | None = None
    attachment_ids: list[str] = Field(default_factory=list)
    inline_attachments: list[InlineAttachment] = Field(default_factory=list)
    project_id: str | None = None


MultiGenerateMode = Literal["compare", "self_consistency"]


class MultiGenerateRequest(BaseModel):
    prompt:              str
    system_message:      str = ""
    model:               str = "gemini-2.0-flash"
    model_label:         str | None = None
    compare_model:       str | None = None
    compare_model_label: str | None = None
    temperature:         float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens:          int   = Field(default=2048, ge=1, le=4096)
    top_p:               float = Field(default=1.0, ge=0.0, le=1.0)
    session_id:          str
    history:             list[HistoryMessage] = Field(default_factory=list)
    history_limit:       int = Field(default=20, ge=0, le=100)
    mode:                MultiGenerateMode
    run_count:           int = Field(default=3, ge=2, le=5)
    project_id:          str | None = None


class UsageStats(BaseModel):
    prompt_tokens:     int
    completion_tokens: int
    total_tokens:      int
    model:             str
    temperature:       float
    latency_ms:        int


class GenerateResponse(BaseModel):
    text:     str
    usage:    UsageStats
    raw:      dict
    provider: str


class RefineRequest(BaseModel):
    prompt: str = Field(..., max_length=20000)
    language: Optional[str] = None # "en" | "uk"; auto-detected if None
    level: Optional[int] = Field(default=None, ge=1, le=3)
    clarification_answers: Optional[dict[str, str]] = None


class TutorQuestion(BaseModel):
    id: str
    question: str


class TutorReviewResponse(BaseModel):
    opening_message: str
    strengths: list[str]
    gaps: list[str]
    clarifying_questions: list[TutorQuestion]
    improved_prompt: str
    why_this_is_better: list[str]
    next_step: str


# Chat CRUD schemas

class CreateChatRequest(BaseModel):
    user_email: str = "anonymous"
    title:      str = "Новий чат"
    project_id: Optional[str] = None


class UpdateChatRequest(BaseModel):
    title: Optional[str] = None
    is_favorite: Optional[bool] = None
    project_id: Optional[str] = None


class ForkChatRequest(BaseModel):
    message_id: int = Field(..., ge=1)
    title: Optional[str] = Field(default=None, max_length=255)
    project_id: Optional[str] = None


# ML retrain schema
class RetrainResponse(BaseModel):
    ok:             bool
    message:        str
    samples_used:   int   = 0
    train_accuracy: float = 0.0
    test_accuracy:  float = 0.0
    f1_macro:       float = 0.0
    cv_f1_mean:     float = 0.0
    cv_f1_std:      float = 0.0
    model_type:     str   = "LogisticRegression"
    model_params:   dict = Field(default_factory=dict)
    tuning:         dict | None = None
    confusion_matrix: list[list[int]] = []
    classification_report: dict = {}


# Template schemas
CategoryColor = Literal["gray", "blue", "purple", "pink", "red", "amber", "green", "teal"]
ProjectAccentColor = Literal["gray", "blue", "purple", "pink", "red", "amber", "green", "teal"]
ProjectIconName = Literal[
    "folder",
    "kanban",
    "briefcase",
    "graduation",
    "notebook",
    "book",
    "code",
    "flask",
    "brain",
    "palette",
    "landmark",
    "globe",
    "plane",
    "camera",
    "music",
    "megaphone",
    "heart",
    "gift",
    "money",
    "sparkles",
]


class TemplateBase(BaseModel):
    title:          str           = ""
    description:    str           = ""
    category_name:  str           = ""
    category_color: CategoryColor = "blue"
    prompt:         str   = ""
    system_message: str   = ""
    variables:      list[str] = Field(default_factory=list)
    is_favorite:    bool  = False
    order_index:    int   = 0


class TemplateCreate(TemplateBase):
    id: Optional[str] = None


class TemplateUpdate(BaseModel):
    title:          Optional[str]       = None
    description:    Optional[str]       = None
    category_name:  Optional[str]       = None
    category_color: Optional[CategoryColor] = None
    prompt:         Optional[str]       = None
    system_message: Optional[str]       = None
    variables:      Optional[list[str]] = None
    is_favorite:    Optional[bool]      = None
    order_index:    Optional[int]       = None


class TemplateResponse(TemplateBase):
    id:         str
    created_at: datetime | None = None


class ReorderItem(BaseModel):
    id:          str
    order_index: int


# Chat search schema
class ChatSearchResult(BaseModel):
    chat_id:         str
    chat_title:      str
    project_id:      str | None = None
    project_name:    str | None = None
    message_id:      int | None = None
    message_content: str | None = None
    role:            str | None = None
    updated_at:      str


class ProjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="", max_length=2000)
    accent_color: ProjectAccentColor = "blue"
    icon_name: ProjectIconName = "folder"
    starter_prompt: str = Field(default="", max_length=2000)
    system_hint: str = Field(default="", max_length=4000)
    is_favorite: bool = False


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)
    accent_color: Optional[ProjectAccentColor] = None
    icon_name: Optional[ProjectIconName] = None
    starter_prompt: Optional[str] = Field(default=None, max_length=2000)
    system_hint: Optional[str] = Field(default=None, max_length=4000)
    is_favorite: Optional[bool] = None


class ProjectResponse(ProjectBase):
    id: str
    chat_count: int = 0
    source_count: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ProjectSourceResponse(BaseModel):
    id: str
    project_id: str
    file_id: str
    title: str | None = None
    filename: str
    mime_type: str
    size_bytes: int
    created_at: datetime | None = None
    thumbnail_data: str | None = None  # base64 for images only


class AddTextSourceRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    content: str = Field(..., min_length=1, max_length=50000)


# Profile preferences schemas
class ProfilePreferencesUpdate(BaseModel):
    theme:                     Optional[str] = None # "light" "dark" "system"
    language:                  Optional[str] = None # "en" "uk"
    manual_level_override:     Optional[int] = Field(default=None, ge=1, le=3)
    hidden_templates:          Optional[list[str]] = None
    self_assessed_level:       Optional[int] = Field(default=None, ge=1, le=3)
    onboarding_completed:      Optional[bool] = None
    display_name:              Optional[str] = Field(default=None, max_length=120)
    notify_level_up:           Optional[bool] = None
    notify_micro_feedback:     Optional[bool] = None
    notify_tutor_suggestions:  Optional[bool] = None
    tracking_enabled:          Optional[bool] = None


class ProfilePreferencesResponse(BaseModel):
    theme:                     str
    language:                  str
    current_level:             int = Field(default=1, ge=1, le=3)
    initial_level:             int = Field(default=1, ge=1, le=3)
    self_assessed_level:       Optional[int] = None
    manual_level_override:     Optional[int] = None
    onboarding_completed:      bool = False
    hidden_templates:          list[str] = Field(default_factory=list)
    display_name:              Optional[str] = None
    notify_level_up:           bool = True
    notify_micro_feedback:     bool = True
    notify_tutor_suggestions:  bool = True
    tracking_enabled:          bool = True


class AccountStatsResponse(BaseModel):
    chats_count:          int = 0
    messages_count:       int = 0
    projects_count:       int = 0
    templates_count:      int = 0
    events_count:         int = 0
    decisions_count:      int = 0


class BulkDeleteResponse(BaseModel):
    ok:                   bool = True
    deleted:              int = 0


class AccountDeletionResponse(BaseModel):
    ok:                   bool = True
    deleted:              dict = Field(default_factory=dict)


# User event schemas (Layer 1)
class UserEventCreate(BaseModel):
    session_id:         str | None = None
    chat_id:            str | None = None
    event_type:         str = Field(..., max_length=64)
    event_context:      dict = Field(default_factory=dict)
    payload:            dict = Field(default_factory=dict)


class UserEventBatchCreate(BaseModel):
    events:             list[UserEventCreate] = Field(..., min_length=1, max_length=50)


class UserEventBatchResponse(BaseModel):
    ok:                 bool = True
    saved:              int = 0


class UserEventResponse(BaseModel):
    id:                 int
    user_email:         str
    session_id:         str | None = None
    chat_id:            str | None = None
    event_type:         str
    event_context:      dict = Field(default_factory=dict)
    payload:            dict = Field(default_factory=dict)
    created_at:         datetime | None = None


# Session metrics schemas (Layer 2)
class SessionMetricsResponse(BaseModel):
    id:                       int
    user_email:               str
    session_id:               str | None = None
    chat_id:                  str | None = None
    prompts_count:            int = 0
    avg_prompt_length:        float = 0.0
    median_prompt_length:     float = 0.0
    structured_prompt_ratio:  float = 0.0
    tooltip_open_count:       int = 0
    refine_accept_count:      int = 0
    refine_reject_count:      int = 0
    advanced_actions_count:   int = 0
    cancel_actions_count:     int = 0
    backtracking_count:       int = 0
    session_duration_seconds: float = 0.0
    task_success_proxy:       float = 0.0
    created_at:               datetime | None = None


# User experience profile schemas (Layer 3)
class UserExperienceProfileResponse(BaseModel):
    user_email:            str
    self_assessed_level:   int | None = None
    initial_level:         int = 1
    current_level:         int = 1
    suggested_level_last:  int | None = None
    rule_score_last:       float | None = None
    ml_score_last:         float | None = None
    confidence_last:       float | None = None
    manual_level_override: int | None = None
    profile_features:      dict = Field(default_factory=dict)
    level_history:         list = Field(default_factory=list)
    updated_at:            datetime | None = None


# Adaptation feedback schemas
class AdaptationFeedbackCreate(BaseModel):
    session_id:               str | None = None
    chat_id:                  str | None = None
    ui_level_at_time:         int | None = Field(default=None, ge=1, le=3)
    suggested_level_at_time:  int | None = Field(default=None, ge=1, le=3)
    question_type:            str = Field(..., max_length=64)
    answer_value:             str = Field(..., max_length=255)
    feature_snapshot:         dict = Field(default_factory=dict)


class AdaptationFeedbackResponse(BaseModel):
    id:                       int
    user_email:               str
    session_id:               str | None = None
    chat_id:                  str | None = None
    ui_level_at_time:         int | None = None
    suggested_level_at_time:  int | None = None
    question_type:            str
    answer_value:             str
    feature_snapshot:         dict = Field(default_factory=dict)
    created_at:               datetime | None = None


# Adaptation decision schemas (Layer 6)
class AdaptationDecisionResponse(BaseModel):
    id:                     int
    user_email:             str
    session_id:             str | None = None
    chat_id:                str | None = None
    rule_score:             float | None = None
    rule_level:             int | None = None
    ml_score:               float | None = None
    ml_level:               int | None = None
    ml_confidence:          float | None = None
    final_level:            int
    confidence:             float | None = None
    transition_applied:     bool = False
    transition_reason:      dict = Field(default_factory=dict)
    rule_breakdown:         dict = Field(default_factory=dict)
    created_at:             datetime | None = None


# File upload schemas
class UploadedFileResponse(BaseModel):
    id: str
    filename: str
    mime_type: str
    size_bytes: int
    extracted_text: str
    created_at: datetime | None = None


# Dashboard schemas (user-scoped)
class DashboardDecisionItem(BaseModel):
    rule_score:         float | None = None
    rule_level:         int | None = None
    ml_score:           float | None = None
    ml_level:           int | None = None
    final_level:        int
    confidence:         float | None = None
    transition_reason:  dict = Field(default_factory=dict)
    created_at:         datetime | None = None


class DashboardResponse(BaseModel):
    current_level:        int = 1
    suggested_level:      int | None = None
    self_assessed_level:  int | None = None
    initial_level:        int = 1
    rule_score:           float | None = None
    ml_score:             float | None = None
    confidence:           float | None = None
    profile_features:     dict = Field(default_factory=dict)
    level_history:        list[int] = Field(default_factory=list)
    recent_decisions:     list[DashboardDecisionItem] = Field(default_factory=list)
    updated_at:           datetime | None = None
