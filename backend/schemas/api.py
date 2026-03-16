from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

# Analyze endpoint schemas

class BehavioralMetrics(BaseModel):
    chars_per_second:            float = Field(default=0, ge=0)
    session_message_count:       int   = Field(default=0, ge=0)
    avg_prompt_length:           float = Field(default=0, ge=0)
    changed_temperature:         bool  = False
    changed_model:               bool  = False
    used_system_prompt:          bool  = False
    used_variables:              bool  = False
    used_advanced_features_count: int  = Field(default=0, ge=0)
    tooltip_click_count:         int   = Field(default=0, ge=0)
    suggestion_click_count:      int   = Field(default=0, ge=0)
    cancel_action_count:         int   = Field(default=0, ge=0)
    session_duration_seconds:    float = Field(default=0, ge=0)


class TrainingFeedback(BaseModel):
    prompt_text:  str
    metrics:      BehavioralMetrics
    actual_level: int = Field(ge=1, le=3)


class AnalyzeRequest(BaseModel):
    prompt_text: str = Field(..., max_length=10000)
    metrics:     BehavioralMetrics | None = None
    session_id:  str = "unknown"
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
    role:    str  # "user" "assistant"
    content: str


class GenerateRequest(BaseModel):
    prompt:         str
    system_message: str = ""
    model:          str = "gemini-2.0-flash"
    temperature:    float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens:     int   = Field(default=1024, ge=1, le=4096)
    top_p:          float = Field(default=1.0, ge=0.0, le=1.0)
    stream:         bool  = False
    session_id:     str | None = None
    history:        list[HistoryMessage] = Field(default_factory=list)
    history_limit:  int = Field(default=20, ge=0, le=100)


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


# Chat CRUD schemas

class CreateChatRequest(BaseModel):
    user_email: str = "anonymous"
    title:      str = "Новий чат"


class UpdateChatRequest(BaseModel):
    title: str


# ML retrain schema

class RetrainResponse(BaseModel):
    ok:             bool
    message:        str
    samples_used:   int  = 0
    train_accuracy: float = 0.0


# Template schemas

CategoryColor = Literal["gray", "blue", "purple", "pink", "red", "amber", "green", "teal"]


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
    message_id:      int | None = None
    message_content: str | None = None
    role:            str | None = None
    updated_at:      str


# Profile preferences schemas

class ProfilePreferencesUpdate(BaseModel):
    theme:                Optional[str] = None   # "light" "dark" "system"
    language:             Optional[str] = None   # "en" "uk"
    manual_level_override: Optional[int] = Field(default=None, ge=1, le=3)
    hidden_templates:     Optional[list[str]] = None


class ProfilePreferencesResponse(BaseModel):
    theme:                str
    language:             str
    manual_level_override: Optional[int] = None
    hidden_templates:     list[str] = Field(default_factory=list)