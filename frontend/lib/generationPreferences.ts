import { GENERATION_PREFERENCES_STORAGE_KEY } from "@/lib/config";
import { makeScopedStorageKey, readPersistedState, writePersistedState } from "@/lib/persistedState";

export interface GenerationPreferences {
  model?: string;
  compareModelA?: string;
  compareModelB?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  system?: string;
  variables?: Record<string, string>;
  compareEnabled?: boolean;
  rawJsonEnabled?: boolean;
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

function getGenerationPreferencesKey(userEmail?: string | null): string {
  return makeScopedStorageKey(GENERATION_PREFERENCES_STORAGE_KEY, userEmail);
}

export function readGenerationPreferences(userEmail?: string | null): GenerationPreferences {
  try {
    const parsed = readPersistedState<unknown>(getGenerationPreferencesKey(userEmail));
    if (!isRecord(parsed)) return {};

    const result: GenerationPreferences = {
      model: typeof parsed.model === "string" ? parsed.model : undefined,
      compareModelA: typeof parsed.compareModelA === "string" ? parsed.compareModelA : undefined,
      compareModelB: typeof parsed.compareModelB === "string" ? parsed.compareModelB : undefined,
      temperature: isFiniteNumber(parsed.temperature) ? parsed.temperature : undefined,
      topP: isFiniteNumber(parsed.topP) ? parsed.topP : undefined,
      maxTokens: isFiniteNumber(parsed.maxTokens) ? parsed.maxTokens : undefined,
      system: typeof parsed.system === "string" ? parsed.system : undefined,
      compareEnabled: isBoolean(parsed.compareEnabled) ? parsed.compareEnabled : undefined,
      rawJsonEnabled: isBoolean(parsed.rawJsonEnabled) ? parsed.rawJsonEnabled : undefined,
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
  userEmail?: string | null,
): void {
  try {
    writePersistedState(getGenerationPreferencesKey(userEmail), prefs);
  } catch {
  }
}
