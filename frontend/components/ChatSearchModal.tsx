"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Clock, Folder, MessageCircle, GitFork } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { ProjectIcon } from "@/components/projects/ProjectIcon";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  dedupeChatSessions,
  useChatStore,
  type ChatSession,
} from "@/lib/store/chatStore";
import { useProjectStore } from "@/lib/store/projectStore";
import { SEARCH_DEBOUNCE_MS, REQUEST_TIMEOUT_MS } from "@/lib/config";
import { useTranslation } from "@/lib/store/i18nStore";
import { getErrorMessage, readResponseError } from "@/lib/request";
import { cn } from "@/lib/utils";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { PROJECT_COLOR_ICON_CLASSES } from "@/components/projects/projectTheme";

interface SearchResult {
  chat_id: string;
  chat_title: string;
  project_id: string | null;
  project_name: string | null;
  parent_chat_id: string | null;
  forked_from_message_id: number | null;
  message_id: number | null;
  message_content: string | null;
  role: string | null;
  updated_at: string;
}

function formatChatSearchLabel(chatTitle: string, projectName?: string | null) {
  return projectName ? `${projectName} / ${chatTitle}` : chatTitle;
}

const searchActionButtonClass =
  "group flex w-full items-center gap-2 rounded-lg border-none bg-transparent px-3 py-2.5 text-left text-[15px] font-medium text-ds-text transition-colors hover:bg-gray-alpha-200 cursor-pointer";

const searchListButtonClass =
  "group flex w-full items-center rounded-lg border-none bg-transparent px-3 py-2.5 text-left text-[15px] font-medium text-ds-text transition-colors hover:bg-gray-alpha-200 cursor-pointer";

function SearchResultSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5"
        >
          <div className="min-w-0 flex flex-1 items-center gap-2">
            <Skeleton width={18} height={18} className="rounded-md" />
            <Skeleton height={16} width={`${46 + (i % 3) * 14}%`} />
          </div>
          <Skeleton height={12} width={72} />
        </div>
      ))}
    </div>
  );
}

export function ChatSearchModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const level = useUserLevelStore((s) => s.level);
  const userEmail = useUserLevelStore((s) => s.userEmail);
  const canUseProjects = level >= 2;
  const inputRef = useRef<HTMLInputElement>(null);

  const chats: ChatSession[] = useChatStore((s) => s.chats);
  const isLoadingChats = useChatStore((s) => s.isLoadingChats);
  const projects = useProjectStore((s) => s.projects);
  const isLoadingProjects = useProjectStore((s) => s.isLoadingProjects);
  const loadProjects = useProjectStore((s) => s.loadProjects);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [searchNonce, setSearchNonce] = useState(0);
  const [resultsScrolled, setResultsScrolled] = useState(false);
  const resultsScrollRef = useRef<HTMLDivElement>(null);
  const searchRequestIdRef = useRef(0);
  const visibleChats = useMemo(() => dedupeChatSessions(chats), [chats]);
  const projectsById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  // Scroll detection for results area
  useEffect(() => {
    const el = resultsScrollRef.current;
    if (!el) return;
    const onScroll = () => setResultsScrolled(el.scrollTop > 4);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  });

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setErrorMessage(null);
      setShowAllRecent(false);
      setResultsScrolled(false);
      if (userEmail !== "anonymous") {
        void useChatStore.getState().loadChats(userEmail);
        if (canUseProjects) {
          void loadProjects();
        }
      }
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [canUseProjects, loadProjects, open, userEmail]);

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
    router.push("/chat");
    useChatStore.getState().selectChat(chatId, messageId);
    close();
  };

  const handleNewChat = async () => {
    router.push("/chat");
    useChatStore.getState().openDraftChat();
    close();
  };

  const handleOpenProjects = (projectId?: string) => {
    if (!canUseProjects) {
      close();
      return;
    }
    router.push(projectId ? `/projects/${projectId}` : "/projects");
    close();
  };

  const handleShowAllRecent = () => {
    router.push("/chats");
    close();
  };

  const recentChats = showAllRecent ? visibleChats : visibleChats.slice(0, 5);
  const filteredProjects = canUseProjects
    ? (query.trim()
      ? projects.filter((project) =>
        project.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
      : projects)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
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
          <Kbd className="hidden sm:inline-flex">Esc</Kbd>
        </div>

        {/* Divider */}
        <Separator />

        {/* Quick actions — always visible */}
        <div className="px-2 py-1.5 space-y-0.5">
          <button
            type="button"
            onClick={handleNewChat}
            className={searchActionButtonClass}
          >
            <Plus size={18} strokeWidth={2} className="shrink-0 text-ds-text" />
            {t("search.newChat")}
          </button>
          <button
            type="button"
            onClick={handleShowAllRecent}
            className={searchActionButtonClass}
          >
            <Clock size={18} strokeWidth={2} className="shrink-0 text-ds-text" />
            {t("search.allRecent")}
          </button>
          {canUseProjects && (
            <button
              type="button"
              onClick={() => handleOpenProjects()}
              className={searchActionButtonClass}
            >
              <Folder size={18} strokeWidth={2} className="shrink-0 text-ds-text" />
              {t("search.projects")}
            </button>
          )}
        </div>
        <Separator className={cn("transition-opacity duration-200", resultsScrolled ? "opacity-100" : "opacity-0")} />

        {/* Results area — grows with content up to the existing max height */}
        <div
          ref={resultsScrollRef}
          className="max-h-[50vh] overflow-y-auto p-2 flex flex-col"
        >
          {!query.trim() ? (
            <>
              {canUseProjects && (projects.length > 0 || (isLoadingProjects && projects.length === 0)) && (
                <>
                  <div className="mt-2 px-3 py-2 text-[15px] font-semibold text-ds-text-secondary">
                    {t("search.projects")}
                  </div>
                  {isLoadingProjects && projects.length === 0 ? (
                    <SearchResultSkeleton count={3} />
                  ) : (
                    <div className="space-y-0.5">
                      {projects.slice(0, 5).map((project) => (
                        <button
                          key={project.id}
                          type="button"
                          onMouseEnter={() => router.prefetch(`/projects/${project.id}`)}
                          onFocus={() => router.prefetch(`/projects/${project.id}`)}
                          onClick={() => handleOpenProjects(project.id)}
                          className={searchListButtonClass}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <ProjectIcon
                              iconName={project.icon_name}
                              color={project.accent_color}
                              size={18}
                              strokeWidth={2}
                            />
                            <span className="block max-w-[350px] truncate">{project.name}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {(visibleChats.length > 0 || (isLoadingChats && visibleChats.length === 0)) && (
                <>
                  <div className="mt-2 px-3 py-2 text-[15px] font-semibold text-ds-text-secondary">
                    {t("search.recentChats")}
                  </div>
                  {isLoadingChats && visibleChats.length === 0 ? (
                    <SearchResultSkeleton count={4} />
                  ) : (
                    <div className="space-y-0.5">
                      {recentChats.map((chat) => (
                        <button
                          key={chat.id}
                          type="button"
                          onClick={() => handleSelect(chat.id)}
                          className={cn(searchListButtonClass, "justify-between")}
                        >
                          <div className="min-w-0 flex flex-1 items-center gap-2">
                            {chat.parent_chat_id ? (
                              <GitFork
                                size={18}
                                strokeWidth={2}
                                className={`shrink-0 ${PROJECT_COLOR_ICON_CLASSES.green}`}
                                aria-label={t("projects.forkedChat")}
                              />
                            ) : chat.project_id && canUseProjects ? (
                              <ProjectIcon
                                iconName={projectsById.get(chat.project_id)?.icon_name}
                                color={projectsById.get(chat.project_id)?.accent_color}
                                size={18}
                                strokeWidth={2}
                              />
                            ) : (
                              <MessageCircle size={18} strokeWidth={2} className="shrink-0 text-ds-text" />
                            )}
                            <div className="min-w-0">
                              <span className="block truncate max-w-[350px]">
                                {formatChatSearchLabel(chat.title, canUseProjects ? chat.project_name : null)}
                              </span>
                              {chat.parent_chat_id && (
                                <span className="block truncate text-[13px] text-ds-text-tertiary">
                                  {t("projects.forkedChat")}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="ml-3 shrink-0 text-[13px] text-ds-text-tertiary">
                            {new Date(chat.updated_at).toLocaleDateString()}
                          </span>
                        </button>
                      ))}
                      {!showAllRecent && visibleChats.length > 5 && (
                        <button
                          type="button"
                          onClick={handleShowAllRecent}
                          className="w-full rounded-lg border-none bg-transparent px-3 py-2 text-left text-[15px] font-medium text-ds-text transition-colors hover:bg-gray-alpha-200 cursor-pointer"
                        >
                          {t("search.viewAll")}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}

              {visibleChats.length === 0 && !isLoadingChats && (
              <button
                type="button"
                onClick={handleShowAllRecent}
                className="w-full rounded-lg border-none bg-transparent px-3 py-2 text-left text-[15px] font-medium text-ds-text transition-colors hover:bg-gray-alpha-200 cursor-pointer"
              >
                {t("search.viewAll")}
              </button>
              )}
            </>
          ) : loading ? (
            <div className="space-y-3">
              {canUseProjects && (
                <div>
                  <div className="px-3 pb-1 text-[15px] font-semibold text-ds-text-secondary">
                    {t("search.projects")}
                  </div>
                  <SearchResultSkeleton count={2} />
                </div>
              )}
              <div>
                <div className="px-3 pb-1 text-[15px] font-semibold text-ds-text-secondary">
                  {t("search.recentChats")}
                </div>
                <SearchResultSkeleton count={4} />
              </div>
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
          ) : filteredProjects.length > 0 || results.length > 0 ? (
            <div className="space-y-3">
              {canUseProjects && filteredProjects.length > 0 && (
                <div>
                  <div className="px-3 pb-1 text-[15px] font-semibold text-ds-text-secondary">
                    {t("search.projects")}
                  </div>
                  <div className="space-y-0.5">
                    {filteredProjects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        onMouseEnter={() => router.prefetch(`/projects/${project.id}`)}
                        onFocus={() => router.prefetch(`/projects/${project.id}`)}
                        onClick={() => handleOpenProjects(project.id)}
                        className={searchListButtonClass}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <ProjectIcon
                            iconName={project.icon_name}
                            color={project.accent_color}
                            size={18}
                            strokeWidth={2}
                          />
                          <span className="truncate">{project.name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results.length > 0 && (
                <div>
                  <div className="px-3 pb-1 text-[15px] font-semibold text-ds-text-secondary">
                    {t("search.recentChats")}
                  </div>
                  <div className="space-y-0.5">
                    {results.map((r, i) => (
                      <button
                        key={`${r.chat_id}-${r.message_id ?? "title"}-${i}`}
                        type="button"
                        onClick={() => handleSelect(r.chat_id, r.message_id ?? undefined)}
                        className={cn(searchListButtonClass, "justify-between")}
                      >
                        <div className="min-w-0 flex flex-1 items-start gap-2">
                          {r.parent_chat_id ? (
                            <GitFork
                              size={18}
                              strokeWidth={2}
                              className={`mt-0.5 shrink-0 ${PROJECT_COLOR_ICON_CLASSES.green}`}
                              aria-label={t("projects.forkedChat")}
                            />
                          ) : r.project_id && canUseProjects ? (
                            <ProjectIcon
                              iconName={projectsById.get(r.project_id)?.icon_name}
                              color={projectsById.get(r.project_id)?.accent_color}
                              size={18}
                              strokeWidth={2}
                              className="mt-0.5"
                            />
                          ) : (
                            <MessageCircle size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-ds-text" />
                          )}
                          <div className="min-w-0">
                            <span className="block truncate max-w-full font-medium">
                              {formatChatSearchLabel(r.chat_title, canUseProjects ? r.project_name : null)}
                            </span>
                            {r.parent_chat_id && !r.message_content && (
                              <span className="mt-0.5 block max-w-full truncate text-[13px] text-ds-text-tertiary">
                                {t("projects.forkedChat")}
                              </span>
                            )}
                            {r.message_content && (
                              <span className="mt-0.5 block max-w-full truncate text-[14px] text-ds-text-tertiary">
                                <span className="font-medium text-ds-text-secondary">
                                  {r.role === "user" ? t("search.roleUser") : t("search.roleAssistant")}
                                </span>
                                {r.message_content}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="ml-3 shrink-0 text-[13px] text-ds-text-tertiary">
                          {new Date(r.updated_at).toLocaleDateString()}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* No results */
            <div className="flex flex-1 items-center justify-center">
              <p className="text-center text-sm text-ds-text-tertiary">
                {t("search.noResults")}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
