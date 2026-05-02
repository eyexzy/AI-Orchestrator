"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatListItem, getChatListGrid } from "@/components/ChatListItem";
import { CHATS_PAGE_UI_STATE_STORAGE_KEY } from "@/lib/config";
import { makeScopedStorageKey } from "@/lib/persistedState";
import { useTranslation } from "@/lib/store/i18nStore";
import {
  dedupeChatSessions,
  useChatStore,
  type ChatSession,
} from "@/lib/store/chatStore";
import { useProjectStore } from "@/lib/store/projectStore";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { usePersistentUiState } from "@/lib/usePersistentUiState";

const RenameChatModal = dynamic(
  () => import("@/components/modals/RenameChatModal").then((m) => ({ default: m.RenameChatModal })),
  { ssr: false },
);
const AssignChatProjectModal = dynamic(
  () => import("@/components/modals/AssignChatProjectModal").then((m) => ({ default: m.AssignChatProjectModal })),
  { ssr: false },
);

type SortKey = "name" | "project" | "updated";
type SortDirection = "asc" | "desc";

interface ChatsPageUiState {
  query: string;
  sortKey: SortKey;
  sortDirection: SortDirection;
}

const DEFAULT_CHATS_PAGE_UI_STATE: ChatsPageUiState = {
  query: "",
  sortKey: "updated",
  sortDirection: "desc",
};

function isSortKey(value: unknown): value is SortKey {
  return value === "name" || value === "project" || value === "updated";
}

function isSortDirection(value: unknown): value is SortDirection {
  return value === "asc" || value === "desc";
}

function isChatsPageUiState(value: unknown): value is ChatsPageUiState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.query === "string" &&
    isSortKey(candidate.sortKey) &&
    isSortDirection(candidate.sortDirection)
  );
}

/* ── skeleton ─────────────────────────────────────────────── */

function ChatsListSkeleton({ showProject, count = 6 }: { showProject: boolean; count?: number }) {
  const gridClass = getChatListGrid(showProject);

  return (
    <div className="space-y-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`grid items-center gap-4 rounded-xl px-4 py-3 ${gridClass}`}>
          <Skeleton height={18} width={`${48 + (i % 3) * 12}%`} />
          {showProject && <Skeleton height={18} width={`${58 + (i % 2) * 10}%`} />}
          <Skeleton height={18} width={i % 2 === 0 ? 96 : 116} />
          <Skeleton height={32} width={32} className="rounded-md" />
        </div>
      ))}
    </div>
  );
}

function StaticTableHeader({
  showProject,
  nameLabel,
  projectLabel,
  updatedLabel,
}: {
  showProject: boolean;
  nameLabel: string;
  projectLabel: string;
  updatedLabel: string;
}) {
  const gridClass = getChatListGrid(showProject);

  return (
    <div className={["grid items-center gap-4 px-4 pb-2", gridClass].join(" ")}>
      <span className="justify-self-start text-[15px] leading-6 font-medium text-ds-text-tertiary">{nameLabel}</span>
      {showProject && (
        <span className="justify-self-start text-[15px] leading-6 font-medium text-ds-text-tertiary">{projectLabel}</span>
      )}
      <span className="justify-self-start text-[15px] leading-6 font-medium text-ds-text-tertiary">{updatedLabel}</span>
      <div />
    </div>
  );
}

function ChatsPageSkeleton({
  showProject,
  title,
  newChatLabel,
  searchPlaceholder,
  nameLabel,
  projectLabel,
  updatedLabel,
}: {
  showProject: boolean;
  title: string;
  newChatLabel: string;
  searchPlaceholder: string;
  nameLabel: string;
  projectLabel: string;
  updatedLabel: string;
}) {
  return (
    <>
      <div className="shrink-0 space-y-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-[28px] font-semibold text-ds-text sm:text-[32px]">
            {title}
          </h1>
          <Button
            type="button"
            variant="default"
            size="md"
            leftIcon={<Plus size={16} strokeWidth={2} />}
            disabled
            className="w-fit"
          >
            {newChatLabel}
          </Button>
        </div>

        <Input
          variant="default"
          size="lg"
          value=""
          readOnly
          placeholder={searchPlaceholder}
          leftIcon={<Search size={17} strokeWidth={2} className="text-ds-text-tertiary" />}
          className="bg-background-100"
        />
      </div>

      <div className="mt-6 flex flex-1 flex-col min-h-0">
        <div className="mt-0.5 flex-1 min-h-0 overflow-y-auto px-1 -mx-1">
          <div className="sticky top-0 z-10 bg-background">
            <StaticTableHeader
              showProject={showProject}
              nameLabel={nameLabel}
              projectLabel={projectLabel}
              updatedLabel={updatedLabel}
            />
          </div>
          <ChatsListSkeleton showProject={showProject} count={8} />
        </div>
      </div>
    </>
  );
}

/* ── table header ─────────────────────────────────────────── */

interface SortableHeaderProps {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  align?: "start" | "end";
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "start",
}: SortableHeaderProps) {
  const isActive = sortKey === activeKey;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={[
        "group inline-flex w-fit cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-[15px] leading-6 font-medium transition-colors",
        isActive ? "text-ds-text-secondary" : "text-ds-text-tertiary hover:text-ds-text-secondary",
        align === "end" ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      <span>{label}</span>
      {isActive ? (
        direction === "desc" ? (
          <ChevronDown size={14} strokeWidth={2} />
        ) : (
          <ChevronUp size={14} strokeWidth={2} />
        )
      ) : (
        <ChevronsUpDown
          size={14}
          strokeWidth={2}
          className="text-ds-text-quaternary opacity-0 transition-opacity group-hover:opacity-100"
        />
      )}
    </button>
  );
}

interface TableHeaderProps {
  showProject: boolean;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
}

function TableHeader({ showProject, sortKey, sortDirection, onSort }: TableHeaderProps) {
  const { t } = useTranslation();
  const gridClass = getChatListGrid(showProject);

  return (
    <div className={["grid items-center gap-4 px-4 pb-2", gridClass].join(" ")}>
      <SortableHeader
        label={t("chats.columnName")}
        sortKey="name"
        activeKey={sortKey}
        direction={sortDirection}
        onSort={onSort}
      />
      {showProject && (
        <SortableHeader
          label={t("chats.columnProject")}
          sortKey="project"
          activeKey={sortKey}
          direction={sortDirection}
          onSort={onSort}
        />
      )}
      <SortableHeader
        label={t("chats.columnUpdated")}
        sortKey="updated"
        activeKey={sortKey}
        direction={sortDirection}
        onSort={onSort}
      />
      <div />
    </div>
  );
}

/* ── page ─────────────────────────────────────────────────── */

export default function ChatsPage() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const locale = language === "uk" ? "uk-UA" : "en-US";
  const userEmail = useUserLevelStore((s) => s.userEmail);
  const level = useUserLevelStore((s) => s.level);
  const canUseProjects = level >= 2;

  const {
    chats,
    isLoadingChats,
    chatListError,
    loadChats,
    openDraftChat,
    selectChat,
    deleteChat,
    renameChat,
    toggleFavorite,
    assignChatToProject,
  } = useChatStore(
    useShallow((state) => ({
      chats: state.chats,
      isLoadingChats: state.isLoadingChats,
      chatListError: state.chatListError,
      loadChats: state.loadChats,
      openDraftChat: state.openDraftChat,
      selectChat: state.selectChat,
      deleteChat: state.deleteChat,
      renameChat: state.renameChat,
      toggleFavorite: state.toggleFavorite,
      assignChatToProject: state.assignChatToProject,
    })),
  );
  const projects = useProjectStore((s) => s.projects);
  const loadProjects = useProjectStore((s) => s.loadProjects);

  const [pageUiState, setPageUiState] = usePersistentUiState<ChatsPageUiState>(
    makeScopedStorageKey(CHATS_PAGE_UI_STATE_STORAGE_KEY, userEmail),
    DEFAULT_CHATS_PAGE_UI_STATE,
    { validate: isChatsPageUiState },
  );
  const { query, sortKey, sortDirection } = pageUiState;
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ChatSession | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<ChatSession | null>(null);

  const visibleChats = useMemo(() => dedupeChatSessions(chats), [chats]);

  useEffect(() => {
    if (!userEmail) return;
    void loadChats(userEmail, true);
    if (canUseProjects) void loadProjects();
  }, [loadChats, loadProjects, userEmail, canUseProjects]);

  const sortedChats = useMemo(() => {
    const next = [...visibleChats];
    next.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") {
        cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      } else if (sortKey === "project") {
        const an = a.project_name ?? "";
        const bn = b.project_name ?? "";
        if (!an && bn) cmp = 1;
        else if (an && !bn) cmp = -1;
        else cmp = an.localeCompare(bn, undefined, { sensitivity: "base" });
      } else {
        cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return next;
  }, [visibleChats, sortKey, sortDirection]);

  const filteredChats = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sortedChats;
    return sortedChats.filter(
      (c) =>
        c.title.toLowerCase().includes(normalized) ||
        (c.project_name && c.project_name.toLowerCase().includes(normalized)),
    );
  }, [query, sortedChats]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setPageUiState((prev) => ({
        ...prev,
        sortDirection: prev.sortDirection === "asc" ? "desc" : "asc",
      }));
    } else {
      setPageUiState((prev) => ({
        ...prev,
        sortKey: key,
        sortDirection: key === "updated" ? "desc" : "asc",
      }));
    }
  };

  const handleOpenChat = async (chatId: string) => {
    router.push("/chat");
    await selectChat(chatId);
  };

  const handleNewChat = () => {
    router.push("/chat");
    openDraftChat();
  };

  return (
    <>
      <main className="flex-1 flex flex-col min-h-0">
        <div className="mx-auto w-full max-w-5xl flex flex-col flex-1 min-h-0 px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
          {isLoadingChats ? (
            <ChatsPageSkeleton
              showProject={canUseProjects}
              title={t("chats.title")}
              newChatLabel={t("chats.newChat")}
              searchPlaceholder={t("chats.searchPlaceholder")}
              nameLabel={t("chats.columnName")}
              projectLabel={t("chats.columnProject")}
              updatedLabel={t("chats.columnUpdated")}
            />
          ) : (
            <>
              <div className="shrink-0 space-y-6">
                {/* Header */}
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <h1 className="text-[28px] font-semibold text-ds-text sm:text-[32px]">
                    {t("chats.title")}
                  </h1>
                  <Button
                    type="button"
                    variant="default"
                    size="md"
                    leftIcon={<Plus size={16} strokeWidth={2} />}
                    onClick={handleNewChat}
                    className="w-fit"
                  >
                    {t("chats.newChat")}
                  </Button>
                </div>

                {/* Search */}
                <Input
                  variant="default"
                  size="lg"
                  value={query}
                  onChange={(e) =>
                    setPageUiState((prev) => ({
                      ...prev,
                      query: e.target.value,
                    }))}
                  placeholder={t("chats.searchPlaceholder")}
                  leftIcon={<Search size={17} strokeWidth={2} className="text-ds-text-tertiary" />}
                  className="bg-background-100"
                />
              </div>

              {/* Content */}
              <div className="mt-6 flex flex-col flex-1 min-h-0">
                {chatListError ? (
                  <ErrorState
                    centered
                    title={t("chats.loadErrorTitle")}
                    description={chatListError}
                    actionLabel={t("common.retry")}
                    onAction={() => {
                      if (userEmail) void loadChats(userEmail, true);
                    }}
                  />
                ) : (
                  <div className="flex flex-col h-full min-h-0">
                    {visibleChats.length === 0 ? (
                      <EmptyState.Panel
                        title={t("chats.emptyTitle")}
                        description={t("chats.emptyDescription")}
                        className="mt-1 min-h-[420px]"
                      />
                    ) : filteredChats.length === 0 ? (
                      <EmptyState.Panel
                        title={t("chats.emptySearchTitle")}
                        description={t("chats.emptySearchDescription")}
                        className="mt-1 min-h-[420px]"
                      />
                    ) : (
                      <div className="mt-0.5 flex-1 min-h-0 overflow-y-auto px-1 -mx-1">
                        <div className="sticky top-0 z-10 bg-background">
                          <TableHeader
                            showProject={canUseProjects}
                            sortKey={sortKey}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                          />
                        </div>
                        <div className="space-y-1">
                          {filteredChats.map((chat) => (
                            <ChatListItem
                              key={chat.id}
                              chat={chat}
                              locale={locale}
                              showProject={canUseProjects}
                              onSelect={() => void handleOpenChat(chat.id)}
                              onDelete={() => deleteChat(chat.id)}
                              onRename={() => {
                                setRenameTarget(chat);
                                setRenameModalOpen(true);
                              }}
                              onToggleFavorite={() => toggleFavorite(chat.id)}
                              onAssignProject={() => {
                                setAssignTarget(chat);
                                setAssignModalOpen(true);
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      <RenameChatModal
        open={renameModalOpen}
        onOpenChange={setRenameModalOpen}
        initialTitle={renameTarget?.title ?? ""}
        onSave={async (nextTitle) => {
          if (!renameTarget) return;
          await renameChat(renameTarget.id, nextTitle);
        }}
      />
      <AssignChatProjectModal
        open={assignModalOpen}
        onOpenChange={setAssignModalOpen}
        projects={canUseProjects ? projects : []}
        currentProjectId={assignTarget?.project_id ?? null}
        chatTitle={assignTarget?.title ?? ""}
        onAssign={async (projectId) => {
          if (!assignTarget) return;
          await assignChatToProject(assignTarget.id, projectId);
        }}
      />
    </>
  );
}
