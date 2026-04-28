export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");

export const REQUEST_TIMEOUT_MS = 10_000;
export const SEARCH_DEBOUNCE_MS = 300;
export const GENERATION_PREFERENCES_STORAGE_KEY =
  "ai_orchestrator_generation_preferences";
export const ACTIVE_CHAT_STORAGE_KEY = "ai_orchestrator_active_chat_id";
export const I18N_LANGUAGE_STORAGE_KEY = "ai_orchestrator_language";
export const USER_LEVEL_SNAPSHOT_STORAGE_KEY = "ai_orchestrator_user_level_snapshot";
export const PROFILE_PREFERENCES_STORAGE_KEY = "ai_orchestrator_profile_preferences";
export const ACCOUNT_STATS_STORAGE_KEY = "ai_orchestrator_account_stats";
export const DASHBOARD_STORAGE_KEY = "ai_orchestrator_dashboard";
export const CHAT_SIDEBAR_STATE_STORAGE_KEY = "ai_orchestrator_sidebar_state";
export const CHAT_SIDEBAR_UI_STATE_STORAGE_KEY = "ai_orchestrator_sidebar_ui_state";
export const CHATS_CACHE_STORAGE_KEY = "ai_orchestrator_chats_cache";
export const ACTIVE_CHAT_MESSAGES_STORAGE_KEY = "ai_orchestrator_active_chat_messages";
export const PROJECTS_CACHE_STORAGE_KEY = "ai_orchestrator_projects_cache";
export const TEMPLATES_CACHE_STORAGE_KEY = "ai_orchestrator_templates_cache";
export const MODELS_CACHE_STORAGE_KEY = "ai_orchestrator_models_cache";
export const SETTINGS_UI_STATE_STORAGE_KEY = "ai_orchestrator_settings_ui_state";
export const CHATS_PAGE_UI_STATE_STORAGE_KEY = "ai_orchestrator_chats_page_ui_state";
export const PROJECTS_PAGE_UI_STATE_STORAGE_KEY = "ai_orchestrator_projects_page_ui_state";
export const PROJECT_WORKSPACE_UI_STATE_STORAGE_KEY = "ai_orchestrator_project_workspace_ui_state";
export const MODELS_CACHE_TTL_MS = 5 * 60_000;
export const TEMPLATES_CACHE_TTL_MS = 5 * 60_000;
export const PROJECTS_CACHE_TTL_MS = 5 * 60_000;
export const CHATS_CACHE_TTL_MS = 2 * 60_000;
export const CHAT_MESSAGES_CACHE_TTL_MS = 2 * 60_000;
export const PROFILE_PREFERENCES_CACHE_TTL_MS = 5 * 60_000;
