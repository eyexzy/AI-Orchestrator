"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Search, MessageSquare, Plus, Clock } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { useChatStore, type ChatSession } from "@/lib/store/chatStore";
import { SEARCH_DEBOUNCE_MS, REQUEST_TIMEOUT_MS } from "@/lib/config";
import { useTranslation } from "@/lib/store/i18nStore";
import { getErrorMessage, readResponseError } from "@/lib/request";

interface SearchResult {
  chat_id: string;
  chat_title: string;
  message_id: number | null;
  message_content: string | null;
  role: string | null;
  updated_at: string;
}

export function ChatSearchModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const userEmail = session?.user?.email ?? "anonymous";
  const inputRef = useRef<HTMLInputElement>(null);

  const chats: ChatSession[] = useChatStore((s) => s.chats);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [searchNonce, setSearchNonce] = useState(0);
  const searchRequestIdRef = useRef(0);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setErrorMessage(null);
      setShowAllRecent(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setErrorMessage(null);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/chats/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(await readResponseError(res, t("search.errorDescription")));
        }

        const data = await res.json();
        if (searchRequestIdRef.current === requestId) {
          setResults(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (controller.signal.aborted && !timedOut) {
          return;
        }

        if (searchRequestIdRef.current === requestId) {
          setResults([]);
          setErrorMessage(getErrorMessage(error, t("search.errorDescription")));
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (searchRequestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [open, query, searchNonce, t]);

  const close = () => onOpenChange(false);

  const handleSelect = (chatId: string, messageId?: number) => {
    useChatStore.getState().selectChat(chatId, messageId);
    close();
  };

  const handleNewChat = async () => {
    await useChatStore.getState().createNewChat(userEmail);
    close();
  };

  const handleShowAllRecent = () => {
    setShowAllRecent(true);
    setQuery("");
    setResults([]);
    setErrorMessage(null);
  };

  const visibleChats = showAllRecent ? chats : chats.slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 overflow-hidden bg-background border border-gray-alpha-200 shadow-geist-lg max-w-2xl">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 h-14">
          <Search size={18} strokeWidth={2} className="shrink-0 text-gray-500" />
          <Input
            ref={inputRef}
            variant="ghost"
            size="md"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search.placeholder")}
            className="flex-1"
            inputClassName="text-lg"
          />
          <kbd className="hidden sm:inline-flex h-6 items-center rounded-md border border-gray-alpha-300 bg-gray-alpha-100 px-1.5 text-[11px] font-mono text-ds-text-tertiary">
            Esc
          </kbd>
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-alpha-200" />

        {/* Results area */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {!query.trim() ? (
            /* Empty query: quick actions + recent chats */
            <>
              <div className="space-y-0.5">
                <button
                  type="button"
                 
                  onClick={handleNewChat}
                  className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm text-ds-text transition-colors hover:bg-gray-alpha-200 hover:text-ds-text bg-transparent border-none cursor-pointer"
                >
                  <Plus size={16} strokeWidth={2} className="text-ds-text-secondary" />
                  {t("search.newChat")}
                </button>
                <button
                  type="button"
                  onClick={handleShowAllRecent}
                  className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm text-ds-text transition-colors hover:bg-gray-alpha-200 hover:text-ds-text bg-transparent border-none cursor-pointer"
                >
                  <Clock size={16} strokeWidth={2} className="text-ds-text-secondary" />
                  {t("search.allRecent")}
                </button>
              </div>

              {chats.length > 0 && (
                <>
                  <div className="px-4 py-2 mt-2 text-xs font-semibold uppercase tracking-wider text-ds-text-tertiary">
                    {t("search.recentChats")}
                  </div>
                  <div className="space-y-0.5">
                    {visibleChats.map((chat) => (
                      <button
                        key={chat.id}
                        type="button"
                        onClick={() => handleSelect(chat.id)}
                        className="flex w-full items-center justify-between rounded-lg px-4 py-2.5 text-sm text-ds-text transition-colors hover:bg-gray-alpha-200 hover:text-ds-text bg-transparent border-none cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <MessageSquare size={16} strokeWidth={2} className="shrink-0 text-ds-text-secondary" />
                          <span className="truncate max-w-[350px]">{chat.title}</span>
                        </div>
                        <span className="shrink-0 ml-3 text-ds-text-tertiary text-xs">
                          {new Date(chat.updated_at).toLocaleDateString()}
                        </span>
                      </button>
                    ))}
                    {!showAllRecent && chats.length > 5 && (
                      <button
                        type="button"
                        onClick={handleShowAllRecent}
                        className="w-full text-left text-sm text-ds-text-secondary px-4 py-2 hover:text-ds-text bg-transparent border-none cursor-pointer"
                      >
                        {t("search.viewAll")}
                      </button>
                    )}
                  </div>
                </>
              )}

              {chats.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-ds-text-tertiary">
                  {t("search.noRecent")}
                </p>
              )}
            </>
          ) : loading ? (
            /* Loading */
            <div className="flex items-center justify-center py-6">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-alpha-200 border-t-gray-alpha-400" />
            </div>
          ) : errorMessage ? (
            <div className="px-4 py-6">
              <ErrorState
                centered
                title={t("search.errorTitle")}
                description={errorMessage}
                actionLabel={t("common.retry")}
                onAction={() => setSearchNonce((value) => value + 1)}
              />
            </div>
          ) : results.length > 0 ? (
            /* Search results */
            <div className="space-y-0.5">
              {results.map((r, i) => (
                <button
                  key={`${r.chat_id}-${r.message_id ?? "title"}-${i}`}
                  type="button"
                  onClick={() => handleSelect(r.chat_id, r.message_id ?? undefined)}
                  className="flex w-full items-center justify-between rounded-lg px-4 py-2.5 text-sm text-ds-text transition-colors hover:bg-gray-alpha-200 hover:text-ds-text bg-transparent border-none cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <MessageSquare size={16} strokeWidth={2} className="shrink-0 text-ds-text-secondary" />
                    <div className="min-w-0">
                      <span className="block truncate max-w-full font-medium">{r.chat_title}</span>
                      {r.message_content && (
                        <span className="block truncate max-w-full text-xs text-ds-text-tertiary mt-0.5">
                          <span className="font-medium text-ds-text-secondary">
                            {r.role === "user" ? t("search.roleUser") : t("search.roleAssistant")}
                          </span>
                          {r.message_content}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 ml-3 text-ds-text-tertiary text-xs">
                    {new Date(r.updated_at).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            /* No results */
            <p className="px-4 py-6 text-center text-sm text-ds-text-tertiary">
              {t("search.noResults")}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}