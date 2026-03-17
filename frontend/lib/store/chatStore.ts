import { create } from "zustand";
import { toast } from "sonner";
import { useUserLevelStore } from "./userLevelStore";
import { API_URL } from "@/lib/config";

// Types 

export type Role = "user" | "assistant";

export interface ChatSession {
  id: string;
  title: string;
  is_favorite: boolean;
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
  selectChat: (id: string, messageIdToFocus?: number) => Promise<void>;
  createNewChat: (userEmail: string) => Promise<string | null>;
  deleteChat: (id: string) => Promise<void>;
  renameChat: (id: string, title: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
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

// Helpers

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildHistory(
  messages: ChatMessage[],
  limit = 20,
): Array<{ role: Role; content: string }> {
  return messages
    .filter((m) => !m.isOptimistic && !m.isError && m.content.trim())
    .slice(-limit)
    .map((m) => ({ role: m.role, content: m.content }));
}

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

type GeneratePayload = {
  prompt: string;
  history: Array<{ role: Role; content: string }>;
  system_message: string;
  model: string;
  temperature: number;
  max_tokens: number;
  top_p: number;
  stream: boolean;
  session_id: string;
};

function makePayload(
  text: string,
  model: string,
  opts: SendMessageOpts,
  history: Array<{ role: Role; content: string }>,
  chatId: string,
): GeneratePayload {
  return {
    prompt: text,
    history,
    system_message: opts.system_message ?? "",
    model,
    temperature: opts.temperature,
    max_tokens: opts.max_tokens,
    top_p: opts.top_p ?? 1.0,
    stream: opts.stream ?? false,
    session_id: chatId,
  };
}

function postGenerate(payload: GeneratePayload): Promise<Response> {
  return fetch(`${API_URL}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function fetchSelfConsistency(
  payload: GeneratePayload,
  opts: SendMessageOpts,
): Promise<ChatMessage["selfConsistency"]> {
  const responses = await Promise.all([1, 2, 3].map(() => postGenerate(payload)));
  if (responses.some((r) => !r.ok)) throw new Error("Self-consistency failed");
  const dataArr = await Promise.all(responses.map((r) => r.json()));
  return {
    model: opts.model,
    modelLabel: opts.modelLabel ?? opts.model,
    runs: dataArr.map((d) => ({
      text: d.text,
      latency_ms: d.usage?.latency_ms ?? 0,
      total_tokens: d.usage?.total_tokens ?? 0,
    })),
  };
}

async function fetchCompare(
  payloadA: GeneratePayload,
  payloadB: GeneratePayload,
  opts: SendMessageOpts,
  compareModel: string,
): Promise<ChatMessage["comparison"]> {
  const [resA, resB] = await Promise.all([postGenerate(payloadA), postGenerate(payloadB)]);
  if (!resA.ok || !resB.ok) throw new Error("Compare failed");
  const [dataA, dataB] = await Promise.all([resA.json(), resB.json()]);
  return {
    modelA: {
      text: dataA.text,
      model: opts.model,
      modelLabel: opts.modelLabel ?? opts.model,
      latency_ms: dataA.usage?.latency_ms ?? 0,
      total_tokens: dataA.usage?.total_tokens ?? 0,
    },
    modelB: {
      text: dataB.text,
      model: compareModel,
      modelLabel: opts.compareModelLabel ?? compareModel,
      latency_ms: dataB.usage?.latency_ms ?? 0,
      total_tokens: dataB.usage?.total_tokens ?? 0,
    },
  };
}

async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (accumulated: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const event of parts) {
      const trimmed = event.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const payload = trimmed.slice(6);
      if (payload === "[DONE]") continue;
      try {
        const data = JSON.parse(payload);
        if (data.text) {
          accumulated += data.text;
          onChunk(accumulated);
        }
      } catch {
      }
    }
  }

  // Flush residual event after stream closes
  const residual = buffer.trim();
  if (residual.startsWith("data: ")) {
    const payload = residual.slice(6);
    if (payload !== "[DONE]") {
      try {
        const data = JSON.parse(payload);
        if (data.text) {
          accumulated += data.text;
          onChunk(accumulated);
        }
      } catch { /* skip */ }
    }
  }
}

// Store 

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
      toast.error("Failed to load chat history");
    } finally {
      set({ isLoadingChats: false });
    }
  },

  selectChat: async (id, messageIdToFocus) => {
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
        if (get().activeChatId === id) {
          const parsedMessages = (data || []).map(parseMessageFromDB);
          set({ messages: parsedMessages });
          const userTexts = parsedMessages
            .filter((m) => m.role === "user")
            .map((m) => m.content);
          await useUserLevelStore.getState().restoreFromMessages(userTexts);

          if (messageIdToFocus != null) {
            setTimeout(() => {
              document
                .getElementById(`msg-${messageIdToFocus}`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 150);
          }
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
      toast.error("Failed to create chat. Check your connection.");
    }
    return null;
  },

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

      const { activeChatId } = get();
      if (activeChatId && activeChatId !== id) {
        try {
          await get().selectChat(activeChatId);
        } catch {
          set({ activeChatId: null, messages: [] });
        }
      }
    } catch {
      toast.error("Failed to delete chat");
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
      toast.error("Failed to rename chat");
    }
  },

  toggleFavorite: async (id) => {
    const chat = get().chats.find((c) => c.id === id);
    if (!chat) return;
    const newValue = !chat.is_favorite;
    // Optimistic update
    set((s) => ({
      chats: s.chats.map((c) => (c.id === id ? { ...c, is_favorite: newValue } : c)),
    }));
    try {
      await fetch(`/api/chats/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite: newValue }),
      });
    } catch {
      // Revert on failure
      set((s) => ({
        chats: s.chats.map((c) => (c.id === id ? { ...c, is_favorite: !newValue } : c)),
      }));
      toast.error("Failed to update favorite");
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
            content: "Failed to create chat.",
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

    const history = buildHistory(messages);

    /** Replace optimistic assistant placeholder + confirm user message */
    const finalizeMessages = (asstMsg: ChatMessage) => {
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === asstMsgId ? asstMsg
            : m.id === userMsgId ? { ...m, isOptimistic: false }
              : m,
        ),
        isSending: false,
      }));
    };

    const updateChatTitle = () => {
      set((s) => ({
        chats: s.chats.map((c) => {
          if (c.id !== chatId) return c;
          const newTitle =
            c.title === "New Chat"
              ? text.slice(0, 60) + (text.length > 60 ? "…" : "")
              : c.title;
          return { ...c, title: newTitle, updated_at: new Date().toISOString() };
        }),
      }));
    };

    try {
      /* SELF-CONSISTENCY MODE */
      if (opts.selfConsistencyEnabled) {
        const scData = await fetchSelfConsistency(
          makePayload(text, opts.model, opts, history, chatId), opts,
        );
        const scMsg: ChatMessage = {
          id: asstMsgId, role: "assistant", content: "",
          isSelfConsistency: true, isOptimistic: false,
          selfConsistency: scData,
          metadata: { isSelfConsistency: true, selfConsistency: scData },
        };
        finalizeMessages(scMsg);
        updateChatTitle();
        return scMsg;
      }

      /* COMPARE MODE */
      if (effectiveCompareModel) {
        const comparisonData = await fetchCompare(
          makePayload(text, opts.model, opts, history, chatId),
          makePayload(text, effectiveCompareModel, opts, history, chatId),
          opts, effectiveCompareModel,
        );
        const cmpMsg: ChatMessage = {
          id: asstMsgId, role: "assistant", content: "",
          isCompare: true, isOptimistic: false,
          comparison: comparisonData,
          metadata: { isCompare: true, comparison: comparisonData },
        };
        finalizeMessages(cmpMsg);
        updateChatTitle();
        return cmpMsg;
      }

      /* NORMAL MODE */
      const res = await postGenerate(makePayload(text, opts.model, opts, history, chatId));
      if (!res.ok) throw new Error(`Generate failed: ${res.status}`);

      if (opts.stream && res.body) {
        await readSSEStream(res.body, (accumulated) => {
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === asstMsgId
                ? { ...m, content: accumulated, isOptimistic: false }
                : m,
            ),
          }));
        });

        // Refresh from DB to get real server IDs and metadata
        const msgsRes = await fetch(`/api/chats/${chatId}/messages`);
        if (msgsRes.ok) {
          set({ messages: (await msgsRes.json()).map(parseMessageFromDB), isSending: false });
        } else {
          set({ isSending: false });
        }
      } else {
        const data = await res.json();
        finalizeMessages({
          id: asstMsgId, role: "assistant",
          content: data.text, isOptimistic: false,
          metadata: {
            model: data.usage?.model,
            tokens: data.usage?.total_tokens,
            latency_ms: data.usage?.latency_ms,
            provider: data.provider,
          },
        });
      }

      updateChatTitle();
      set((s) => ({
        chats: s.chats.map((c) =>
          c.id !== chatId ? c : { ...c, message_count: c.message_count + 2 },
        ),
      }));

      return get().messages.find((m) => m.id === asstMsgId) ?? null;
    } catch {
      toast.error("Server connection error");
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === asstMsgId
            ? {
              ...m,
              content: "An error occurred while generating a response. Please check your server connection.",
              isError: true, isOptimistic: false,
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