/**
 * chatStore.ts — Zustand store for chat state
 *
 * Fixes applied in this version:
 *   #5  Compare Mode guard — silently falls back to Normal if modelA === modelB
 *   #6  deleteChat — selectChat wrapped in try/catch to handle 404 gracefully
 *   SEC Chat CRUD now goes through Next.js /api/chats proxy (auth + admin key)
 *       instead of calling FastAPI directly with client-supplied user_email.
 */

import { create } from "zustand";
import { toast } from "sonner";
import { useUserLevelStore } from "./userLevelStore";
import { API_URL } from "@/lib/config";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Role = "user" | "assistant";

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface CompareResult {
  text: string;
  model: string;
  modelLabel: string;
  latency_ms: number;
  total_tokens: number;
}

export interface SelfConsistencyRun {
  text: string;
  latency_ms: number;
  total_tokens: number;
}

export interface ChatMessage {
  id: number | string;
  role: Role;
  content: string;
  created_at?: string;
  metadata?: Record<string, unknown>;
  isOptimistic?: boolean;
  isError?: boolean;

  // Advanced L3 modes
  isCompare?: boolean;
  comparison?: {
    modelA: CompareResult;
    modelB: CompareResult;
  };
  isSelfConsistency?: boolean;
  selfConsistency?: {
    model: string;
    modelLabel: string;
    runs: SelfConsistencyRun[];
  };
}

export interface SendMessageOpts {
  userEmail: string;
  model: string;
  temperature: number;
  max_tokens: number;
  top_p?: number;
  top_k?: number;
  system_message?: string;
  compareModel?: string;
  modelLabel?: string;
  compareModelLabel?: string;
  selfConsistencyEnabled?: boolean;
  stream?: boolean;
}

interface ChatState {
  chats: ChatSession[];
  activeChatId: string | null;
  messages: ChatMessage[];
  isLoadingChats: boolean;
  isLoadingMessages: boolean;
  isSending: boolean;
  sidebarOpen: boolean;
  lastSendOpts: SendMessageOpts | null;

  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  loadChats: (userEmail: string) => Promise<void>;
  selectChat: (id: string) => Promise<void>;
  createNewChat: (userEmail: string) => Promise<string | null>;
  deleteChat: (id: string) => Promise<void>;
  renameChat: (id: string, title: string) => Promise<void>;
  sendMessage: (text: string, opts: SendMessageOpts) => Promise<ChatMessage | null>;
  clearMessages: () => void;

  resolveMultiResponse: (
    messageId: string | number,
    selectedText: string,
    selectedMetadata: Record<string, unknown>,
  ) => void;
  editAndResend: (messageId: string | number, newText: string) => Promise<void>;
  regenerateLastResponse: () => Promise<void>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Build the `history` array to send to the backend.
 * Filters out optimistic / error messages and keeps the last N turns.
 */
function buildHistory(
  messages: ChatMessage[],
  limit = 20,
): Array<{ role: Role; content: string }> {
  return messages
    .filter((m) => !m.isOptimistic && !m.isError && m.content.trim())
    .slice(-limit)
    .map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Parser for messages from DB.
 * Restores Compare / Self-Consistency flags stored in metadata
 * so they render correctly after page reload.
 */
function parseMessageFromDB(m: any): ChatMessage {
  const parsed = { ...m } as ChatMessage;
  if (m.metadata) {
    if (m.metadata.isCompare) {
      parsed.isCompare = true;
      parsed.comparison = m.metadata.comparison;
    }
    if (m.metadata.isSelfConsistency) {
      parsed.isSelfConsistency = true;
      parsed.selfConsistency = m.metadata.selfConsistency;
    }
  }
  return parsed;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  activeChatId: null,
  messages: [],
  isLoadingChats: false,
  isLoadingMessages: false,
  isSending: false,
  sidebarOpen: true,
  lastSendOpts: null,

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  // SEC: userEmail param kept for signature compat but NOT sent to the server.
  // The Next.js /api/chats proxy reads email from the NextAuth session.
  loadChats: async (_userEmail) => {
    set({ isLoadingChats: true });
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch("/api/chats", { signal: controller.signal });
      clearTimeout(timeoutId);
      set({ chats: res.ok ? (await res.json()) || [] : [] });
    } catch {
      set({ chats: [] });
      toast.error("Не вдалося завантажити історію чатів");
    } finally {
      set({ isLoadingChats: false });
    }
  },

  selectChat: async (id) => {
    set({ activeChatId: id, isLoadingMessages: true, messages: [] });
    useUserLevelStore.getState().setSessionId(id);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`/api/chats/${id}/messages`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data: any[] = await res.json();
        // Guard: user may have switched chats while this was loading
        if (get().activeChatId === id) {
          const parsedMessages = (data || []).map(parseMessageFromDB);
          set({ messages: parsedMessages });
          const userTexts = parsedMessages
            .filter((m) => m.role === "user")
            .map((m) => m.content);
          await useUserLevelStore.getState().restoreFromMessages(userTexts);
        }
      } else {
        if (get().activeChatId === id) set({ messages: [] });
      }
    } catch {
      set({ messages: [] });
    } finally {
      set({ isLoadingMessages: false });
    }
  },

  // SEC: userEmail param kept for signature compat but NOT sent to the server.
  createNewChat: async (_userEmail) => {
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const chat: ChatSession = await res.json();
        set((s) => ({
          chats: [chat, ...s.chats],
          activeChatId: chat.id,
          messages: [],
        }));
        useUserLevelStore.getState().resetMetrics();
        useUserLevelStore.getState().setSessionId(chat.id);
        return chat.id;
      }
    } catch {
      toast.error("Помилка створення чату. Перевірте з'єднання.");
    }
    return null;
  },

  // FIX #6: selectChat is wrapped in try/catch.
  // Before: if the next chat returned 404 (deleted concurrently in another tab),
  // the error propagated silently and left the UI showing a ghost/empty chat.
  // After: any error from selectChat cleanly resets to no active chat.
  deleteChat: async (id) => {
    try {
      await fetch(`/api/chats/${id}`, { method: "DELETE" });

      // Remove from list and pick the next active chat
      set((s) => {
        const chats = s.chats.filter((c) => c.id !== id);
        const isActive = s.activeChatId === id;
        return {
          chats,
          activeChatId: isActive ? (chats[0]?.id ?? null) : s.activeChatId,
          messages: isActive ? [] : s.messages,
        };
      });

      // Load the newly-selected chat if there is one.
      // FIX: wrapped in try/catch — another tab may have deleted chats[0]
      // between our set() and this fetch, returning 404.
      const { activeChatId } = get();
      if (activeChatId && activeChatId !== id) {
        try {
          await get().selectChat(activeChatId);
        } catch {
          // Race condition: the "next" chat no longer exists — reset cleanly
          set({ activeChatId: null, messages: [] });
        }
      }
    } catch {
      toast.error("Не вдалося видалити чат");
    }
  },

  renameChat: async (id, title) => {
    try {
      await fetch(`/api/chats/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      set((s) => ({
        chats: s.chats.map((c) => (c.id === id ? { ...c, title } : c)),
      }));
    } catch {
      toast.error("Не вдалося перейменувати чат");
    }
  },

  resolveMultiResponse: (messageId, selectedText, selectedMetadata) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              content: selectedText,
              metadata: selectedMetadata,
              isCompare: false,
              comparison: undefined,
              isSelfConsistency: false,
              selfConsistency: undefined,
            }
          : m,
      ),
    }));
  },

  editAndResend: async (messageId, newText) => {
    const state = get();
    const idx = state.messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    set({ messages: state.messages.slice(0, idx) });
    await get().sendMessage(newText, state.lastSendOpts ?? {
      userEmail: "anonymous",
      model: "gemini-2.0-flash",
      temperature: 0.7,
      max_tokens: 1024,
    });
  },

  regenerateLastResponse: async () => {
    const state = get();
    let lastUserIdx = -1;
    for (let i = state.messages.length - 1; i >= 0; i--) {
      if (state.messages[i].role === "user") { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return;
    const lastUserMsg = state.messages[lastUserIdx];
    set({ messages: state.messages.slice(0, lastUserIdx) });
    await get().sendMessage(lastUserMsg.content, state.lastSendOpts ?? {
      userEmail: "anonymous",
      model: "gemini-2.0-flash",
      temperature: 0.7,
      max_tokens: 1024,
    });
  },

  sendMessage: async (text, opts) => {
    set({ lastSendOpts: opts });

    // FIX #5: Prevent comparing a model with itself.
    // If the user accidentally set modelA === modelB in the UI,
    // we simply ignore compareModel and run normal single-model mode.
    // This avoids two identical API calls and a pointless "comparison".
    const effectiveCompareModel =
      opts.compareModel && opts.compareModel !== opts.model
        ? opts.compareModel
        : undefined;

    const { activeChatId, messages } = get();
    let chatId = activeChatId;

    if (!chatId) {
      chatId = await get().createNewChat(opts.userEmail);
      if (!chatId) {
        set({
          messages: [{
            id: `err-${Date.now()}`,
            role: "assistant",
            content: "Не вдалося створити чат.",
            isError: true,
          }],
          isSending: false,
        });
        return null;
      }
    }

    // Optimistic UI — user sees their message instantly
    const userMsgId = `user-${uid()}`;
    const asstMsgId = `asst-${uid()}`;
    set((s) => ({
      messages: [
        ...s.messages,
        { id: userMsgId, role: "user", content: text, isOptimistic: true } as ChatMessage,
        { id: asstMsgId, role: "assistant", content: "", isOptimistic: true } as ChatMessage,
      ],
      isSending: true,
    }));

    // Build history from the PREVIOUS messages (before optimistic additions)
    const history = buildHistory(messages);

    const makePayload = (model: string) => ({
      prompt: text,
      history,              // full conversation context sent to LLM
      system_message: opts.system_message ?? "",
      model,
      temperature: opts.temperature,
      max_tokens: opts.max_tokens,
      top_p: opts.top_p ?? 1.0,
      top_k: opts.top_k ?? 40,
      stream: opts.stream ?? false,
      session_id: chatId,
    });

    const updateChatTitle = () => {
      set((s) => ({
        chats: s.chats.map((c) => {
          if (c.id !== chatId) return c;
          const newTitle =
            c.title === "Новий чат"
              ? text.slice(0, 60) + (text.length > 60 ? "…" : "")
              : c.title;
          return { ...c, title: newTitle, updated_at: new Date().toISOString() };
        }),
      }));
    };

    try {
      /* ── SELF-CONSISTENCY MODE ─────────────────────────────────────────── */
      if (opts.selfConsistencyEnabled) {
        const responses = await Promise.all(
          [1, 2, 3].map(() =>
            fetch(`${API_URL}/generate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(makePayload(opts.model)),
            }),
          ),
        );
        if (responses.some((r) => !r.ok)) throw new Error("Self-consistency failed");
        const dataArr = await Promise.all(responses.map((r) => r.json()));

        const selfConsistencyData = {
          model: opts.model,
          modelLabel: opts.modelLabel ?? opts.model,
          runs: dataArr.map((d) => ({
            text: d.text,
            latency_ms: d.usage?.latency_ms ?? 0,
            total_tokens: d.usage?.total_tokens ?? 0,
          })),
        };

        const scMsg: ChatMessage = {
          id: asstMsgId,
          role: "assistant",
          content: "",
          isSelfConsistency: true,
          isOptimistic: false,
          selfConsistency: selfConsistencyData,
          metadata: { isSelfConsistency: true, selfConsistency: selfConsistencyData },
        };
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === asstMsgId ? scMsg
            : m.id === userMsgId ? { ...m, isOptimistic: false }
            : m,
          ),
          isSending: false,
        }));
        updateChatTitle();
        return scMsg;
      }

      /* ── COMPARE MODE ──────────────────────────────────────────────────── */
      // FIX #5: effectiveCompareModel is undefined when modelA === modelB,
      // so this block is skipped and we fall through to Normal Mode.
      if (effectiveCompareModel) {
        const [resA, resB] = await Promise.all([
          fetch(`${API_URL}/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(makePayload(opts.model)),
          }),
          fetch(`${API_URL}/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(makePayload(effectiveCompareModel)),
          }),
        ]);
        if (!resA.ok || !resB.ok) throw new Error("Compare failed");
        const [dataA, dataB] = await Promise.all([resA.json(), resB.json()]);

        const comparisonData = {
          modelA: {
            text: dataA.text,
            model: opts.model,
            modelLabel: opts.modelLabel ?? opts.model,
            latency_ms: dataA.usage?.latency_ms ?? 0,
            total_tokens: dataA.usage?.total_tokens ?? 0,
          },
          modelB: {
            text: dataB.text,
            model: effectiveCompareModel,
            modelLabel: opts.compareModelLabel ?? effectiveCompareModel,
            latency_ms: dataB.usage?.latency_ms ?? 0,
            total_tokens: dataB.usage?.total_tokens ?? 0,
          },
        };

        const cmpMsg: ChatMessage = {
          id: asstMsgId,
          role: "assistant",
          content: "",
          isCompare: true,
          isOptimistic: false,
          comparison: comparisonData,
          metadata: { isCompare: true, comparison: comparisonData },
        };
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === asstMsgId ? cmpMsg
            : m.id === userMsgId ? { ...m, isOptimistic: false }
            : m,
          ),
          isSending: false,
        }));
        updateChatTitle();
        return cmpMsg;
      }

      /* ── NORMAL MODE ───────────────────────────────────────────────────── */
      const res = await fetch(`${API_URL}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makePayload(opts.model)),
      });
      if (!res.ok) throw new Error(`Generate failed: ${res.status}`);

      if (opts.stream && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Append raw bytes to the buffer; { stream: true } prevents
          // multi-byte characters from being split across chunks.
          buffer += decoder.decode(value, { stream: true });

          // Process only *complete* lines (terminated by \n).
          // If the last segment has no trailing \n it stays in the buffer
          // until the next read() appends the remainder.
          const parts = buffer.split("\n");
          buffer = parts.pop() ?? "";          // incomplete tail → keep

          for (const line of parts) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const payload = trimmed.slice(6);
            if (payload === "[DONE]") continue; // standard SSE sentinel
            try {
              const data = JSON.parse(payload);
              if (data.text) {
                accumulated += data.text;
                set((s) => ({
                  messages: s.messages.map((m) =>
                    m.id === asstMsgId
                      ? { ...m, content: accumulated, isOptimistic: false }
                      : m,
                  ),
                }));
              }
            } catch {
              // Genuinely malformed JSON — safe to skip.
              // Incomplete lines never reach here because they stay in `buffer`.
            }
          }
        }

        // Flush any residual complete line left in the buffer after the
        // stream closes (server may not send a trailing \n after last chunk).
        if (buffer.trim().startsWith("data: ")) {
          const payload = buffer.trim().slice(6);
          if (payload !== "[DONE]") {
            try {
              const data = JSON.parse(payload);
              if (data.text) {
                accumulated += data.text;
                set((s) => ({
                  messages: s.messages.map((m) =>
                    m.id === asstMsgId
                      ? { ...m, content: accumulated, isOptimistic: false }
                      : m,
                  ),
                }));
              }
            } catch { /* skip */ }
          }
        }

        // Refresh from DB to get real server IDs and metadata
        // SEC: also goes through the proxy now
        const msgsRes = await fetch(`/api/chats/${chatId}/messages`);
        if (msgsRes.ok) {
          set({ messages: (await msgsRes.json()).map(parseMessageFromDB), isSending: false });
        } else {
          set({ isSending: false });
        }
      } else {
        const data = await res.json();
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === asstMsgId
              ? {
                  ...m,
                  content: data.text,
                  isOptimistic: false,
                  metadata: {
                    model: data.usage?.model,
                    tokens: data.usage?.total_tokens,
                    latency_ms: data.usage?.latency_ms,
                    provider: data.provider,
                  },
                }
              : m.id === userMsgId
              ? { ...m, isOptimistic: false }
              : m,
          ),
          isSending: false,
        }));
      }

      updateChatTitle();
      set((s) => ({
        chats: s.chats.map((c) =>
          c.id !== chatId ? c : { ...c, message_count: c.message_count + 2 },
        ),
      }));

      return get().messages.find((m) => m.id === asstMsgId) ?? null;
    } catch {
      toast.error("Помилка підключення до сервера");
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === asstMsgId
            ? {
                ...m,
                content: "Сталася помилка при генерації відповіді. Перевірте з'єднання з сервером.",
                isError: true,
                isOptimistic: false,
              }
            : m.id === userMsgId
            ? { ...m, isOptimistic: false }
            : m,
        ),
        isSending: false,
      }));
      return null;
    }
  },

  clearMessages: () => set({ messages: [] }),
}));