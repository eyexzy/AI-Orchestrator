import { create } from "zustand";
import { toast } from "sonner";
import { REQUEST_TIMEOUT_MS, ACTIVE_CHAT_STORAGE_KEY } from "@/lib/config";
import { getErrorMessage, readResponseError } from "@/lib/request";
import { getTranslation } from "./i18nStore";
import { useUserLevelStore } from "./userLevelStore";

function persistActiveChatId(id: string | null) {
  try {
    if (id) {
      window.localStorage.setItem(ACTIVE_CHAT_STORAGE_KEY, id);
    } else {
      window.localStorage.removeItem(ACTIVE_CHAT_STORAGE_KEY);
    }
  } catch {}
}

// readPersistedActiveChatId removed: blank-first UX means we never
// auto-restore on startup. persistActiveChatId writes are kept so that
// external consumers (e.g. deleteChat cleanup) can still track the active chat.

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
  chatListError: string | null;
  messagesError: string | null;
  sidebarOpen: boolean;
  lastSendOpts: SendMessageOpts | null;
  pendingFocusMessageId: string | number | null;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  clearPendingFocusMessageId: () => void;
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

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildHistory(
  messages: ChatMessage[],
  limit = 20,
): Array<{ role: Role; content: string }> {
  return messages
    .filter((message) => !message.isOptimistic && !message.isError && message.content.trim())
    .slice(-limit)
    .map((message) => ({ role: message.role, content: message.content }));
}

interface PersistedChatMessage {
  id?: string | number;
  role?: Role;
  content?: string;
  created_at?: string | null;
  metadata?: Record<string, unknown>;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRole(value: unknown): value is Role {
  return value === "user" || value === "assistant";
}

function parseCompareResult(value: unknown): CompareResult | null {
  if (!isObjectRecord(value)) return null;
  if (
    typeof value.text !== "string" ||
    typeof value.model !== "string" ||
    typeof value.modelLabel !== "string" ||
    typeof value.latency_ms !== "number" ||
    typeof value.total_tokens !== "number"
  ) {
    return null;
  }

  return {
    text: value.text,
    model: value.model,
    modelLabel: value.modelLabel,
    latency_ms: value.latency_ms,
    total_tokens: value.total_tokens,
  };
}

function parseComparison(
  value: unknown,
): ChatMessage["comparison"] | undefined {
  if (!isObjectRecord(value)) return undefined;

  const modelA = parseCompareResult(value.modelA);
  const modelB = parseCompareResult(value.modelB);

  if (!modelA || !modelB) return undefined;

  return { modelA, modelB };
}

function parseSelfConsistencyRun(value: unknown): SelfConsistencyRun | null {
  if (!isObjectRecord(value)) return null;
  if (
    typeof value.text !== "string" ||
    typeof value.latency_ms !== "number" ||
    typeof value.total_tokens !== "number"
  ) {
    return null;
  }

  return {
    text: value.text,
    latency_ms: value.latency_ms,
    total_tokens: value.total_tokens,
  };
}

function parseSelfConsistency(
  value: unknown,
): ChatMessage["selfConsistency"] | undefined {
  if (!isObjectRecord(value)) return undefined;
  if (
    typeof value.model !== "string" ||
    typeof value.modelLabel !== "string" ||
    !Array.isArray(value.runs)
  ) {
    return undefined;
  }

  const runs = value.runs
    .map(parseSelfConsistencyRun)
    .filter((run): run is SelfConsistencyRun => run !== null);

  if (runs.length === 0) return undefined;

  return {
    model: value.model,
    modelLabel: value.modelLabel,
    runs,
  };
}

function parseMessageFromDB(message: unknown): ChatMessage {
  const persisted = isObjectRecord(message)
    ? (message as PersistedChatMessage)
    : {};
  const metadata = isObjectRecord(persisted.metadata)
    ? persisted.metadata
    : undefined;
  const comparison =
    metadata?.isCompare === true
      ? parseComparison(metadata.comparison)
      : undefined;
  const selfConsistency =
    metadata?.isSelfConsistency === true
      ? parseSelfConsistency(metadata.selfConsistency)
      : undefined;

  return {
    id:
      typeof persisted.id === "string" || typeof persisted.id === "number"
        ? persisted.id
        : `db-${uid()}`,
    role: isRole(persisted.role) ? persisted.role : "assistant",
    content: typeof persisted.content === "string" ? persisted.content : "",
    created_at:
      typeof persisted.created_at === "string"
        ? persisted.created_at
        : undefined,
    metadata,
    isCompare: Boolean(comparison),
    comparison,
    isSelfConsistency: Boolean(selfConsistency),
    selfConsistency,
  };
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

type MultiGeneratePayload = GeneratePayload & {
  mode: "compare" | "self_consistency";
  compare_model?: string;
  model_label?: string;
  compare_model_label?: string;
  run_count?: number;
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
  return fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function postMultiGenerate(payload: MultiGeneratePayload): Promise<Response> {
  return fetch("/api/generate/multi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function normalizeServerMessageId(id: string | number): number | null {
  if (typeof id === "number" && Number.isInteger(id)) {
    return id;
  }
  if (typeof id === "string" && /^\d+$/.test(id)) {
    return Number(id);
  }
  return null;
}

function deriveChatTitle(currentTitle: string, text: string): string {
  if (currentTitle !== "New Chat") return currentTitle;
  return text.slice(0, 60) + (text.length > 60 ? "..." : "");
}

function findLatestAssistantMessage(messages: ChatMessage[]): ChatMessage | null {
  return [...messages].reverse().find((message) => message.role === "assistant") ?? null;
}

async function fetchChatMessages(chatId: string): Promise<ChatMessage[]> {
  const res = await fetch(`/api/chats/${chatId}/messages`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(await readResponseError(res, "Failed to refresh chat messages"));
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data)) {
    return [];
  }
  return data.map(parseMessageFromDB);
}

async function truncateChatMessages(chatId: string, afterId: number): Promise<void> {
  const res = await fetch(`/api/chats/${chatId}/messages/truncate?after_id=${afterId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(await readResponseError(res, "Failed to truncate chat history"));
  }
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
      } catch {
      }
    }
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  activeChatId: null,
  messages: [],
  isLoadingChats: false,
  isLoadingMessages: false,
  isSending: false,
  chatListError: null,
  messagesError: null,
  sidebarOpen: true,
  lastSendOpts: null,
  pendingFocusMessageId: null,

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  clearPendingFocusMessageId: () => set({ pendingFocusMessageId: null }),

  loadChats: async (_userEmail) => {
    set({ isLoadingChats: true, chatListError: null });
    try {
      const res = await fetchWithTimeout("/api/chats");
      if (!res.ok) {
        throw new Error(
          await readResponseError(res, getTranslation("sidebar.loadErrorDescription")),
        );
      }

      const data = await res.json();
      const loadedChats: ChatSession[] = Array.isArray(data) ? data : [];
      set({ chats: loadedChats, chatListError: null });

      // Blank-first UX: do NOT auto-restore the last active chat.
      // The user starts with a clean workspace and selects a chat explicitly.
    } catch (error) {
      set({
        chatListError: getErrorMessage(
          error,
          getTranslation("sidebar.loadErrorDescription"),
        ),
      });
    } finally {
      set({ isLoadingChats: false });
    }
  },

  selectChat: async (id, messageIdToFocus) => {
    persistActiveChatId(id);
    set({
      activeChatId: id,
      isLoadingMessages: true,
      messages: [],
      messagesError: null,
      pendingFocusMessageId: messageIdToFocus ?? null,
    });
    useUserLevelStore.getState().setChatId(id);
    try {
      const res = await fetchWithTimeout(`/api/chats/${id}/messages`);
      if (!res.ok) {
        throw new Error(
          await readResponseError(res, getTranslation("chat.loadErrorDescription")),
        );
      }

      const data: unknown = await res.json();
      if (get().activeChatId === id) {
        const parsedMessages = Array.isArray(data)
          ? data.map(parseMessageFromDB)
          : [];
        set({ messages: parsedMessages, messagesError: null });
        // Reset behavioral session metrics — chat history is for UX/context only,
        // not for scoring the current behavioral session.
        useUserLevelStore.getState().resetMetrics();
      }
    } catch (error) {
      if (get().activeChatId === id) {
        set({
          messages: [],
          messagesError: getErrorMessage(
            error,
            getTranslation("chat.loadErrorDescription"),
          ),
          pendingFocusMessageId: null,
        });
      }
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
      if (!res.ok) {
        throw new Error(await readResponseError(res, "Failed to create chat"));
      }

      const chat: ChatSession = await res.json();
      persistActiveChatId(chat.id);
      set((state) => ({
        chats: [chat, ...state.chats],
        activeChatId: chat.id,
        messages: [],
        messagesError: null,
      }));
      useUserLevelStore.getState().resetMetrics();
      useUserLevelStore.getState().setChatId(chat.id);
      return chat.id;
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to create chat"));
    }
    return null;
  },

  deleteChat: async (id) => {
    try {
      const res = await fetch(`/api/chats/${id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(await readResponseError(res, "Failed to delete chat"));
      }

      set((state) => {
        const chats = state.chats.filter((chat) => chat.id !== id);
        const isActive = state.activeChatId === id;
        if (isActive) persistActiveChatId(null);
        return {
          chats,
          activeChatId: isActive ? null : state.activeChatId,
          messages: isActive ? [] : state.messages,
          messagesError: isActive ? null : state.messagesError,
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
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to delete chat"));
    }
  },

  renameChat: async (id, title) => {
    try {
      const res = await fetch(`/api/chats/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        throw new Error(await readResponseError(res, "Failed to rename chat"));
      }
      set((state) => ({
        chats: state.chats.map((chat) => (chat.id === id ? { ...chat, title } : chat)),
      }));
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to rename chat"));
    }
  },

  toggleFavorite: async (id) => {
    const chat = get().chats.find((item) => item.id === id);
    if (!chat) return;

    const newValue = !chat.is_favorite;
    set((state) => ({
      chats: state.chats.map((item) =>
        item.id === id ? { ...item, is_favorite: newValue } : item,
      ),
    }));

    try {
      const res = await fetch(`/api/chats/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite: newValue }),
      });
      if (!res.ok) {
        throw new Error(await readResponseError(res, "Failed to update favorite"));
      }
    } catch (error) {
      set((state) => ({
        chats: state.chats.map((item) =>
          item.id === id ? { ...item, is_favorite: !newValue } : item,
        ),
      }));
      toast.error(getErrorMessage(error, "Failed to update favorite"));
    }
  },

  resolveMultiResponse: (messageId, selectedText, selectedMetadata) => {
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === messageId
          ? {
            ...message,
            content: selectedText,
            metadata: selectedMetadata,
            isCompare: false,
            comparison: undefined,
            isSelfConsistency: false,
            selfConsistency: undefined,
          }
          : message,
      ),
    }));
  },

  editAndResend: async (messageId, newText) => {
    const state = get();
    const chatId = state.activeChatId;
    const idx = state.messages.findIndex((message) => message.id === messageId);
    if (!chatId || idx === -1) return;

    const preservedMessages = state.messages.slice(0, idx);
    const preserveAfterId = idx > 0
      ? normalizeServerMessageId(state.messages[idx - 1]?.id)
      : 0;

    if (idx > 0 && preserveAfterId === null) {
      toast.error("Failed to sync chat history. Reload the chat and try again.");
      return;
    }

    try {
      await truncateChatMessages(chatId, preserveAfterId ?? 0);
    } catch {
      toast.error("Failed to update chat history");
      return;
    }

    set((store) => ({
      messages: preservedMessages,
      chats: store.chats.map((chat) =>
        chat.id !== chatId
          ? chat
          : {
            ...chat,
            message_count: preservedMessages.length,
            updated_at: new Date().toISOString(),
          },
      ),
    }));

    await get().sendMessage(newText, state.lastSendOpts ?? {
      userEmail: "anonymous",
      model: "gemini-2.0-flash",
      temperature: 0.7,
      max_tokens: 1024,
    });
  },

  regenerateLastResponse: async () => {
    const state = get();
    const chatId = state.activeChatId;
    let lastUserIdx = -1;
    for (let i = state.messages.length - 1; i >= 0; i--) {
      if (state.messages[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (!chatId || lastUserIdx === -1) return;

    const lastUserMsg = state.messages[lastUserIdx];
    const preservedMessages = state.messages.slice(0, lastUserIdx);
    const preserveAfterId = lastUserIdx > 0
      ? normalizeServerMessageId(state.messages[lastUserIdx - 1]?.id)
      : 0;

    if (lastUserIdx > 0 && preserveAfterId === null) {
      toast.error("Failed to sync chat history. Reload the chat and try again.");
      return;
    }

    try {
      await truncateChatMessages(chatId, preserveAfterId ?? 0);
    } catch {
      toast.error("Failed to update chat history");
      return;
    }

    set((store) => ({
      messages: preservedMessages,
      chats: store.chats.map((chat) =>
        chat.id !== chatId
          ? chat
          : {
            ...chat,
            message_count: preservedMessages.length,
            updated_at: new Date().toISOString(),
          },
      ),
    }));

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

    const currentChatId = chatId;
    const userMsgId = `user-${uid()}`;
    const asstMsgId = `asst-${uid()}`;

    set((state) => ({
      messages: [
        ...state.messages,
        { id: userMsgId, role: "user", content: text, isOptimistic: true } as ChatMessage,
        { id: asstMsgId, role: "assistant", content: "", isOptimistic: true } as ChatMessage,
      ],
      isSending: true,
      messagesError: null,
    }));

    const history = buildHistory(messages);

    const finalizeMessages = (assistantMessage: ChatMessage) => {
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === asstMsgId
            ? assistantMessage
            : message.id === userMsgId
              ? { ...message, isOptimistic: false }
              : message,
        ),
        isSending: false,
      }));
    };

    const updateChatSummary = (messageCount: number) => {
      set((state) => ({
        chats: state.chats.map((chat) => {
          if (chat.id !== currentChatId) return chat;
          return {
            ...chat,
            title: deriveChatTitle(chat.title, text),
            updated_at: new Date().toISOString(),
            message_count: messageCount,
          };
        }),
      }));
    };

    const syncPersistedState = async () => {
      const syncedMessages = await fetchChatMessages(currentChatId);
      set({ messages: syncedMessages, isSending: false });
      updateChatSummary(syncedMessages.length);
      return syncedMessages;
    };

    try {
      if (opts.selfConsistencyEnabled) {
        const res = await postMultiGenerate({
          ...makePayload(text, opts.model, opts, history, currentChatId),
          mode: "self_consistency",
          model_label: opts.modelLabel ?? opts.model,
          run_count: 3,
        });
        if (!res.ok) {
          throw new Error(await readResponseError(res, getTranslation("chat.sendError")));
        }
        const data = await res.json();
        const assistantMessage = data?.assistant_message
          ? parseMessageFromDB(data.assistant_message)
          : null;
        if (!assistantMessage) throw new Error("Self-consistency response was empty");
        finalizeMessages(assistantMessage);
        try {
          const syncedMessages = await syncPersistedState();
          return findLatestAssistantMessage(syncedMessages) ?? assistantMessage;
        } catch {
          updateChatSummary(get().messages.length);
          return assistantMessage;
        }
      }

      if (effectiveCompareModel) {
        const res = await postMultiGenerate({
          ...makePayload(text, opts.model, opts, history, currentChatId),
          mode: "compare",
          compare_model: effectiveCompareModel,
          model_label: opts.modelLabel ?? opts.model,
          compare_model_label: opts.compareModelLabel ?? effectiveCompareModel,
        });
        if (!res.ok) {
          throw new Error(await readResponseError(res, getTranslation("chat.sendError")));
        }
        const data = await res.json();
        const assistantMessage = data?.assistant_message
          ? parseMessageFromDB(data.assistant_message)
          : null;
        if (!assistantMessage) throw new Error("Compare response was empty");
        finalizeMessages(assistantMessage);
        try {
          const syncedMessages = await syncPersistedState();
          return findLatestAssistantMessage(syncedMessages) ?? assistantMessage;
        } catch {
          updateChatSummary(get().messages.length);
          return assistantMessage;
        }
      }

      const res = await postGenerate(makePayload(text, opts.model, opts, history, currentChatId));
      if (!res.ok) {
        throw new Error(await readResponseError(res, getTranslation("chat.sendError")));
      }

      if (opts.stream && res.body) {
        await readSSEStream(res.body, (accumulated) => {
          set((state) => ({
            messages: state.messages.map((message) =>
              message.id === asstMsgId
                ? { ...message, content: accumulated, isOptimistic: false }
                : message,
            ),
          }));
        });

        try {
          const syncedMessages = await syncPersistedState();
          return findLatestAssistantMessage(syncedMessages);
        } catch {
          set({ isSending: false });
          updateChatSummary(get().messages.length);
          return findLatestAssistantMessage(get().messages);
        }
      }

      const data = await res.json();
      const fallbackMessage: ChatMessage = {
        id: asstMsgId,
        role: "assistant",
        content: data.text,
        isOptimistic: false,
        metadata: {
          model: data.usage?.model,
          tokens: data.usage?.total_tokens,
          latency_ms: data.usage?.latency_ms,
          provider: data.provider,
        },
      };
      finalizeMessages(fallbackMessage);

      try {
        const syncedMessages = await syncPersistedState();
        return findLatestAssistantMessage(syncedMessages) ?? fallbackMessage;
      } catch {
        updateChatSummary(get().messages.length);
        return fallbackMessage;
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error, getTranslation("chat.sendError"));
      toast.error(errorMessage);
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === asstMsgId
            ? {
              ...message,
              content: errorMessage,
              isError: true,
              isOptimistic: false,
            }
            : message.id === userMsgId
              ? { ...message, isOptimistic: false }
              : message,
        ),
        isSending: false,
      }));
      updateChatSummary(get().messages.length);
      return null;
    }
  },

  clearMessages: () => set({ messages: [] }),
}));