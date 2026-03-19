import { GENERATION_PREFERENCES_STORAGE_KEY } from "@/lib/config";

export interface GenerationPreferences {
  model?: string;
  temperature?: number;
  topP?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function readGenerationPreferences(): GenerationPreferences {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(GENERATION_PREFERENCES_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return {};

    return {
      model: typeof parsed.model === "string" ? parsed.model : undefined,
      temperature: isFiniteNumber(parsed.temperature) ? parsed.temperature : undefined,
      topP: isFiniteNumber(parsed.topP) ? parsed.topP : undefined,
    };
  } catch {
    return {};
  }
}

export function writeGenerationPreferences(
  prefs: GenerationPreferences,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      GENERATION_PREFERENCES_STORAGE_KEY,
      JSON.stringify(prefs),
    );
  } catch {
  }
}