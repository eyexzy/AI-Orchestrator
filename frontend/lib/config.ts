if (
  process.env.NODE_ENV === "production" &&
  !process.env.NEXT_PUBLIC_API_URL
) {
  throw new Error(
    "[config] NEXT_PUBLIC_API_URL is required in production. " +
      "Set it in your environment variables (e.g. NEXT_PUBLIC_API_URL=https://api.example.com)."
  );
}

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");

export const REQUEST_TIMEOUT_MS = 10_000;
export const SEARCH_DEBOUNCE_MS = 300;
export const GENERATION_PREFERENCES_STORAGE_KEY =
  "ai_orchestrator_generation_preferences";