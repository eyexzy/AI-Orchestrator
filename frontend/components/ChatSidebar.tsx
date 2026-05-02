"use client";

import { useEffect, useMemo, useRef, useState, memo } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  SquarePen,
  Sidebar,
  Search,
  ChevronDown,
  LayoutGrid,
  MessageSquare,
  MessagesSquare,
  GitFork,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Star,
  Folder,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  dedupeChatSessions,
  useChatStore,
  type ChatSession,
} from "@/lib/store/chatStore";
import { useProjectStore } from "@/lib/store/projectStore";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ProjectIcon } from "@/components/projects/ProjectIcon";
import { PROJECT_COLOR_ICON_CLASSES } from "@/components/projects/projectTheme";
import { Separator } from "@/components/ui/separator";
import { Tooltip } from "@/components/ui/tooltip";

const ChatSearchModal = dynamic(
  () => import("@/components/ChatSearchModal").then((m) => ({ default: m.ChatSearchModal })),
  { ssr: false },
);
const RenameChatModal = dynamic(
  () => import("@/components/modals/RenameChatModal").then((m) => ({ default: m.RenameChatModal })),
  { ssr: false },
);
const AssignChatProjectModal = dynamic(
  () => import("@/components/modals/AssignChatProjectModal").then((m) => ({ default: m.AssignChatProjectModal })),
  { ssr: false },
);
const ProjectModal = dynamic(
  () => import("@/components/modals/ProjectModal").then((m) => ({ default: m.ProjectModal })),
  { ssr: false },
);
import { UserMenuDropdown } from "@/components/UserMenuDropdown";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { CHAT_SIDEBAR_UI_STATE_STORAGE_KEY } from "@/lib/config";
import { makeScopedStorageKey } from "@/lib/persistedState";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/store/i18nStore";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import type { Project } from "@/lib/store/projectStore";
import { usePersistentUiState } from "@/lib/usePersistentUiState";

const SIDEBAR_W = 300;
const COLLAPSED_W = 68;

const sidebarActionBtn =
  "w-full justify-start gap-2 rounded-lg px-3 h-10 text-[15px] font-medium text-ds-text hover:bg-gray-alpha-200 hover:text-ds-text overflow-hidden shadow-none";

const sidebarNavLink =
  "flex w-full items-center gap-2 rounded-lg px-3 h-10 text-[15px] font-medium transition-colors overflow-hidden";

const sidebarIconClass = "shrink-0 text-current";
const sidebarMenuIconClass = "text-current";
type SidebarSectionKey = "projects" | "favorites" | "recentChats";

type SidebarSectionsState = Record<SidebarSectionKey, boolean>;

const DEFAULT_SIDEBAR_SECTIONS_STATE: SidebarSectionsState = {
  projects: true,
  favorites: true,
  recentChats: true,
};

function isSidebarSectionsState(value: unknown): value is SidebarSectionsState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.projects === "boolean" &&
    typeof candidate.favorites === "boolean" &&
    typeof candidate.recentChats === "boolean"
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return (
    target.isContentEditable ||
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT"
  );
}

function SidebarListSkeleton({ count = 4 }: { count?: number }) {
  const widths = ["82%", "68%", "88%", "62%", "76%", "66%"];
  return (
    <div className="space-y-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 rounded-lg px-3 py-2 min-h-10">
          <Skeleton height={14} width={widths[i % widths.length]} className="max-w-full" />
        </div>
      ))}
    </div>
  );
}

const SectionHeading = memo(function SectionHeading({
  children,
  icon,
  expanded,
  onToggle,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex w-full items-center justify-between gap-3 rounded-md border-none bg-transparent px-3 py-1.5 text-[15px] font-semibold text-ds-text-secondary transition-colors hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--geist-background)]"
    >
      <span className="flex min-w-0 items-center gap-2 whitespace-nowrap">
        {icon}
        <span className="truncate">{children}</span>
      </span>
      <ChevronDown
        size={16}
        strokeWidth={2}
        className={cn("shrink-0 text-current transition-transform duration-200", !expanded && "-rotate-90")}
      />
    </button>
  );
});

const SidebarSection = memo(function SidebarSection({
  title,
  expanded,
  onToggle,
  children,
  icon,
}: {
  title: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <SectionHeading icon={icon} expanded={expanded} onToggle={onToggle}>
        {title}
      </SectionHeading>
      {expanded && <div className="mt-2">{children}</div>}
    </div>
  );
});

const ChatItem = memo(function ChatItem({
  chat,
  isActive,
  sidebarOpen,
  showProjectAction = true,
  onSelect,
  onDelete,
  onOpenRename,
  onToggleFavorite,
  onAssignProject,
}: {
  chat: ChatSession;
  isActive: boolean;
  sidebarOpen: boolean;
  showProjectAction?: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onOpenRename: () => void;
  onToggleFavorite: () => void;
  onAssignProject: () => void;
}) {
  const { t } = useTranslation();
  const dotsRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const isFork = Boolean(chat.parent_chat_id);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        className={`group relative flex w-full rounded-lg border-none px-3 py-2 text-left cursor-pointer transition-all duration-100 ${
          isActive
            ? "bg-gray-alpha-200 text-ds-text font-medium"
            : "bg-transparent text-ds-text hover:bg-gray-alpha-200 hover:text-ds-text"
        } items-center min-h-10`}
      >
        <div className={`flex min-w-0 flex-1 items-center gap-2 ${sidebarOpen ? "opacity-100" : "opacity-0 hidden w-0"}`}>
          {isFork && (
            <span title={t("projects.forkedChat")} className="flex shrink-0">
              <GitFork
                size={18}
                strokeWidth={2}
                className={PROJECT_COLOR_ICON_CLASSES.green}
                aria-label={t("projects.forkedChat")}
              />
            </span>
          )}
          <span className="block min-w-0 truncate text-[15px] font-medium leading-5">
            {chat.title}
          </span>
        </div>

        {sidebarOpen && (
          <button
            ref={dotsRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((value) => !value);
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ds-text-tertiary opacity-0 transition-all group-hover:opacity-100 hover:bg-gray-alpha-300 hover:text-ds-text"
            aria-label="Chat options"
          >
            <MoreHorizontal size={16} strokeWidth={2} className={sidebarMenuIconClass} />
          </button>
        )}
      </div>

      {menuOpen && (
        <ActionMenu
          align="end"
          anchorEl={dotsRef.current}
          onClose={() => setMenuOpen(false)}
          items={[
            {
              label: chat.is_favorite ? t("sidebar.unstar") : t("sidebar.star"),
              icon: (
                <Star
                  size={14}
                  strokeWidth={2}
                  className={chat.is_favorite ? "fill-current" : ""}
                />
              ),
              onClick: () => {
                setMenuOpen(false);
                onToggleFavorite();
              },
            },
            ...(showProjectAction
              ? [{
                label: chat.project_id ? t("projects.changeProject") : t("projects.moveToProject"),
                icon: <Folder size={14} strokeWidth={2} />,
                onClick: () => {
                  setMenuOpen(false);
                  onAssignProject();
                },
              }]
              : []),
            {
              label: t("sidebar.rename"),
              icon: <Pencil size={14} strokeWidth={2} />,
              onClick: () => {
                setMenuOpen(false);
                onOpenRename();
              },
            },
            {
              label: t("sidebar.delete"),
              icon: <Trash2 size={14} strokeWidth={2} />,
              onClick: onDelete,
              confirm: {
                title: t("confirm.deleteChatTitle"),
                description: t("confirm.deleteChatDescription"),
                actionLabel: t("sidebar.delete"),
              },
              variant: "danger",
            },
          ]}
        />
      )}
    </>
  );
});

const ProjectItem = memo(function ProjectItem({
  project,
  isActive,
  sidebarOpen,
  onSelect,
  onPrefetch,
  onOpenEdit,
  onDelete,
}: {
  project: Project;
  isActive: boolean;
  sidebarOpen: boolean;
  onSelect: () => void;
  onPrefetch: () => void;
  onOpenEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const dotsRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        onMouseEnter={onPrefetch}
        onFocus={onPrefetch}
        className={`group relative flex w-full items-center gap-2 rounded-lg border-none px-3 py-2 text-left transition-all duration-100 cursor-pointer ${
          isActive
            ? "bg-gray-alpha-200 text-ds-text font-medium"
            : "bg-transparent text-ds-text hover:bg-gray-alpha-200 hover:text-ds-text"
        } min-h-10`}
      >
        <ProjectIcon
          iconName={project.icon_name}
          color={project.accent_color}
          size={18}
          className="shrink-0"
          strokeWidth={2}
        />

        <span
          className={`block min-w-0 flex-1 truncate text-[15px] font-medium leading-5 ${
            sidebarOpen ? "opacity-100" : "opacity-0 hidden w-0"
          }`}
        >
          {project.name}
        </span>

        {sidebarOpen && (
          <button
            ref={dotsRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((value) => !value);
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ds-text-tertiary opacity-0 transition-all group-hover:opacity-100 hover:bg-gray-alpha-300 hover:text-ds-text"
            aria-label={t("projects.projectActions")}
          >
            <MoreHorizontal size={16} strokeWidth={2} className={sidebarMenuIconClass} />
          </button>
        )}
      </div>

      {menuOpen && (
        <ActionMenu
          align="end"
          anchorEl={dotsRef.current}
          onClose={() => setMenuOpen(false)}
          items={[
            {
              label: t("projects.editProject"),
              icon: <Pencil size={14} strokeWidth={2} />,
              onClick: () => {
                setMenuOpen(false);
                onOpenEdit();
              },
            },
            {
              label: t("projects.delete"),
              icon: <Trash2 size={14} strokeWidth={2} />,
              onClick: () => {
                setMenuOpen(false);
                onDelete();
              },
              confirm: {
                title: t("confirm.deleteProjectTitle"),
                description: t("confirm.deleteProjectDescription"),
                actionLabel: t("projects.delete"),
              },
              variant: "danger",
            },
          ]}
        />
      )}
    </>
  );
});

export function ChatSidebar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const level = useUserLevelStore((s) => s.level);
  const userEmail = useUserLevelStore((s) => s.userEmail);
  const {
    chats,
    activeChatId,
    isLoadingChats,
    chatListError,
    sidebarOpen,
    toggleSidebar,
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
      activeChatId: state.activeChatId,
      isLoadingChats: state.isLoadingChats,
      chatListError: state.chatListError,
      sidebarOpen: state.sidebarOpen,
      toggleSidebar: state.toggleSidebar,
      loadChats: state.loadChats,
      openDraftChat: state.openDraftChat,
      selectChat: state.selectChat,
      deleteChat: state.deleteChat,
      renameChat: state.renameChat,
      toggleFavorite: state.toggleFavorite,
      assignChatToProject: state.assignChatToProject,
    })),
  );
  const {
    projects,
    isLoadingProjects,
    loadProjects,
    updateProject,
    deleteProject,
  } = useProjectStore(
    useShallow((state) => ({
      projects: state.projects,
      isLoadingProjects: state.isLoadingProjects,
      loadProjects: state.loadProjects,
      updateProject: state.updateProject,
      deleteProject: state.deleteProject,
    })),
  );

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ChatSession | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<ChatSession | null>(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editProjectTarget, setEditProjectTarget] = useState<Project | null>(null);
  const [expandedSections, setExpandedSections] = usePersistentUiState<SidebarSectionsState>(
    makeScopedStorageKey(CHAT_SIDEBAR_UI_STATE_STORAGE_KEY, userEmail),
    DEFAULT_SIDEBAR_SECTIONS_STATE,
    { validate: isSidebarSectionsState },
  );

  const isOnChat = pathname === "/chat" || pathname === "/";
  const isOnProjects = pathname.startsWith("/projects");
  const isChatSidebarRoute = isOnChat || isOnProjects;
  const canUseProjects = level >= 2;
  const showL1Tooltips = level === 1;
  const visibleChats = useMemo(() => dedupeChatSessions(chats), [chats]);

  useEffect(() => {
    if (!userEmail) return;
    void loadChats(userEmail);
  }, [loadChats, userEmail]);

  useEffect(() => {
    if (!userEmail || !canUseProjects) return;
    void loadProjects();
  }, [canUseProjects, loadProjects, userEmail]);

  const handleOpenBlankChat = async () => {
    router.push("/chat");
    openDraftChat();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen((value) => !value);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key.toLowerCase() === "n") {
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        void handleOpenBlankChat();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleOpenBlankChat]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setIsScrolled(el.scrollTop > 4);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [isChatSidebarRoute, sidebarOpen]);

  const handleOpenRenameModal = (chat: ChatSession) => {
    setRenameTarget(chat);
    setRenameModalOpen(true);
  };

  const handleOpenAssignModal = (chat: ChatSession) => {
    setAssignTarget(chat);
    setAssignModalOpen(true);
  };

  const handleOpenChatFromSidebar = async (chatId: string) => {
    if (!isOnChat) {
      router.push("/chat");
    }
    await selectChat(chatId);
  };

  const handleOpenProjectEditModal = (project: Project) => {
    setEditProjectTarget(project);
    setProjectModalOpen(true);
  };

  const handleDeleteProject = async (projectId: string) => {
    await deleteProject(projectId);
    if (pathname === `/projects/${projectId}`) {
      router.push("/projects");
    }
  };

  const toggleSection = (section: SidebarSectionKey) => {
    setExpandedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  const favoriteChats = useMemo(
    () => visibleChats.filter((chat) => chat.is_favorite),
    [visibleChats],
  );
  const favoriteProjects = useMemo(
    () => (canUseProjects ? projects.filter((project) => project.is_favorite) : []),
    [canUseProjects, projects],
  );
  const ungroupedRecentChats = useMemo(
    () => visibleChats.filter((chat) => !chat.is_favorite),
    [visibleChats],
  );
  const showSidebarContent = Boolean(userEmail);
  return (
    <div
      className="flex h-full shrink-0 flex-col border-r border-gray-alpha-200 bg-background-100 overflow-visible"
      style={{ width: sidebarOpen ? SIDEBAR_W : COLLAPSED_W }}
    >
      <div className="relative flex items-center px-3 py-3.5 shrink-0 h-[60px] overflow-hidden">
        <button
          type="button"
          onClick={handleOpenBlankChat}
          aria-label={t("sidebar.newChat")}
          className={`inline-flex h-10 items-center rounded-lg px-3 transition-opacity hover:bg-gray-alpha-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--geist-background)] ${
            sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <Image
            src="/nexa-logo.svg"
            alt="NEXA"
            width={72}
            height={18}
            priority
            className="shrink-0 dark:brightness-0 dark:invert"
            style={{ width: "auto", height: "18px" }}
          />
        </button>

        <div className={`absolute top-3.5 ${sidebarOpen ? "right-3" : "left-1/2 -translate-x-1/2"}`}>
          {showL1Tooltips ? (
            <Tooltip
              content={t("tooltip.l1CollapseSidebar")}
              trackingId="l1_sidebar_toggle"
              side="bottom"
              align={sidebarOpen ? "end" : "center"}
            >
              <Button
                variant="tertiary"
                size="sm"
                iconOnly
                onClick={toggleSidebar}
                aria-label={sidebarOpen ? t("sidebar.collapse") : t("sidebar.openSidebar")}
                className="h-7 w-7 rounded-md p-0 shadow-none text-ds-text hover:bg-gray-alpha-300 hover:text-ds-text"
              >
                <Sidebar size={18} strokeWidth={2} className="shrink-0 text-ds-text" />
              </Button>
            </Tooltip>
          ) : (
            <Button
              variant="tertiary"
              size="sm"
              iconOnly
              onClick={toggleSidebar}
              aria-label={sidebarOpen ? t("sidebar.collapse") : t("sidebar.openSidebar")}
              className="h-7 w-7 rounded-md p-0 shadow-none text-ds-text hover:bg-gray-alpha-300 hover:text-ds-text"
            >
              <Sidebar size={18} strokeWidth={2} className="shrink-0 text-ds-text" />
            </Button>
          )}
        </div>
      </div>

      <div className="px-3 pb-3 shrink-0 space-y-0.5">
        <Button
          type="button"
          variant="tertiary"
          size="md"
          onClick={handleOpenBlankChat}
          className={cn(sidebarActionBtn, "group/new-chat")}
          aria-label={t("sidebar.newChat")}
          leftIcon={<SquarePen size={18} strokeWidth={2} className={sidebarIconClass} />}
        >
          <span className={`whitespace-nowrap ${sidebarOpen ? "opacity-100" : "opacity-0"}`}>
            {t("sidebar.newChat")}
          </span>
          {sidebarOpen && (
            <Kbd
              size="sm"
              keys={["Ctrl", "Alt", "N"]}
              className="ml-auto opacity-0 transition-opacity duration-150 group-hover/new-chat:opacity-100"
            />
          )}
        </Button>

        <Button
          type="button"
          variant="tertiary"
          size="md"
          onClick={() => setIsSearchOpen(true)}
          className={cn(sidebarActionBtn, "group/search")}
          aria-label={t("sidebar.search")}
          leftIcon={<Search size={18} strokeWidth={2} className={sidebarIconClass} />}
        >
          <span className={`whitespace-nowrap ${sidebarOpen ? "opacity-100" : "opacity-0"}`}>
            {t("sidebar.search")}
          </span>
          {sidebarOpen && (
            <Kbd
              size="sm"
              keys={["Ctrl", "K"]}
              className="ml-auto opacity-0 transition-opacity duration-150 group-hover/search:opacity-100"
            />
          )}
        </Button>

        {canUseProjects && (
          <Link
            href="/projects"
            className={`${sidebarNavLink} ${
              pathname === "/projects"
                ? "bg-gray-alpha-200 text-ds-text"
                : "text-ds-text hover:bg-gray-alpha-200 hover:text-ds-text"
            }`}
          >
            <LayoutGrid size={18} strokeWidth={2} className={sidebarIconClass} />
            <span className={`whitespace-nowrap ${sidebarOpen ? "opacity-100" : "opacity-0 w-0 hidden"}`}>
              {t("nav.projects")}
            </span>
          </Link>
        )}

        <Link
          href="/chats"
          className={`${sidebarNavLink} ${
            pathname === "/chats"
              ? "bg-gray-alpha-200 text-ds-text"
              : "text-ds-text hover:bg-gray-alpha-200 hover:text-ds-text"
          }`}
        >
          <MessagesSquare size={18} strokeWidth={2} className={sidebarIconClass} />
          <span className={`whitespace-nowrap ${sidebarOpen ? "opacity-100" : "opacity-0 w-0 hidden"}`}>
            {t("nav.chats")}
          </span>
        </Link>
      </div>

      <Separator className={cn("shrink-0 transition-opacity duration-200", isScrolled ? "opacity-100" : "opacity-0")} />

      {showSidebarContent && (
        <div
          ref={scrollRef}
          className={`flex-1 overflow-y-auto px-3 pb-2 pt-3 min-h-0 text-base ${sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
          {chatListError && visibleChats.length === 0 && !isLoadingChats ? (
            <ErrorState
              centered
              title={t("sidebar.loadErrorTitle")}
              description={chatListError}
              actionLabel={t("common.retry")}
              onAction={() => {
                if (userEmail) {
                  void loadChats(userEmail);
                }
              }}
            />
          ) : (
            <div className="space-y-5">
              {canUseProjects && (
                <SidebarSection
                  title={t("search.projects")}
                  expanded={expandedSections.projects}
                  onToggle={() => toggleSection("projects")}
                >
                  {isLoadingProjects && favoriteProjects.length === 0 ? (
                    <SidebarListSkeleton count={3} />
                  ) : favoriteProjects.length > 0 ? (
                    <div className="space-y-0.5">
                      {favoriteProjects.map((project) => (
                        <ProjectItem
                          key={project.id}
                          project={project}
                          isActive={pathname === `/projects/${project.id}`}
                          sidebarOpen={sidebarOpen}
                          onPrefetch={() => router.prefetch(`/projects/${project.id}`)}
                          onSelect={() => router.push(`/projects/${project.id}`)}
                          onOpenEdit={() => handleOpenProjectEditModal(project)}
                          onDelete={() => void handleDeleteProject(project.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState.Placeholder>
                      {t("sidebar.projectsEmpty")}
                    </EmptyState.Placeholder>
                  )}
                </SidebarSection>
              )}

              {chatListError && (
                <ErrorState
                  description={chatListError}
                  actionLabel={t("common.retry")}
                  onAction={() => {
                    if (userEmail) {
                      void loadChats(userEmail);
                    }
                  }}
                />
              )}

              <SidebarSection
                title={t("sidebar.favorites")}
                expanded={expandedSections.favorites}
                onToggle={() => toggleSection("favorites")}
              >
                {isLoadingChats && favoriteChats.length === 0 ? (
                  <SidebarListSkeleton count={2} />
                ) : favoriteChats.length > 0 ? (
                  <div className="space-y-0.5">
                    {favoriteChats.map((chat) => (
                      <ChatItem
                        key={`favorite-${chat.id}`}
                        chat={chat}
                        isActive={isOnChat && chat.id === activeChatId}
                        sidebarOpen={sidebarOpen}
                        onSelect={() => void handleOpenChatFromSidebar(chat.id)}
                        onDelete={() => deleteChat(chat.id)}
                        onOpenRename={() => handleOpenRenameModal(chat)}
                        onToggleFavorite={() => toggleFavorite(chat.id)}
                        showProjectAction={canUseProjects}
                        onAssignProject={() => handleOpenAssignModal(chat)}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState.Placeholder>
                    {t("sidebar.favoritesEmpty")}
                  </EmptyState.Placeholder>
                )}
              </SidebarSection>

              <SidebarSection
                title={t("sidebar.recentChats")}
                expanded={expandedSections.recentChats}
                onToggle={() => toggleSection("recentChats")}
              >
                {isLoadingChats && ungroupedRecentChats.length === 0 ? (
                  <SidebarListSkeleton count={4} />
                ) : ungroupedRecentChats.length > 0 ? (
                  <div className="space-y-0.5">
                    {ungroupedRecentChats.map((chat) =>
                      chat.isPending ? (
                        <div key={chat.id} className="flex items-center gap-2 rounded-lg px-3 py-2 min-h-10">
                          <Skeleton height={14} width="72%" className="max-w-full" />
                        </div>
                      ) : (
                        <ChatItem
                          key={chat.id}
                          chat={chat}
                          isActive={isOnChat && chat.id === activeChatId}
                          sidebarOpen={sidebarOpen}
                          onSelect={() => void handleOpenChatFromSidebar(chat.id)}
                          onDelete={() => deleteChat(chat.id)}
                          onOpenRename={() => handleOpenRenameModal(chat)}
                          onToggleFavorite={() => toggleFavorite(chat.id)}
                          showProjectAction={canUseProjects}
                          onAssignProject={() => handleOpenAssignModal(chat)}
                        />
                      )
                    )}
                  </div>
                ) : (
                  <EmptyState.Placeholder>
                    {t("sidebar.recentChatsEmpty")}
                  </EmptyState.Placeholder>
                )}
              </SidebarSection>
            </div>
          )}
        </div>
      )}

      {!showSidebarContent && <div className="flex-1" />}

      <Separator />
      <div
        className={`shrink-0 px-3 py-3 min-h-[72px] flex ${
          sidebarOpen ? "items-stretch" : "items-center justify-center"
        }`}
      >
        {showL1Tooltips ? (
          <Tooltip
            content={t("tooltip.l1Profile")}
            trackingId="l1_sidebar_profile"
            align={sidebarOpen ? "start" : "center"}
            className={sidebarOpen ? "relative w-full cursor-help" : "relative flex h-10 w-10 items-center justify-center cursor-help"}
          >
            <UserMenuDropdown
              triggerVariant="sidebar"
              hideNameInMenu
              openDirection="up"
              sidebarOpen={sidebarOpen}
            />
          </Tooltip>
        ) : (
          <UserMenuDropdown
            triggerVariant="sidebar"
            hideNameInMenu
            openDirection="up"
            sidebarOpen={sidebarOpen}
          />
        )}
      </div>

      <ChatSearchModal open={isSearchOpen} onOpenChange={setIsSearchOpen} />
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
      <ProjectModal
        open={projectModalOpen}
        onOpenChange={setProjectModalOpen}
        mode="edit"
        initialName={editProjectTarget?.name ?? ""}
        initialDescription={editProjectTarget?.description ?? ""}
        initialAccentColor={editProjectTarget?.accent_color ?? "blue"}
        initialIconName={editProjectTarget?.icon_name ?? "folder"}
        initialSystemHint={editProjectTarget?.system_hint ?? ""}
        onSave={async (payload) => {
          if (!editProjectTarget) return;
          await updateProject(editProjectTarget.id, payload);
        }}
      />
    </div>
  );
}
