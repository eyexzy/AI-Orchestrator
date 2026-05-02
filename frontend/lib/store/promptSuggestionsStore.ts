"use client";

import { create } from "zustand";
import { useChatStore } from "@/lib/store/chatStore";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { useI18nStore, type Language } from "@/lib/store/i18nStore";
import { readPersistedState, writePersistedState } from "@/lib/persistedState";
import type { ChatMessage } from "@/lib/store/chatStore";

const CACHE_TTL_MS = 15 * 60 * 1000;
const CONTEXT_MESSAGE_LIMIT = 18;
const STORAGE_KEY_PREFIX = "nexa_prompt_suggestions_v1";

type PromptSuggestionsState = {
  suggestions: string[];
  fetchedAt: number;
  isLoading: boolean;
  cacheKey: string | null;
  prefetch: (options?: { force?: boolean }) => Promise<void>;
};

type PersistedPromptSuggestions = {
  suggestions: string[];
  fetchedAt: number;
};

function buildContext(messages: ChatMessage[]) {
  return messages
    .filter((message) => !message.isOptimistic && !message.isError && message.content.trim())
    .slice(-CONTEXT_MESSAGE_LIMIT)
    .map((message) => ({ role: message.role, content: message.content.slice(0, 1200) }));
}

function isSuggestionList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

function buildCacheKey(userEmail: string | null | undefined, language: Language): string {
  const userKey = userEmail?.trim().toLowerCase() || "anonymous";
  return `${STORAGE_KEY_PREFIX}:${encodeURIComponent(userKey)}:${language}`;
}

function readCachedSuggestions(cacheKey: string): PersistedPromptSuggestions {
  const cached = readPersistedState<Partial<PersistedPromptSuggestions>>(cacheKey);
  return {
    suggestions: isSuggestionList(cached?.suggestions) ? cached.suggestions.slice(0, 4) : [],
    fetchedAt: typeof cached?.fetchedAt === "number" ? cached.fetchedAt : 0,
  };
}

export const usePromptSuggestionsStore = create<PromptSuggestionsState>((set, get) => ({
  suggestions: [],
  fetchedAt: 0,
  isLoading: false,
  cacheKey: null,

  prefetch: async (options) => {
    const state = get();
    const { userEmail, level } = useUserLevelStore.getState();
    const language = useI18nStore.getState().language;
    const cacheKey = buildCacheKey(userEmail, language);

    if (state.cacheKey !== cacheKey) {
      const cached = readCachedSuggestions(cacheKey);
      set({
        cacheKey,
        suggestions: cached.suggestions,
        fetchedAt: cached.fetchedAt,
      });
    }

    const current = get();
    if (current.isLoading) return;
    if (!options?.force && current.suggestions.length > 0 && Date.now() - current.fetchedAt < CACHE_TTL_MS) return;

    set({ isLoading: true });
    try {
      const { messages } = useChatStore.getState();
      const res = await fetch("/api/prompt-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_email: userEmail,
          level,
          language,
          history: buildContext(messages),
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!isSuggestionList(data.suggestions)) return;
      const suggestions = data.suggestions.slice(0, 4);
      const fetchedAt = Date.now();
      set({
        suggestions,
        fetchedAt,
        cacheKey,
      });
      writePersistedState(cacheKey, {
        suggestions,
        fetchedAt,
      });
    } catch {
      // Suggestions are optional; never block chat.
    } finally {
      set({ isLoading: false });
    }
  },
}));
