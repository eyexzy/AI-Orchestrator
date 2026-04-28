import { create } from "zustand";
import { actionToast } from "@/components/ui/action-toast";
import {
  REQUEST_TIMEOUT_MS,
  ACTIVE_CHAT_STORAGE_KEY,
  CHAT_SIDEBAR_STATE_STORAGE_KEY,
  CHATS_CACHE_TTL_MS,
  CHAT_MESSAGES_CACHE_TTL_MS,
  CHATS_CACHE_STORAGE_KEY,
  ACTIVE_CHAT_MESSAGES_STORAGE_KEY,
} from "@/lib/config";
import { getErrorMessage, readResponseError } from "@/lib/request";
import { getTranslation } from "./i18nStore";
import { useUserLevelStore } from "./userLevelStore";
import { useProjectStore } from "./projectStore";
import { makeScopedStorageKey, readPersistedState, writePersistedState } from "@/lib/persistedState";

function persistActiveChatId(id: string | null) {
  try {
    if (id) {
      window.localStorage.setItem(ACTIVE_CHAT_STORAGE_KEY, id);
    } else {
      window.localStorage.removeItem(ACTIVE_CHAT_STORAGE_KEY);
    }
  } catch {}
}

function readPersistedActiveChatId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_CHAT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export type Role = "user" | "assistant";

export const NEW_CHAT_SENTINEL = "New Chat";

export interface ChatSession {
  id: string;
  title: string;
  is_favorite: boolean;
  project_id?: string | null;
  project_name?: string | null;
  parent_chat_id?: string | null;
  forked_from_message_id?: number | null;
  created_at: string;
  updated_at: string;
  message_count: number;
  isPending?: boolean;
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

export interface MessageAttachment {
  id: string;
  filename: string;
  mimeType: string;
  previewUrl?: string; // data URL for images (only in optimistic messages)
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
  /** Attachments shown in the message bubble (user messages) */
  attachments?: MessageAttachment[];
}

export interface InlineAttachmentPayload {
  filename: string;
  mime_type: string;
  data: string; // base64
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
  projectId?: string | null;
  forceNewChat?: boolean;
  attachmentIds?: string[];
  inlineAttachments?: Array<{ id: string; filename: string; mimeType: string; data: string }>;
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
  composerSendOpts: SendMessageOpts | null;
  pendingFocusMessageId: string | number | null;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setComposerSendOpts: (opts: SendMessageOpts | null) => void;
  clearPendingFocusMessageId: () => void;
  openDraftChat: () => void;
  loadChats: (userEmail: string, force?: boolean) => Promise<void>;
  selectChat: (id: string, messageIdToFocus?: number) => Promise<void>;
  createNewChat: (
    userEmail: string,
    options?: { title?: string; projectId?: string | null },
  ) => Promise<string | null>;
  deleteChat: (id: string) => Promise<void>;
  renameChat: (id: string, title: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  assignChatToProject: (id: string, projectId: string | null) => Promise<void>;
  forkChatFromMessage: (
    messageId: string | number,
    options?: { title?: string; projectId?: string | null },
  ) => Promise<string | null>;
  stopGeneration: () => void;
  sendMessage: (text: string, opts: SendMessageOpts) => Promise<ChatMessage | null>;
  clearMessages: () => void;
  resolveMultiResponse: (
    messageId: string | number,
    selectedText: string,
    selectedMetadata: Record<string, unknown>,
  ) => void;
  editAndResend: (messageId: string | number, newText: string, attachments?: MessageAttachment[]) => Promise<void>;
  regenerateLastResponse: () => Promise<void>;
  continueAssistantMessage: (messageId: string | number) => Promise<ChatMessage | null>;
}

type ChatStateSetter = (
  partial:
    | ChatState
    | Partial<ChatState>
    | ((state: ChatState) => ChatState | Partial<ChatState>),
  replace?: false,
) => void;

export function dedupeChatSessions(chats: ChatSession[]): ChatSession[] {
  const seen = new Set<string>();
  const uniqueChats: ChatSession[] = [];

  for (const chat of chats) {
    if (seen.has(chat.id)) continue;
    seen.add(chat.id);
    uniqueChats.push(chat);
  }

  return uniqueChats;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createClientChatId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `chat-${uid()}`;
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

interface PersistedChatSession {
  id?: unknown;
  title?: unknown;
  is_favorite?: unknown;
  project_id?: unknown;
  project_name?: unknown;
  parent_chat_id?: unknown;
  forked_from_message_id?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  message_count?: unknown;
}

function parseChatSessionFromDB(chat: unknown): ChatSession {
  const persisted = isObjectRecord(chat)
    ? (chat as PersistedChatSession)
    : {};

  return {
    id: typeof persisted.id === "string" ? persisted.id : uid(),
    title: typeof persisted.title === "string" ? persisted.title : NEW_CHAT_SENTINEL,
    is_favorite: Boolean(persisted.is_favorite),
    project_id: typeof persisted.project_id === "string" ? persisted.project_id : null,
    project_name: typeof persisted.project_name === "string" ? persisted.project_name : null,
    parent_chat_id: typeof persisted.parent_chat_id === "string" ? persisted.parent_chat_id : null,
    forked_from_message_id:
      typeof persisted.forked_from_message_id === "number"
        ? persisted.forked_from_message_id
        : null,
    created_at:
      typeof persisted.created_at === "string"
        ? persisted.created_at
        : new Date().toISOString(),
    updated_at:
      typeof persisted.updated_at === "string"
        ? persisted.updated_at
        : new Date().toISOString(),
    message_count:
      typeof persisted.message_count === "number"
        ? persisted.message_count
        : 0,
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
  continuation_text?: string;
  continuation_message_id?: number;
  attachment_ids?: string[];
  inline_attachments?: Array<{ filename: string; mime_type: string; data: string }>;
  project_id?: string | null;
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
  const payload: GeneratePayload = {
    prompt: text,
    history,
    system_message: opts.system_message ?? "",
    model,
    temperature: opts.temperature,
    max_tokens: opts.max_tokens,
    top_p: opts.top_p ?? 1.0,
    stream: opts.stream ?? true,
    session_id: chatId,
  };
  if (opts.attachmentIds && opts.attachmentIds.length > 0) {
    payload.attachment_ids = opts.attachmentIds;
  }
  if (opts.inlineAttachments && opts.inlineAttachments.length > 0) {
    payload.inline_attachments = opts.inlineAttachments.map((a) => ({
      filename: a.filename,
      mime_type: a.mimeType,
      data: a.data,
    }));
  }
  if (opts.projectId) {
    payload.project_id = opts.projectId;
  }
  return payload;
}

function makeContinuationPayload(
  model: string,
  opts: SendMessageOpts,
  history: Array<{ role: Role; content: string }>,
  chatId: string,
  continuationText: string,
  continuationMessageId: number,
): GeneratePayload {
  return {
    ...makePayload("", model, opts, history, chatId),
    continuation_text: continuationText,
    continuation_message_id: continuationMessageId,
  };
}

function postGenerate(
  payload: GeneratePayload,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
}

function postMultiGenerate(
  payload: MultiGeneratePayload,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch("/api/generate/multi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
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
  if (currentTitle !== NEW_CHAT_SENTINEL) return currentTitle;
  return text.slice(0, 60) + (text.length > 60 ? "..." : "");
}

function findLatestAssistantMessage(messages: ChatMessage[]): ChatMessage | null {
  return [...messages].reverse().find((message) => message.role === "assistant") ?? null;
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function formatChatSendErrorMessage(
  error: unknown,
  modelLabel: string,
): string {
  const fallbackMessage = getTranslation("chat.sendError");
  const rawMessage = getErrorMessage(error, fallbackMessage)
    .replace(/\s+/g, " ")
    .trim();

  if (/daily_limit_exceeded/i.test(rawMessage)) {
    const now = new Date();
    const reset = new Date(now);
    reset.setUTCHours(24, 0, 0, 0);
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const day = reset.getUTCDate();
    const suffix = day === 1 || day === 21 || day === 31 ? "st" : day === 2 || day === 22 ? "nd" : day === 3 || day === 23 ? "rd" : "th";
    const hh = String(reset.getUTCHours()).padStart(2, "0");
    const mm = String(reset.getUTCMinutes()).padStart(2, "0");
    const resetStr = `${months[reset.getUTCMonth()]} ${day}${suffix}, ${reset.getUTCFullYear()} ${hh}:${mm} UTC`;
    return getTranslation("chat.errorDailyLimitReached").replace("{time}", resetStr);
  }

  if (/provider_http_402|error code:\s*402|credits|afford/i.test(rawMessage)) {
    return getTranslation("chat.errorInsufficientCredits");
  }

  if (
    /temporarily rate-limited upstream|rate-limited upstream|rate limit|rate-limited/i.test(rawMessage) ||
    /provider_http_429|error code:\s*429/i.test(rawMessage) ||
    /['"]code['"]:\s*429/i.test(rawMessage)
  ) {
    return getTranslation("chat.errorRateLimited").replace("{model}", modelLabel);
  }

  if (
    /provider returned error|llm provider unavailable|provider unavailable|provider_failure/i.test(rawMessage) ||
    /provider_http_5\d\d|error code:\s*5\d\d/i.test(rawMessage)
  ) {
    return getTranslation("chat.errorProviderUnavailable").replace("{model}", modelLabel);
  }

  if (/backend unreachable|failed to fetch|networkerror|fetch failed/i.test(rawMessage)) {
    return getTranslation("chat.errorBackendUnavailable");
  }

  return fallbackMessage;
}

function parseRequestOptionsFromMetadata(metadata?: Record<string, unknown>) {
  const requestOptions = isObjectRecord(metadata?.request_options)
    ? metadata.request_options
    : {};

  return {
    model: typeof requestOptions.model_id === "string" ? requestOptions.model_id : undefined,
    temperature:
      typeof requestOptions.temperature === "number" ? requestOptions.temperature : undefined,
    max_tokens:
      typeof requestOptions.max_tokens === "number" ? requestOptions.max_tokens : undefined,
    top_p: typeof requestOptions.top_p === "number" ? requestOptions.top_p : undefined,
    system_message:
      typeof requestOptions.system_message === "string"
        ? requestOptions.system_message
        : undefined,
  };
}

function withGenerationDuration(
  message: ChatMessage,
  durationMs: number,
  stopped = false,
): ChatMessage {
  const previousSummary = isObjectRecord(message.metadata?.generation_summary)
    ? message.metadata.generation_summary
    : {};
  const nextMetadata = {
    ...(message.metadata ?? {}),
    generation_ms: Math.max(0, Math.round(durationMs)),
    generation_summary: {
      ...previousSummary,
      duration_ms: Math.max(0, Math.round(durationMs)),
      ...(stopped ? { stopped: true, can_continue: true } : {}),
    },
    ...(stopped ? { generation_stopped: true, generation_can_continue: true } : {}),
  };

  return {
    ...message,
    metadata: nextMetadata,
  };
}

type CachedMessagesEntry = {
  messages: ChatMessage[];
  fetchedAt: number;
};

type PersistedChatsCache = {
  chats: ChatSession[];
  fetchedAt: number;
};

type PersistedActiveChatMessagesCache = {
  chatId: string;
  messages: ChatMessage[];
  fetchedAt: number;
};

function getScopedChatStorageKey(baseKey: string, userEmail?: string | null): string {
  return makeScopedStorageKey(baseKey, userEmail);
}

function readPersistedSidebarOpen(userEmail?: string | null): boolean {
  const persisted = readPersistedState<boolean>(getScopedChatStorageKey(CHAT_SIDEBAR_STATE_STORAGE_KEY, userEmail));
  return typeof persisted === "boolean" ? persisted : true;
}

function writePersistedSidebarOpen(open: boolean, userEmail?: string | null): void {
  writePersistedState(getScopedChatStorageKey(CHAT_SIDEBAR_STATE_STORAGE_KEY, userEmail), open);
}

function readPersistedChatsCache(userEmail?: string | null): PersistedChatsCache | null {
  const persisted = readPersistedState<PersistedChatsCache>(
    getScopedChatStorageKey(CHATS_CACHE_STORAGE_KEY, userEmail),
  );
  if (!persisted || !Array.isArray(persisted.chats) || typeof persisted.fetchedAt !== "number") {
    return null;
  }
  return persisted;
}

function writePersistedChatsCache(data: PersistedChatsCache, userEmail?: string | null): void {
  writePersistedState(getScopedChatStorageKey(CHATS_CACHE_STORAGE_KEY, userEmail), data);
}

function readPersistedActiveChatMessagesCache(userEmail?: string | null): PersistedActiveChatMessagesCache | null {
  const persisted = readPersistedState<PersistedActiveChatMessagesCache>(
    getScopedChatStorageKey(ACTIVE_CHAT_MESSAGES_STORAGE_KEY, userEmail),
  );
  if (
    !persisted ||
    typeof persisted.chatId !== "string" ||
    !Array.isArray(persisted.messages) ||
    typeof persisted.fetchedAt !== "number"
  ) {
    return null;
  }
  return persisted;
}

function writePersistedActiveChatMessagesCache(
  data: PersistedActiveChatMessagesCache | null,
  userEmail?: string | null,
): void {
  writePersistedState(getScopedChatStorageKey(ACTIVE_CHAT_MESSAGES_STORAGE_KEY, userEmail), data);
}

let chatsInflight: Promise<void> | null = null;
let chatsInflightScopeKey: string | null = null;
let chatsLastFetchedAt = 0;
const chatMessagesCache = new Map<string, CachedMessagesEntry>();
let activeGenerationController: AbortController | null = null;

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
  onPayload: (payload: Record<string, unknown>) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
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
        if (typeof data.error === "string" && data.error.trim()) {
          const msg = data.error_code ? `provider_http_${data.error_code}` : data.error;
          throw new Error(msg);
        }
        if (isObjectRecord(data)) onPayload(data);
      } catch (error) {
        if (error instanceof Error) {
          throw error;
        }
      }
    }
  }

  const residual = buffer.trim();
  if (residual.startsWith("data: ")) {
    const payload = residual.slice(6);
    if (payload !== "[DONE]") {
      try {
        const data = JSON.parse(payload);
        if (typeof data.error === "string" && data.error.trim()) {
          const msg = data.error_code ? `provider_http_${data.error_code}` : data.error;
          throw new Error(msg);
        }
        if (isObjectRecord(data)) onPayload(data);
      } catch (error) {
        if (error instanceof Error) {
          throw error;
        }
      }
    }
  }
}

function parseSSEText(
  text: string,
  onPayload: (payload: Record<string, unknown>) => void,
): string {
  let accumulated = "";
  let buffer = text;

  const parts = buffer.split("\n\n");
  buffer = parts.pop() ?? "";

  for (const event of parts) {
    const trimmed = event.trim();
    if (!trimmed.startsWith("data: ")) continue;
    const payload = trimmed.slice(6);
    if (payload === "[DONE]") continue;

    try {
      const data = JSON.parse(payload);
      if (typeof data.error === "string" && data.error.trim()) {
        throw new Error(data.error);
      }
      if (
        typeof data.text === "string" &&
        data.text.length > 0 &&
        (!data.type || data.type === "text")
      ) {
        accumulated += data.text;
      }
      if (isObjectRecord(data)) {
        onPayload(data);
      }
      if (typeof data.full_text === "string" && data.full_text.trim()) {
        accumulated = data.full_text;
      }
    } catch (error) {
      if (error instanceof Error) throw error;
    }
  }

  const residual = buffer.trim();
  if (residual.startsWith("data: ")) {
    const payload = residual.slice(6);
    if (payload !== "[DONE]") {
      const data = JSON.parse(payload);
      if (typeof data.error === "string" && data.error.trim()) {
        throw new Error(data.error);
      }
      if (
        typeof data.text === "string" &&
        data.text.length > 0 &&
        (!data.type || data.type === "text")
      ) {
        accumulated += data.text;
      }
      if (isObjectRecord(data)) {
        onPayload(data);
      }
      if (typeof data.full_text === "string" && data.full_text.trim()) {
        accumulated = data.full_text;
      }
    }
  }

  return accumulated;
}

function updateOptimisticAssistantMessage(
  setState: ChatStateSetter,
  assistantMessageId: string | number,
  nextContent: string,
) {
  setState((state) => {
    let changed = false;
    const nextMessages = state.messages.map((message) => {
      if (message.id !== assistantMessageId) return message;
      if (message.content === nextContent && message.isOptimistic === false) {
        return message;
      }
      changed = true;
      return {
        ...message,
        content: nextContent,
        isOptimistic: false,
      };
    });

    return changed ? { messages: nextMessages } : state;
  });
}

function updateOptimisticAssistantMetadata(
  setState: ChatStateSetter,
  assistantMessageId: string | number,
  updater: (metadata: Record<string, unknown>) => Record<string, unknown>,
) {
  setState((state) => {
    let changed = false;
    const nextMessages = state.messages.map((message) => {
      if (message.id !== assistantMessageId) return message;
      const nextMetadata = updater(isObjectRecord(message.metadata) ? message.metadata : {});
      changed = true;
      return {
        ...message,
        metadata: nextMetadata,
      };
    });

    return changed ? { messages: nextMessages } : state;
  });
}

function mergeGenerationSnapshot(
  metadata: Record<string, unknown>,
  payload: Record<string, unknown>,
) {
  const nextMetadata = { ...metadata };

  if (Array.isArray(payload.generation_trace)) {
    nextMetadata.generation_trace = payload.generation_trace;
  }

  if (isObjectRecord(payload.generation_summary)) {
    const previousSummary = isObjectRecord(nextMetadata.generation_summary)
      ? nextMetadata.generation_summary
      : {};
    nextMetadata.generation_summary = {
      ...previousSummary,
      ...payload.generation_summary,
    };

    const summary = nextMetadata.generation_summary as Record<string, unknown>;
    if (typeof summary.model_label === "string") {
      nextMetadata.model = summary.model_label;
    }
    if (typeof summary.provider === "string") {
      nextMetadata.provider = summary.provider;
    }
    if (typeof summary.estimated_tokens === "number") {
      nextMetadata.tokens = summary.estimated_tokens;
    }
    if (typeof summary.duration_ms === "number") {
      nextMetadata.generation_ms = summary.duration_ms;
      nextMetadata.latency_ms = summary.duration_ms;
    }
  }

  return nextMetadata;
}

function createStreamingChunkUpdater(
  setState: ChatStateSetter,
  assistantMessageId: string | number,
  initialContent = "",
) {
  let latestContent = initialContent;
  let frameId: number | null = null;

  const flush = () => {
    frameId = null;
    updateOptimisticAssistantMessage(setState, assistantMessageId, latestContent);
  };

  return {
    push(nextContent: string) {
      latestContent = nextContent;

      if (typeof window === "undefined") {
        flush();
        return;
      }

      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(flush);
    },
    flush() {
      if (typeof window !== "undefined" && frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      flush();
    },
    getLatest() {
      return latestContent;
    },
  };
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
  composerSendOpts: null,
  pendingFocusMessageId: null,

  setSidebarOpen: (open) => {
    writePersistedSidebarOpen(open, useUserLevelStore.getState().userEmail);
    set({ sidebarOpen: open });
  },
  toggleSidebar: () =>
    set((state) => {
      const nextOpen = !state.sidebarOpen;
      writePersistedSidebarOpen(nextOpen, useUserLevelStore.getState().userEmail);
      return { sidebarOpen: nextOpen };
    }),
  setComposerSendOpts: (opts) => set({ composerSendOpts: opts }),
  clearPendingFocusMessageId: () => set({ pendingFocusMessageId: null }),
  openDraftChat: () => {
    persistActiveChatId(null);
    set({
      activeChatId: null,
      messages: [],
      isLoadingMessages: false,
      isSending: false,
      messagesError: null,
      pendingFocusMessageId: null,
    });
    useUserLevelStore.getState().setChatId(null);
    useUserLevelStore.getState().resetMetrics();
  },

  loadChats: async (userEmail, force = false) => {
    const { isLoadingChats, chats } = get();
    const scopeKey = getScopedChatStorageKey(CHATS_CACHE_STORAGE_KEY, userEmail);
    const hasFreshCache =
      (chats.length > 0 || chatsLastFetchedAt > 0) &&
      Date.now() - chatsLastFetchedAt < CHATS_CACHE_TTL_MS;

    if ((!force && hasFreshCache) || isLoadingChats) return;
    if (chatsInflight && chatsInflightScopeKey === scopeKey) return chatsInflight;

    const shouldShowLoading = chats.length === 0;
    set({ isLoadingChats: shouldShowLoading, chatListError: null });
    chatsInflightScopeKey = scopeKey;
    chatsInflight = (async () => {
      try {
        const res = await fetchWithTimeout("/api/chats");
        if (!res.ok) {
          throw new Error(
            await readResponseError(res, getTranslation("sidebar.loadErrorDescription")),
          );
        }

        const data: unknown = await res.json();
        const loadedChats: ChatSession[] = Array.isArray(data)
          ? data
              .map(parseChatSessionFromDB)
              .filter((chat) => chat.message_count > 0)
          : [];
        const uniqueChats = dedupeChatSessions(loadedChats);
        const isCurrentScope =
          getScopedChatStorageKey(CHATS_CACHE_STORAGE_KEY, useUserLevelStore.getState().userEmail) === scopeKey;
        if (!isCurrentScope) {
          return;
        }
        chatsLastFetchedAt = Date.now();
        set({ chats: uniqueChats, chatListError: null });

        const persistedActiveChatId = get().activeChatId;
        if (persistedActiveChatId) {
          const hasPersistedActiveChat = uniqueChats.some((chat) => chat.id === persistedActiveChatId);

          if (!hasPersistedActiveChat) {
            get().openDraftChat();
          } else if (
            get().messages.length === 0 &&
            !get().isLoadingMessages &&
            !get().messagesError
          ) {
            void get().selectChat(persistedActiveChatId);
          }
        }

      } catch (error) {
        const isCurrentScope =
          getScopedChatStorageKey(CHATS_CACHE_STORAGE_KEY, useUserLevelStore.getState().userEmail) === scopeKey;
        if (!isCurrentScope) {
          return;
        }
        set({
          chatListError: getErrorMessage(
            error,
            getTranslation("sidebar.loadErrorDescription"),
          ),
        });
      } finally {
        chatsInflight = null;
        chatsInflightScopeKey = null;
        set({ isLoadingChats: false });
      }
    })();

    return chatsInflight;
  },

  selectChat: async (id, messageIdToFocus) => {
    const currentState = get();
    if (
      currentState.activeChatId === id &&
      currentState.messages.length > 0 &&
      !currentState.messagesError
    ) {
      set({ pendingFocusMessageId: messageIdToFocus ?? null });
      return;
    }

    const cachedMessages = chatMessagesCache.get(id);
    if (
      cachedMessages &&
      Date.now() - cachedMessages.fetchedAt < CHAT_MESSAGES_CACHE_TTL_MS
    ) {
      persistActiveChatId(id);
      set({
        activeChatId: id,
        isLoadingMessages: false,
        messages: cachedMessages.messages,
        messagesError: null,
        pendingFocusMessageId: messageIdToFocus ?? null,
      });
      useUserLevelStore.getState().setChatId(id);
      useUserLevelStore.getState().resetMetrics();
      return;
    }

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
        chatMessagesCache.set(id, {
          messages: parsedMessages,
          fetchedAt: Date.now(),
        });
        set({ messages: parsedMessages, messagesError: null });
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

  createNewChat: async (_userEmail, options) => {
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(options?.title ? { title: options.title } : {}),
          ...(options?.projectId !== undefined ? { project_id: options.projectId } : {}),
        }),
      });
      if (!res.ok) {
        throw new Error(await readResponseError(res, "Failed to create chat"));
      }

      const chat = parseChatSessionFromDB(await res.json());
      persistActiveChatId(chat.id);
      set((state) => ({
        chats: dedupeChatSessions([chat, ...state.chats]),
        activeChatId: chat.id,
        messages: [],
        messagesError: null,
      }));
      chatMessagesCache.set(chat.id, { messages: [], fetchedAt: Date.now() });
      chatsLastFetchedAt = Date.now();
      void useProjectStore.getState().loadProjects(true);
      useUserLevelStore.getState().resetMetrics();
      useUserLevelStore.getState().setChatId(chat.id);
      return chat.id;
    } catch (error) {
      actionToast.error(getErrorMessage(error, "Failed to create chat"));
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
        chatMessagesCache.delete(id);
        chatsLastFetchedAt = Date.now();
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
      void useProjectStore.getState().loadProjects(true);
      actionToast.deleted(getTranslation("chat.deleteSuccess"));
    } catch (error) {
      actionToast.error(getErrorMessage(error, "Failed to delete chat"));
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
      chatsLastFetchedAt = Date.now();
      set((state) => ({
        chats: state.chats.map((chat) => (chat.id === id ? { ...chat, title } : chat)),
      }));
      actionToast.saved(getTranslation("chat.renameSuccess"));
    } catch (error) {
      actionToast.error(getErrorMessage(error, "Failed to rename chat"));
    }
  },

  toggleFavorite: async (id) => {
    const chat = get().chats.find((item) => item.id === id);
    if (!chat) return;

    const newValue = !chat.is_favorite;
    chatsLastFetchedAt = Date.now();
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
      actionToast.info(
        getTranslation(
          newValue ? "toast.addedToFavorites" : "toast.removedFromFavorites",
        ),
      );
    } catch (error) {
      chatsLastFetchedAt = Date.now();
      set((state) => ({
        chats: state.chats.map((item) =>
          item.id === id ? { ...item, is_favorite: !newValue } : item,
        ),
      }));
      actionToast.error(getErrorMessage(error, "Failed to update favorite"));
    }
  },

  assignChatToProject: async (id, projectId) => {
    const existingChat = get().chats.find((chat) => chat.id === id);
    if (!existingChat) return;

    const previousProjectId = existingChat.project_id ?? null;
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === id
          ? {
            ...chat,
            project_id: projectId,
            project_name:
              projectId === null
                ? null
                : (useProjectStore.getState().projects.find((p) => p.id === projectId)?.name ?? chat.project_name),
          }
          : chat,
      ),
    }));

    try {
      const res = await fetch(`/api/chats/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!res.ok) {
        throw new Error(await readResponseError(res, "Failed to move chat to project"));
      }
      chatMessagesCache.delete(id);
      await get().loadChats(useUserLevelStore.getState().userEmail ?? "anonymous", true);
      void useProjectStore.getState().loadProjects(true);
      actionToast.info(
        getTranslation(
          projectId === null
            ? "chat.removeFromProjectSuccess"
            : "chat.moveToProjectSuccess",
        ),
      );
    } catch (error) {
      set((state) => ({
        chats: state.chats.map((chat) =>
          chat.id === id
            ? {
              ...chat,
              project_id: previousProjectId,
              project_name: existingChat.project_name ?? null,
            }
            : chat,
        ),
      }));
      actionToast.error(getErrorMessage(error, "Failed to move chat to project"));
    }
  },

  forkChatFromMessage: async (messageId, options) => {
    const { activeChatId } = get();
    const serverMessageId = normalizeServerMessageId(messageId);

    if (!activeChatId || serverMessageId === null) {
      actionToast.error(getTranslation("chat.forkError"));
      return null;
    }

    try {
      const res = await fetch(`/api/chats/${activeChatId}/fork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message_id: serverMessageId,
          ...(options?.title ? { title: options.title } : {}),
          ...(options?.projectId !== undefined ? { project_id: options.projectId } : {}),
        }),
      });
      if (!res.ok) {
        throw new Error(await readResponseError(res, "Failed to fork chat"));
      }

      const forkedChat = parseChatSessionFromDB(await res.json());
      persistActiveChatId(forkedChat.id);
      set((state) => ({
        chats: dedupeChatSessions([forkedChat, ...state.chats]),
        activeChatId: forkedChat.id,
        messages: [],
        messagesError: null,
      }));
      chatMessagesCache.set(forkedChat.id, { messages: [], fetchedAt: Date.now() });
      chatsLastFetchedAt = Date.now();
      void useProjectStore.getState().loadProjects(true);
      useUserLevelStore.getState().setChatId(forkedChat.id);
      await get().selectChat(forkedChat.id);
      actionToast.success(getTranslation("chat.forkSuccess"));
      return forkedChat.id;
    } catch (error) {
      actionToast.error(getErrorMessage(error, getTranslation("chat.forkError")));
      return null;
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

  editAndResend: async (messageId, newText, attachments) => {
    const state = get();
    const chatId = state.activeChatId;
    const idx = state.messages.findIndex((message) => message.id === messageId);
    if (!chatId || idx === -1) return;

    // Carry over attachments from the original message if not explicitly provided
    const originalMsg = state.messages[idx];
    const resolvedAttachments = attachments ?? originalMsg?.attachments;

    const preservedMessages = state.messages.slice(0, idx);
    const preserveAfterId = idx > 0
      ? normalizeServerMessageId(state.messages[idx - 1]?.id)
      : 0;

    if (idx > 0 && preserveAfterId === null) {
      actionToast.error(getTranslation("chat.syncError"));
      return;
    }

    try {
      await truncateChatMessages(chatId, preserveAfterId ?? 0);
    } catch {
      actionToast.error(getTranslation("chat.syncError"));
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

    // Always prefer composerSendOpts (live config sidebar settings)
    const sendOpts = get().composerSendOpts ?? get().lastSendOpts;
    if (!sendOpts) return;

    // Re-attach files: convert MessageAttachment back to InlineAttachment shape.
    // previewUrl is a data URL for images — strip the prefix to get base64.
    const inlineAttachments = resolvedAttachments?.flatMap((a) => {
      if (!a.previewUrl && !a.mimeType) return [];
      const data = a.previewUrl?.includes(",") ? a.previewUrl.split(",")[1] : a.previewUrl ?? "";
      return [{ id: a.id, filename: a.filename, mimeType: a.mimeType, data }];
    });

    await get().sendMessage(newText, {
      ...sendOpts,
      inlineAttachments: inlineAttachments?.length ? inlineAttachments : undefined,
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
      actionToast.error(getTranslation("chat.syncError"));
      return;
    }

    try {
      await truncateChatMessages(chatId, preserveAfterId ?? 0);
    } catch {
      actionToast.error(getTranslation("chat.syncError"));
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

    const sendOpts = get().composerSendOpts ?? get().lastSendOpts;
    if (!sendOpts) return;

    // Re-attach files from the original user message
    const inlineAttachments = lastUserMsg.attachments?.flatMap((a) => {
      const data = a.previewUrl?.includes(",") ? a.previewUrl.split(",")[1] : a.previewUrl ?? "";
      return [{ id: a.id, filename: a.filename, mimeType: a.mimeType, data }];
    });

    await get().sendMessage(lastUserMsg.content, {
      ...sendOpts,
      inlineAttachments: inlineAttachments?.length ? inlineAttachments : undefined,
    });
  },

  continueAssistantMessage: async (messageId) => {
    const state = get();
    if (state.isSending) return null;

    const chatId = state.activeChatId;
    if (!chatId) return null;

    const messageIndex = state.messages.findIndex(
      (message) => message.id === messageId && message.role === "assistant",
    );
    if (messageIndex === -1) return null;

    const targetMessage = state.messages[messageIndex];
    const persistedMessageId = normalizeServerMessageId(targetMessage.id);
    if (persistedMessageId === null) {
      actionToast.error(getTranslation("chat.generateError"));
      return null;
    }

    const continuationText = targetMessage.content.trim();
    if (!continuationText) {
      return null;
    }

    const requestOptions = parseRequestOptionsFromMetadata(targetMessage.metadata);
    // composerSendOpts reflects the live config sidebar — always prefer it
    const liveOpts = get().composerSendOpts ?? get().lastSendOpts;
    if (!liveOpts) return null;

    const continuationOpts: SendMessageOpts = {
      ...liveOpts,
      // For continuation, honour the model/params that were used in the original
      // request so the LLM sees a consistent context, but allow live override.
      model: liveOpts.model ?? requestOptions.model ?? "or-llama-70b",
      temperature: liveOpts.temperature ?? requestOptions.temperature ?? 0.7,
      max_tokens: liveOpts.max_tokens ?? requestOptions.max_tokens ?? 2048,
      top_p: liveOpts.top_p ?? requestOptions.top_p ?? 1.0,
      system_message: liveOpts.system_message ?? requestOptions.system_message ?? "",
      stream: true,
      forceNewChat: false,
    };

    set({ lastSendOpts: continuationOpts });

    const history = buildHistory(state.messages.slice(0, messageIndex));
    const baseContent = targetMessage.content;
    const generationStartedAtTs = Date.now();
    const generationStartedAt = nowMs();
    const requestController = new AbortController();
    activeGenerationController?.abort();
    activeGenerationController = requestController;

    set((store) => ({
      messages: store.messages.map((message) => {
        if (message.id !== messageId) return message;

        const previousMetadata = isObjectRecord(message.metadata) ? message.metadata : {};
        const previousSummary = isObjectRecord(previousMetadata.generation_summary)
          ? previousMetadata.generation_summary
          : {};

        return {
          ...message,
          isOptimistic: true,
          isError: false,
          metadata: {
            ...previousMetadata,
            generation_started_at: generationStartedAtTs,
            generation_stopped: false,
            generation_can_continue: false,
            request_options: {
              model_id: continuationOpts.model,
              temperature: continuationOpts.temperature,
              max_tokens: continuationOpts.max_tokens,
              top_p: continuationOpts.top_p ?? 1.0,
              system_message: continuationOpts.system_message ?? "",
            },
            generation_summary: {
              ...previousSummary,
              started_at_ms: generationStartedAtTs,
              completed_at_ms: undefined,
              duration_ms: undefined,
              first_token_ms: undefined,
              stream_chunks: 0,
              stream_chars: baseContent.length,
              estimated_tokens: Math.max(1, Math.ceil(baseContent.length / 4)),
              model_label:
                typeof previousSummary.model_label === "string"
                  ? previousSummary.model_label
                  : continuationOpts.model,
              model_id: continuationOpts.model,
              truncated: false,
              can_continue: false,
              stopped: false,
              continued_passes: 0,
              finish_reason: undefined,
            },
            generation_trace: [
              {
                id: "thought",
                kind: "thought",
                state: "active",
              },
            ],
          },
        };
      }),
      isSending: true,
      messagesError: null,
    }));

    chatMessagesCache.set(chatId, {
      messages: get().messages,
      fetchedAt: Date.now(),
    });

    const finalizeGenerationDuration = () => Math.max(0, Math.round(nowMs() - generationStartedAt));
    const updateChatSummary = (messageCount: number) => {
      set((store) => ({
        chats: store.chats.map((chat) =>
          chat.id !== chatId
            ? chat
            : {
              ...chat,
              updated_at: new Date().toISOString(),
              message_count: messageCount,
            },
        ),
      }));
    };

    const syncPersistedState = async () => {
      const syncedMessages = await fetchChatMessages(chatId);
      chatMessagesCache.set(chatId, {
        messages: syncedMessages,
        fetchedAt: Date.now(),
      });
      set({ messages: syncedMessages, isSending: false });
      updateChatSummary(syncedMessages.length);
      return syncedMessages;
    };

    try {
      const res = await postGenerate(
        makeContinuationPayload(
          continuationOpts.model,
          continuationOpts,
          history,
          chatId,
          baseContent,
          persistedMessageId,
        ),
        requestController.signal,
      );
      if (!res.ok) {
        throw new Error(await readResponseError(res, getTranslation("chat.sendError")));
      }

      const contentType = res.headers.get("content-type") ?? "";
      const isEventStream = contentType.includes("text/event-stream");
      const streamingUpdater = createStreamingChunkUpdater(set, messageId, baseContent);

      const applyStreamingPayload = (payload: Record<string, unknown>) => {
        if (payload.type === "generation_state" || payload.type === "done") {
          updateOptimisticAssistantMetadata(set, messageId, (metadata) =>
            mergeGenerationSnapshot(metadata, payload),
          );
        }

        const nextText =
          typeof payload.full_text === "string"
            ? payload.full_text
            : typeof payload.text === "string"
              ? payload.text
              : null;

        if (typeof nextText !== "string") {
          return;
        }

        const isTextEvent = payload.type === "text" || (!payload.type && nextText.length > 0);
        if (!isTextEvent && typeof payload.full_text !== "string") {
          return;
        }

        const nextAccumulated =
          typeof payload.full_text === "string"
            ? `${baseContent}${payload.full_text}`
            : `${streamingUpdater.getLatest()}${nextText}`;

        streamingUpdater.push(nextAccumulated);
        updateOptimisticAssistantMetadata(set, messageId, (metadata) => {
          const nextMetadata = { ...metadata };
          const summary = isObjectRecord(nextMetadata.generation_summary)
            ? { ...nextMetadata.generation_summary }
            : {};
          const previousChunks =
            typeof summary.stream_chunks === "number" ? summary.stream_chunks : 0;
          summary.stream_chunks =
            typeof payload.full_text === "string" ? previousChunks : previousChunks + 1;
          summary.stream_chars = nextAccumulated.length;
          summary.estimated_tokens = Math.max(1, Math.ceil(nextAccumulated.length / 4));
          nextMetadata.generation_summary = summary;
          nextMetadata.tokens = summary.estimated_tokens;
          return nextMetadata;
        });
      };

      if ((continuationOpts.stream || isEventStream) && res.body) {
        await readSSEStream(res.body, applyStreamingPayload);
        streamingUpdater.flush();

        try {
          const syncedMessages = await syncPersistedState();
          return syncedMessages.find((message) => message.id === persistedMessageId) ?? null;
        } catch {
          set({ isSending: false });
          chatMessagesCache.set(chatId, {
            messages: get().messages,
            fetchedAt: Date.now(),
          });
          return get().messages.find((message) => message.id === messageId) ?? null;
        }
      }

      const data = await res.json();
      const mergedContent = `${baseContent}${typeof data.text === "string" ? data.text : ""}`;
      set((store) => ({
        messages: store.messages.map((message) =>
          message.id === messageId
            ? withGenerationDuration(
                {
                  ...message,
                  content: mergedContent,
                  isOptimistic: false,
                  metadata: mergeGenerationSnapshot(
                    isObjectRecord(message.metadata) ? message.metadata : {},
                    {
                      type: "done",
                      generation_summary: {
                        duration_ms: data.usage?.latency_ms,
                        first_token_ms: data.usage?.latency_ms,
                        stream_chars: mergedContent.length,
                        estimated_tokens: data.usage?.completion_tokens ?? data.usage?.total_tokens,
                        model_label: continuationOpts.model,
                        model_id: continuationOpts.model,
                        provider: data.provider,
                      },
                    },
                  ),
                },
                finalizeGenerationDuration(),
              )
            : message,
        ),
        isSending: false,
      }));

      chatMessagesCache.set(chatId, {
        messages: get().messages,
        fetchedAt: Date.now(),
      });
      try {
        const syncedMessages = await syncPersistedState();
        return syncedMessages.find((message) => message.id === persistedMessageId) ?? null;
      } catch {
        return get().messages.find((message) => message.id === messageId) ?? null;
      }
    } catch (error) {
      if (isAbortError(error)) {
        set((store) => ({
          messages: store.messages.map((message) =>
            message.id === messageId
              ? withGenerationDuration(
                  {
                    ...message,
                    isOptimistic: false,
                  },
                  finalizeGenerationDuration(),
                  true,
                )
              : message,
          ),
          isSending: false,
        }));
        chatMessagesCache.set(chatId, {
          messages: get().messages,
          fetchedAt: Date.now(),
        });
        return get().messages.find((message) => message.id === messageId) ?? null;
      }

      const errorMessage = formatChatSendErrorMessage(
        error,
        continuationOpts.model,
      );
      updateOptimisticAssistantMetadata(set, messageId, (metadata) => {
        const nextMetadata = { ...metadata };
        const summary = isObjectRecord(nextMetadata.generation_summary)
          ? { ...nextMetadata.generation_summary }
          : {};
        summary.can_continue = true;
        summary.truncated = true;
        nextMetadata.generation_summary = summary;
        nextMetadata.continuation_error = errorMessage;
        return nextMetadata;
      });
      set({ isSending: false });
      actionToast.error(errorMessage);
      return get().messages.find((message) => message.id === messageId) ?? null;
    } finally {
      if (activeGenerationController === requestController) {
        activeGenerationController = null;
      }
    }
  },

  stopGeneration: () => {
    activeGenerationController?.abort();
    activeGenerationController = null;
  },

  sendMessage: async (text, opts) => {
    // Inherit projectId from active chat if caller didn't supply it
    const activeProjectId = get().chats.find((c) => c.id === get().activeChatId)?.project_id ?? null;
    const resolvedOpts: SendMessageOpts = {
      ...opts,
      projectId: opts.projectId !== undefined ? opts.projectId : activeProjectId,
    };
    opts = resolvedOpts;

    set({ lastSendOpts: opts });

    const effectiveCompareModel =
      opts.compareModel && opts.compareModel !== opts.model
        ? opts.compareModel
        : undefined;

    const { activeChatId, messages } = get();
    let chatId = activeChatId;
    let historyMessages = messages;

    if (opts.forceNewChat || !chatId) {
      const nextChatId = createClientChatId();
      const now = new Date().toISOString();
      const project = opts.projectId
        ? useProjectStore.getState().projects.find((item) => item.id === opts.projectId)
        : null;
      const optimisticChat: ChatSession = {
        id: nextChatId,
        title: NEW_CHAT_SENTINEL,
        is_favorite: false,
        project_id: opts.projectId ?? null,
        project_name: project?.name ?? null,
        parent_chat_id: null,
        forked_from_message_id: null,
        created_at: now,
        updated_at: now,
        message_count: 0,
        isPending: true,
      };

      persistActiveChatId(nextChatId);
      set((state) => ({
        chats: dedupeChatSessions([optimisticChat, ...state.chats]),
        activeChatId: nextChatId,
        messages: [],
        isLoadingMessages: false,
        messagesError: null,
      }));
      chatMessagesCache.set(nextChatId, { messages: [], fetchedAt: Date.now() });
      chatsLastFetchedAt = Date.now();
      useUserLevelStore.getState().setChatId(nextChatId);
      useUserLevelStore.getState().resetMetrics();

      chatId = nextChatId;
      historyMessages = [];
    }

    const currentChatId = chatId;
    const history = buildHistory(historyMessages);
    const userMsgId = `user-${uid()}`;
    const asstMsgId = `asst-${uid()}`;
    const generationStartedAtTs = Date.now();
    const generationStartedAt = nowMs();
    const requestController = new AbortController();
    activeGenerationController?.abort();
    activeGenerationController = requestController;

    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: userMsgId, role: "user", content: text, isOptimistic: true,
          attachments: opts.inlineAttachments?.map((a) => ({
            id: a.id, filename: a.filename, mimeType: a.mimeType,
            previewUrl: a.mimeType.startsWith("image/") ? `data:${a.mimeType};base64,${a.data}` : undefined,
          })),
        } as ChatMessage,
        {
          id: asstMsgId,
          role: "assistant",
          content: "",
          isOptimistic: true,
          metadata: {
            generation_started_at: generationStartedAtTs,
            request_options: {
              model_id: opts.model,
              temperature: opts.temperature,
              max_tokens: opts.max_tokens,
              top_p: opts.top_p ?? 1.0,
              system_message: opts.system_message ?? "",
            },
            generation_summary: {
              started_at_ms: generationStartedAtTs,
              history_count: history.length,
              project_chat_count: 0,
              project_context_used: false,
              stream_chunks: 0,
              stream_chars: 0,
              estimated_tokens: 0,
              model_label: opts.modelLabel ?? opts.model,
              model_id: opts.model,
            },
            generation_trace: [
              {
                id: "thought",
                kind: "thought",
                state: "active",
              },
            ],
          },
        } as ChatMessage,
      ],
      isSending: true,
      messagesError: null,
    }));
    chatMessagesCache.set(currentChatId, {
      messages: get().messages,
      fetchedAt: Date.now(),
    });
    const finalizeGenerationDuration = () => Math.max(0, Math.round(nowMs() - generationStartedAt));

    const finalizeMessages = (assistantMessage: ChatMessage) => {
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === asstMsgId
            ? withGenerationDuration(assistantMessage, finalizeGenerationDuration())
            : message.id === userMsgId
              ? { ...message, isOptimistic: false }
              : message,
        ),
        isSending: false,
      }));
      chatMessagesCache.set(currentChatId, {
        messages: get().messages,
        fetchedAt: Date.now(),
      });
    };

    const updateChatSummary = (messageCount: number) => {
      const currentChat = get().chats.find((c) => c.id === currentChatId);
      const isFirstMessage = currentChat?.isPending === true;

      set((state) => ({
        chats: state.chats.map((chat) => {
          if (chat.id !== currentChatId) return chat;
          return {
            ...chat,
            title: isFirstMessage ? chat.title : deriveChatTitle(chat.title, text),
            updated_at: new Date().toISOString(),
            message_count: messageCount,
          };
        }),
      }));

      if (isFirstMessage) {
        void (async () => {
          try {
            const res = await fetch(`/api/chats/${currentChatId}/generate-title`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prompt: text, model: opts.model }),
            });
            const data = res.ok ? await res.json() as { title?: string } : null;
            const title = data?.title ?? deriveChatTitle(NEW_CHAT_SENTINEL, text);
            set((state) => ({
              chats: state.chats.map((chat) =>
                chat.id === currentChatId
                  ? { ...chat, title, isPending: false }
                  : chat,
              ),
            }));
          } catch {
            // fallback — show truncated prompt
            set((state) => ({
              chats: state.chats.map((chat) =>
                chat.id === currentChatId
                  ? { ...chat, title: deriveChatTitle(NEW_CHAT_SENTINEL, text), isPending: false }
                  : chat,
              ),
            }));
          }
        })();
      }
    };

    const syncPersistedState = async () => {
      const localMessages = get().messages;
      const localAssistant = localMessages.find(
        (message) => message.id === asstMsgId,
      ) ?? findLatestAssistantMessage(localMessages);
      const syncedMessages = await fetchChatMessages(currentChatId);
      const latestAssistant = findLatestAssistantMessage(syncedMessages);
      const localAssistantCount = localMessages.filter(
        (message) => message.role === "assistant",
      ).length;
      const persistedAssistantCount = syncedMessages.filter(
        (message) => message.role === "assistant",
      ).length;

      // Build a map of local user-message attachments by content so they
      // survive the sync (server doesn't persist attachment metadata).
      const localAttachmentsByContent = new Map<string, MessageAttachment[]>();
      for (const m of localMessages) {
        if (m.role === "user" && m.attachments?.length) {
          localAttachmentsByContent.set(m.content, m.attachments);
        }
      }

      let nextMessages = (latestAssistant &&
        typeof latestAssistant.metadata?.latency_ms !== "number" &&
        typeof latestAssistant.metadata?.generation_ms !== "number"
        ? syncedMessages.map((message) =>
            message.id === latestAssistant.id
              ? withGenerationDuration(message, finalizeGenerationDuration())
              : message,
          )
        : syncedMessages
      ).map((message) => {
        // Re-attach local attachment metadata to synced user messages
        if (message.role === "user" && !message.attachments?.length) {
          const saved = localAttachmentsByContent.get(message.content);
          if (saved) return { ...message, attachments: saved };
        }
        return message;
      });

      const shouldPreserveLocalAssistant =
        localAssistant &&
        localAssistant.role === "assistant" &&
        persistedAssistantCount < localAssistantCount &&
        (localAssistant.isError ||
          Boolean(localAssistant.content.trim()) ||
          localAssistant.metadata?.generation_stopped === true);

      if (shouldPreserveLocalAssistant) {
        nextMessages = [
          ...nextMessages,
          withGenerationDuration(
            {
              ...localAssistant,
              isOptimistic: false,
            },
            finalizeGenerationDuration(),
            localAssistant.metadata?.generation_stopped === true,
          ),
        ];
      }

      chatMessagesCache.set(currentChatId, {
        messages: nextMessages,
        fetchedAt: Date.now(),
      });
      set({ messages: nextMessages, isSending: false });
      updateChatSummary(nextMessages.length);
      return nextMessages;
    };

    try {
      if (opts.selfConsistencyEnabled) {
        const res = await postMultiGenerate({
          ...makePayload(text, opts.model, opts, history, currentChatId),
          mode: "self_consistency",
          model_label: opts.modelLabel ?? opts.model,
          run_count: 3,
        }, requestController.signal);
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
        }, requestController.signal);
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

      const res = await postGenerate(
        makePayload(text, opts.model, opts, history, currentChatId),
        requestController.signal,
      );
      if (!res.ok) {
        throw new Error(await readResponseError(res, getTranslation("chat.sendError")));
      }

      const contentType = res.headers.get("content-type") ?? "";
      const isEventStream = contentType.includes("text/event-stream");
      const streamingUpdater = createStreamingChunkUpdater(set, asstMsgId);

      const applyStreamingPayload = (payload: Record<string, unknown>) => {
        if (payload.type === "generation_state" || payload.type === "done") {
          updateOptimisticAssistantMetadata(set, asstMsgId, (metadata) =>
            mergeGenerationSnapshot(metadata, payload),
          );
        }

        const nextText =
          typeof payload.full_text === "string"
            ? payload.full_text
            : typeof payload.text === "string"
              ? payload.text
              : null;

        if (typeof nextText !== "string") {
          return;
        }

        const isTextEvent = payload.type === "text" || (!payload.type && nextText.length > 0);
        if (!isTextEvent && typeof payload.full_text !== "string") {
          return;
        }

        const nextAccumulated =
          typeof payload.full_text === "string"
            ? payload.full_text
            : `${streamingUpdater.getLatest()}${nextText}`;

        streamingUpdater.push(nextAccumulated);
        updateOptimisticAssistantMetadata(set, asstMsgId, (metadata) => {
          const nextMetadata = { ...metadata };
          const summary = isObjectRecord(nextMetadata.generation_summary)
            ? { ...nextMetadata.generation_summary }
            : {};
          const previousChunks =
            typeof summary.stream_chunks === "number" ? summary.stream_chunks : 0;
          summary.stream_chunks =
            typeof payload.full_text === "string" ? previousChunks : previousChunks + 1;
          summary.stream_chars = nextAccumulated.length;
          summary.estimated_tokens = Math.max(1, Math.ceil(nextAccumulated.length / 4));
          nextMetadata.generation_summary = summary;
          nextMetadata.tokens = summary.estimated_tokens;
          return nextMetadata;
        });
      };

      if ((opts.stream || isEventStream) && res.body) {
        await readSSEStream(res.body, applyStreamingPayload);
        streamingUpdater.flush();

        try {
          const syncedMessages = await syncPersistedState();
          return findLatestAssistantMessage(syncedMessages);
        } catch {
          set({ isSending: false });
          updateChatSummary(get().messages.length);
          return findLatestAssistantMessage(get().messages);
        }
      }

      if (opts.stream || isEventStream) {
        const sseText = await res.text();
        const accumulated = parseSSEText(sseText, applyStreamingPayload);
        streamingUpdater.flush();

        if (accumulated.trim()) {
          try {
            const syncedMessages = await syncPersistedState();
            return findLatestAssistantMessage(syncedMessages);
          } catch {
            set({ isSending: false });
            updateChatSummary(get().messages.length);
            return findLatestAssistantMessage(get().messages);
          }
        }
      }

      const data = await res.json();
      const fallbackGenerationSummary = {
        duration_ms: data.usage?.latency_ms,
        first_token_ms: data.usage?.latency_ms,
        history_count: history.length,
        project_chat_count: 0,
        project_context_used: false,
        stream_chunks: 0,
        stream_chars: typeof data.text === "string" ? data.text.length : 0,
        estimated_tokens: data.usage?.completion_tokens ?? data.usage?.total_tokens,
        model_label: opts.modelLabel ?? data.usage?.model ?? opts.model,
        model_id: opts.model,
        provider: data.provider,
      };
      const fallbackMessage: ChatMessage = {
        id: asstMsgId,
        role: "assistant",
        content: data.text,
        isOptimistic: false,
        metadata: {
          model: opts.modelLabel ?? data.usage?.model,
          model_id: opts.model,
          tokens: data.usage?.total_tokens,
          latency_ms: data.usage?.latency_ms,
          generation_ms: data.usage?.latency_ms,
          provider: data.provider,
          request_options: {
            model_id: opts.model,
            temperature: opts.temperature,
            max_tokens: opts.max_tokens,
            top_p: opts.top_p ?? 1.0,
            system_message: opts.system_message ?? "",
          },
          generation_summary: fallbackGenerationSummary,
          generation_trace: [
            {
              id: "thought",
              kind: "thought",
              state: "completed",
              duration_ms: data.usage?.latency_ms,
            },
          ],
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
      if (isAbortError(error)) {
        const currentMessages = get().messages;
        const partialAssistant = currentMessages.find((message) => message.id === asstMsgId);
        const hasPartialContent = Boolean(partialAssistant?.content.trim());
        const generationMs = finalizeGenerationDuration();

        set((state) => ({
          messages: state.messages
            .filter((message) => hasPartialContent || message.id !== asstMsgId)
            .map((message) => {
              if (message.id === userMsgId) {
                return { ...message, isOptimistic: false };
              }
              if (message.id === asstMsgId) {
                return withGenerationDuration(
                  {
                    ...message,
                    isOptimistic: false,
                  },
                  generationMs,
                  true,
                );
              }
              return message;
            }),
          isSending: false,
        }));
        chatMessagesCache.set(currentChatId, {
          messages: get().messages,
          fetchedAt: Date.now(),
        });

        updateChatSummary(get().messages.length);
        return hasPartialContent
          ? withGenerationDuration(
              {
                ...(partialAssistant as ChatMessage),
                isOptimistic: false,
              },
              generationMs,
              true,
            )
          : null;
      }

      const errorMessage = formatChatSendErrorMessage(
        error,
        opts.modelLabel ?? opts.model,
      );
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
      chatMessagesCache.set(currentChatId, {
        messages: get().messages,
        fetchedAt: Date.now(),
      });
      updateChatSummary(get().messages.length);
      return null;
    } finally {
      if (activeGenerationController === requestController) {
        activeGenerationController = null;
      }
    }
  },

  clearMessages: () => {
    persistActiveChatId(null);
    chatMessagesCache.clear();
    chatsLastFetchedAt = 0;
    set({
      chats: [],
      activeChatId: null,
      messages: [],
      chatListError: null,
      messagesError: null,
      pendingFocusMessageId: null,
    });
    useUserLevelStore.getState().setChatId(null);
  },
}));

useChatStore.subscribe((state) => {
  const userEmail = useUserLevelStore.getState().userEmail;
  writePersistedChatsCache({
    chats: state.chats,
    fetchedAt: chatsLastFetchedAt || Date.now(),
  }, userEmail);

  if (!state.activeChatId) {
    writePersistedActiveChatMessagesCache(null, userEmail);
    return;
  }

  if (state.isSending || state.messagesError) {
    return;
  }

  writePersistedActiveChatMessagesCache({
    chatId: state.activeChatId,
    messages: state.messages.filter((message) => !message.isOptimistic),
    fetchedAt:
      chatMessagesCache.get(state.activeChatId)?.fetchedAt ??
      Date.now(),
  }, userEmail);
});

export function hydrateChatStoreFromPersistence(userEmail?: string | null): void {
  const persistedChatsCache = readPersistedChatsCache(userEmail);
  const persistedActiveChatId = readPersistedActiveChatId();
  const persistedActiveChatMessagesCache = readPersistedActiveChatMessagesCache(userEmail);

  chatsLastFetchedAt = persistedChatsCache?.fetchedAt ?? 0;
  chatMessagesCache.clear();

  if (persistedActiveChatMessagesCache) {
    chatMessagesCache.set(persistedActiveChatMessagesCache.chatId, {
      messages: persistedActiveChatMessagesCache.messages,
      fetchedAt: persistedActiveChatMessagesCache.fetchedAt,
    });
  }

  useChatStore.setState({
    chats: persistedChatsCache?.chats ?? [],
    activeChatId: persistedActiveChatId,
    messages:
      persistedActiveChatId &&
      persistedActiveChatMessagesCache?.chatId === persistedActiveChatId
        ? persistedActiveChatMessagesCache.messages
        : [],
    sidebarOpen: readPersistedSidebarOpen(userEmail),
  });
}
