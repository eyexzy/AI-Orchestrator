import { create } from "zustand";

export interface ModelOption {
  value: string;
  label: string;
  provider: string;
  available: boolean;
}

/* Fallback used when the backend is unreachable */
const FALLBACK_MODELS: ModelOption[] = [
  { value: "llama-3.3-70b",    label: "Llama 3.3 70B · Groq",   provider: "groq",       available: true },
  { value: "llama-3.1-8b",     label: "Llama 3.1 8B · Groq",    provider: "groq",       available: true },
  { value: "mixtral-8x7b",     label: "Mixtral 8x7B · Groq",    provider: "groq",       available: true },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash",        provider: "google",     available: true },
  { value: "gemini-1.5-pro",   label: "Gemini 1.5 Pro",          provider: "google",     available: true },
  { value: "or-llama-70b",     label: "Llama 70B · OR",          provider: "openrouter", available: true },
  { value: "or-deepseek-r1",   label: "DeepSeek R1 · OR",        provider: "openrouter", available: true },
  { value: "or-gemma-27b",     label: "Gemma 3 27B · OR",        provider: "openrouter", available: true },
  { value: "or-qwen3-coder",   label: "Qwen3 Coder · OR",        provider: "openrouter", available: true },
  { value: "or-mistral-small", label: "Mistral Small · OR",      provider: "openrouter", available: true },
  { value: "gpt-4o",           label: "GPT-4o",                  provider: "openai",     available: true },
  { value: "gpt-4o-mini",      label: "GPT-4o Mini",             provider: "openai",     available: true },
];

interface ModelsState {
  models: ModelOption[];
  isLoading: boolean;
  fetchModels: () => Promise<void>;
}

export const useModelsStore = create<ModelsState>((set, get) => ({
  models: FALLBACK_MODELS,
  isLoading: false,

  fetchModels: async () => {
    if (get().isLoading) return;
    set({ isLoading: true });
    try {
      const res = await fetch("/api/models");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const backendModels: Record<string, {
        provider: string;
        label: string;
        api_name: string;
        available: boolean;
      }> = data.models ?? {};

      const mapped: ModelOption[] = Object.entries(backendModels).map(
        ([value, info]) => ({
          value,
          label: info.label,
          provider: info.provider,
          available: info.available,
        }),
      );

      if (mapped.length > 0) {
        set({ models: mapped });
      }
    } catch {
      /* keep fallback models on error */
    } finally {
      set({ isLoading: false });
    }
  },
}));
