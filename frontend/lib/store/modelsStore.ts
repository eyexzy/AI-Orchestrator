import { create } from "zustand";
import { MODELS_CACHE_STORAGE_KEY, MODELS_CACHE_TTL_MS } from "@/lib/config";
import { readPersistedState, writePersistedState } from "@/lib/persistedState";

export interface ModelOption {
  value: string;
  label: string;
  provider: string;
  available: boolean;
  free?: boolean;
  context?: number;
  vision?: boolean;
}

/* Fallback used when the backend is unreachable */
const FALLBACK_MODELS: ModelOption[] = [
  // Claude
  { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "openrouter", available: true, free: false, context: 200000, vision: true },
  { value: "claude-haiku-4-5",  label: "Claude Haiku 4.5",  provider: "openrouter", available: true, free: false, context: 200000, vision: true },
  // GPT
  { value: "gpt-4o",            label: "GPT-4o",             provider: "openrouter", available: true, free: false, context: 128000, vision: true },
  { value: "gpt-4o-mini",       label: "GPT-4o Mini",        provider: "openrouter", available: true, free: false, context: 128000, vision: true },
  { value: "o4-mini",           label: "o4 Mini",            provider: "openrouter", available: true, free: false, context: 128000, vision: true },
  // Gemini
  { value: "gemini-2.5-flash",  label: "Gemini 2.5 Flash",  provider: "openrouter", available: true, free: false, context: 1000000, vision: true },
  { value: "gemini-2.0-flash",  label: "Gemini 2.0 Flash",  provider: "openrouter", available: true, free: false, context: 1000000, vision: true },
  { value: "gemini-2.5-pro",    label: "Gemini 2.5 Pro",    provider: "openrouter", available: true, free: false, context: 1000000, vision: true },
  // Free
  { value: "or-llama-70b",      label: "Llama 3.3 70B",     provider: "openrouter", available: true, free: true,  context: 131072,  vision: false },
  { value: "or-deepseek-r1",    label: "DeepSeek R1",        provider: "openrouter", available: true, free: true,  context: 163840,  vision: false },
  { value: "or-gemma-3-27b",    label: "Gemma 3 27B",        provider: "openrouter", available: true, free: true,  context: 131072,  vision: true  },
  { value: "or-qwen3-30b",      label: "Qwen3 30B",          provider: "openrouter", available: true, free: true,  context: 40960,   vision: false },
  { value: "or-mistral-small",  label: "Mistral Small 3.1",  provider: "openrouter", available: true, free: true,  context: 131072,  vision: false },
  { value: "or-llama-scout",    label: "Llama 4 Scout",      provider: "openrouter", available: true, free: true,  context: 10000000, vision: true },
];

interface ModelsState {
  models: ModelOption[];
  isLoading: boolean;
  fetchModels: () => Promise<void>;
}

let modelsInflight: Promise<void> | null = null;
type PersistedModelsCache = {
  models: ModelOption[];
  fetchedAt: number;
};

function readPersistedModelsCache(): PersistedModelsCache | null {
  const persisted = readPersistedState<PersistedModelsCache>(MODELS_CACHE_STORAGE_KEY);
  if (!persisted || !Array.isArray(persisted.models) || typeof persisted.fetchedAt !== "number") {
    return null;
  }
  return persisted;
}

function writePersistedModelsCache(data: PersistedModelsCache): void {
  writePersistedState(MODELS_CACHE_STORAGE_KEY, data);
}

let modelsLastFetchedAt = 0;

export const useModelsStore = create<ModelsState>((set, get) => ({
  models: FALLBACK_MODELS,
  isLoading: false,

  fetchModels: async () => {
    const { isLoading, models } = get();
    const hasFreshCache =
      models.length > 0 && Date.now() - modelsLastFetchedAt < MODELS_CACHE_TTL_MS;

    if (hasFreshCache || isLoading) return;
    if (modelsInflight) return modelsInflight;

    set({ isLoading: true });
    modelsInflight = (async () => {
      try {
        const res = await fetch("/api/models");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const backendModels: Record<string, {
          provider: string;
          label: string;
          api_name: string;
          available: boolean;
          free?: boolean;
          context?: number;
          vision?: boolean;
        }> = data.models ?? {};

        const mapped: ModelOption[] = Object.entries(backendModels).map(
          ([value, info]) => ({
            value,
            label: info.label,
            provider: info.provider,
            available: info.available,
            free: info.free ?? false,
            context: info.context,
            vision: info.vision ?? false,
          }),
        );

        if (mapped.length > 0) {
          modelsLastFetchedAt = Date.now();
          writePersistedModelsCache({ models: mapped, fetchedAt: modelsLastFetchedAt });
          set({ models: mapped });
        }
      } catch {
        /* keep fallback models on error */
      } finally {
        modelsInflight = null;
        set({ isLoading: false });
      }
    })();

    return modelsInflight;
  },
}));

let modelsStoreHydrated = false;

export function hydrateModelsStoreFromPersistence(): void {
  if (modelsStoreHydrated) return;
  modelsStoreHydrated = true;

  const persistedModelsCache = readPersistedModelsCache();
  if (!persistedModelsCache) return;

  modelsLastFetchedAt = persistedModelsCache.fetchedAt;
  useModelsStore.setState({ models: persistedModelsCache.models });
}
