"use client";

import { create } from "zustand";
import type { AttachmentChipData } from "@/components/ui/attachment-chip";
import type { InlineAttachment } from "@/components/chat/MainInput";

const STORAGE_KEY = "ai-orchestrator:drafts-v1";
const NULL_CHAT_KEY = "__new__";

export interface DraftEntry {
  text: string;
  chips: AttachmentChipData[];
  inlineAttachments: InlineAttachment[];
}

const EMPTY_ENTRY: DraftEntry = { text: "", chips: [], inlineAttachments: [] };

interface DraftStore {
  // Plain object keyed by chatId — stable references, no new arrays on miss
  drafts: Record<string, DraftEntry>;
  setText: (chatId: string | null, text: string) => void;
  setAttachments: (chatId: string | null, chips: AttachmentChipData[], inline: InlineAttachment[]) => void;
  clearDraft: (chatId: string | null) => void;
  clearAll: () => void;
}

function chatKey(chatId: string | null): string {
  return chatId ?? NULL_CHAT_KEY;
}

function loadFromStorage(): Record<string, DraftEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    const result: Record<string, DraftEntry> = {};
    for (const [k, text] of Object.entries(parsed)) {
      if (typeof text === "string" && text.trim()) {
        result[k] = { text, chips: [], inlineAttachments: [] };
      }
    }
    return result;
  } catch {
    return {};
  }
}

function saveToStorage(drafts: Record<string, DraftEntry>) {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, string> = {};
    for (const [k, entry] of Object.entries(drafts)) {
      if (entry.text.trim()) obj[k] = entry.text;
    }
    if (Object.keys(obj).length === 0) {
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    }
  } catch {}
}

export const useDraftStore = create<DraftStore>((set) => ({
  drafts: loadFromStorage(),

  setText: (chatId, text) => {
    const k = chatKey(chatId);
    set((state) => {
      const existing = state.drafts[k] ?? EMPTY_ENTRY;
      const next = { ...state.drafts, [k]: { ...existing, text } };
      saveToStorage(next);
      return { drafts: next };
    });
  },

  setAttachments: (chatId, chips, inline) => {
    const k = chatKey(chatId);
    set((state) => {
      const existing = state.drafts[k] ?? EMPTY_ENTRY;
      return { drafts: { ...state.drafts, [k]: { ...existing, chips, inlineAttachments: inline } } };
    });
  },

  clearDraft: (chatId) => {
    const k = chatKey(chatId);
    set((state) => {
      const { [k]: _, ...rest } = state.drafts;
      saveToStorage(rest);
      return { drafts: rest };
    });
  },

  clearAll: () => {
    if (typeof window !== "undefined") sessionStorage.removeItem(STORAGE_KEY);
    set({ drafts: {} });
  },
}));

// Stable selector helpers — call outside render or memoize
export function getDraftEntry(chatId: string | null): DraftEntry {
  return useDraftStore.getState().drafts[chatKey(chatId)] ?? EMPTY_ENTRY;
}
