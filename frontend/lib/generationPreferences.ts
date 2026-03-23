import { GENERATION_PREFERENCES_STORAGE_KEY } from "@/lib/config";

export interface GenerationPreferences {
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  system?: string;
  variables?: Record<string, string>;
  compareEnabled?: boolean;
  selfConsistencyEnabled?: boolean;
  fewShotExamples?: Array<{ input: string; output: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
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

    const result: GenerationPreferences = {
      model: typeof parsed.model === "string" ? parsed.model : undefined,
      temperature: isFiniteNumber(parsed.temperature) ? parsed.temperature : undefined,
      topP: isFiniteNumber(parsed.topP) ? parsed.topP : undefined,
      maxTokens: isFiniteNumber(parsed.maxTokens) ? parsed.maxTokens : undefined,
      system: typeof parsed.system === "string" ? parsed.system : undefined,
      compareEnabled: isBoolean(parsed.compareEnabled) ? parsed.compareEnabled : undefined,
      selfConsistencyEnabled: isBoolean(parsed.selfConsistencyEnabled) ? parsed.selfConsistencyEnabled : undefined,
    };

    if (isRecord(parsed.variables)) {
      const vars: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed.variables)) {
        if (typeof v === "string") vars[k] = v;
      }
      if (Object.keys(vars).length > 0) result.variables = vars;
    }

    if (Array.isArray(parsed.fewShotExamples)) {
      const examples: Array<{ input: string; output: string }> = [];
      for (const ex of parsed.fewShotExamples) {
        if (isRecord(ex) && typeof ex.input === "string" && typeof ex.output === "string") {
          examples.push({ input: ex.input, output: ex.output });
        }
      }
      if (examples.length > 0) result.fewShotExamples = examples;
    }

    return result;
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
