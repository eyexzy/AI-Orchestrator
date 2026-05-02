"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Folder, Star, Pencil, Trash2 } from "lucide-react";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { useChatStore } from "@/lib/store/chatStore";
import { useProjectStore } from "@/lib/store/projectStore";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { ActionMenu } from "@/components/ui/action-menu";
import { NEW_CHAT_SENTINEL } from "@/lib/store/chatStore";
import { AssignChatProjectModal } from "@/components/modals/AssignChatProjectModal";
import { RenameChatModal } from "@/components/modals/RenameChatModal";
import { ProjectIcon } from "@/components/projects/ProjectIcon";
import { useTranslation } from "@/lib/store/i18nStore";
import { Skeleton } from "@/components/ui/skeleton";

function ActiveChatTitle() {
  const router = useRouter();
  const { level, userEmail } = useUserLevelStore();
  const { chats, activeChatId, renameChat, deleteChat, toggleFavorite, assignChatToProject } = useChatStore();
  const projects = useProjectStore((s) => s.projects);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const { t } = useTranslation();
  const activeChat = chats.find((c) => c.id === activeChatId);
  const rawTitle = activeChat?.title ?? "";
  const title = rawTitle === NEW_CHAT_SENTINEL ? t("sidebar.newChat") : rawTitle;
  const projectName = activeChat?.project_name ?? null;
  const projectMeta = projects.find((project) => project.id === activeChat?.project_id) ?? null;
  const canUseProjects = level >= 2;

  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  useEffect(() => {
    if (!canUseProjects || !userEmail) return;
    void loadProjects();
  }, [canUseProjects, loadProjects, userEmail]);

  const startRename = useCallback(() => {
    setMenuOpen(false);
    if (!activeChatId) return;
    setRenameOpen(true);
  }, [activeChatId]);

  const startAssignProject = useCallback(() => {
    setMenuOpen(false);
    if (!activeChatId || !canUseProjects) return;
    setAssignOpen(true);
  }, [activeChatId, canUseProjects]);

  if (!activeChatId || !activeChat) {
    return null;
  }

  const resolvedProjectName = projectName ?? (projectMeta?.name ?? null);

  return (
    <>
      <div className="flex h-10 items-center gap-0">
        {/* Project breadcrumb — underline + text brightens on hover, no bg */}
        {canUseProjects && resolvedProjectName && activeChat.project_id && (
          <>
            <button
              type="button"
              onClick={() => router.push(`/projects/${activeChat.project_id}`)}
              className="group flex h-10 items-center gap-1.5 bg-transparent border-none px-3 text-[15px] font-medium text-ds-text-secondary hover:text-ds-text"
            >
              <ProjectIcon
                iconName={projectMeta?.icon_name}
                color={projectMeta?.accent_color}
                size={16}
                strokeWidth={2}
              />
              <span className="max-w-[120px] truncate underline-offset-2 group-hover:underline">
                {resolvedProjectName}
              </span>
            </button>
            <span aria-hidden className="select-none text-ds-text-tertiary">/</span>
          </>
        )}

        {/* Chat title — static grey, not interactive */}
        <span className="max-w-[260px] truncate px-2 text-[15px] font-medium leading-5 text-ds-text-secondary">
          {title}
        </span>

        {/* Chevron — only this is the clickable button */}
        <button
          ref={btnRef}
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-ds-text-tertiary transition-colors hover:bg-gray-alpha-200 hover:text-ds-text"
          aria-label="Chat options"
        >
          <ChevronDown size={15} strokeWidth={2} />
        </button>
      </div>

      {menuOpen && (
        <ActionMenu
          align="end"
          anchorEl={btnRef.current}
          onClose={() => setMenuOpen(false)}
          items={[
            {
              label: activeChat?.is_favorite ? t("sidebar.unstar") : t("sidebar.star"),
              icon: <Star size={14} strokeWidth={2} className={activeChat?.is_favorite ? "fill-current" : ""} />,
              onClick: () => { if (activeChatId) toggleFavorite(activeChatId); },
            },
            ...(canUseProjects
              ? [
                  {
                    label: activeChat.project_id
                      ? t("projects.changeProject")
                      : t("projects.moveToProject"),
                    icon: <Folder size={14} strokeWidth={2} />,
                    onClick: startAssignProject,
                  },
                ]
              : []),
            {
              label: t("sidebar.rename"),
              icon: <Pencil size={14} strokeWidth={2} />,
              onClick: startRename,
            },
            {
              label: t("sidebar.delete"),
              icon: <Trash2 size={14} strokeWidth={2} />,
              onClick: () => { if (activeChatId) deleteChat(activeChatId); },
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
      <RenameChatModal
        open={renameOpen}
        onOpenChange={setRenameOpen}
        initialTitle={activeChat?.title ?? ""}
        onSave={async (nextTitle) => {
          if (!activeChatId) return;
          await renameChat(activeChatId, nextTitle);
        }}
      />
      <AssignChatProjectModal
        open={assignOpen}
        onOpenChange={setAssignOpen}
        projects={canUseProjects ? projects : []}
        currentProjectId={activeChat.project_id ?? null}
        chatTitle={activeChat.title}
        onAssign={async (projectId) => {
          if (!activeChatId) return;
          await assignChatToProject(activeChatId, projectId);
        }}
      />
    </>
  );
}

export default function ChatPage() {
  const activeChatId = useChatStore((s) => s.activeChatId);
  const hasMessages = useChatStore((s) => s.messages.length > 0);
  const isLoadingMessages = useChatStore((s) => s.isLoadingMessages);
  const activeChatIsFork = useChatStore((s) =>
    Boolean(s.chats.find((chat) => chat.id === s.activeChatId)?.parent_chat_id),
  );
  const chatHeader = activeChatId
    ? isLoadingMessages
      ? <ChatHeaderSkeleton />
      : (hasMessages || activeChatIsFork)
        ? <ChatHeaderContent />
        : undefined
    : undefined;

  return (
    <main className="flex flex-1 overflow-hidden px-0 pt-0 pb-0">
      <ChatLayout header={chatHeader} />
    </main>
  );
}

function ChatHeaderContent() {
  return <ActiveChatTitle />;
}

function ChatHeaderSkeleton() {
  const activeChat = useChatStore((s) => s.chats.find((chat) => chat.id === s.activeChatId) ?? null);
  const hasProject = Boolean(activeChat?.project_id && activeChat?.project_name);

  return (
    <div className="flex h-10 items-center gap-0">
      {hasProject && (
        <>
          <div className="flex h-10 items-center gap-1.5 px-3">
            <Skeleton width={16} height={16} className="rounded-md" />
            <Skeleton width={92} height={16} className="rounded-sm" />
          </div>
          <span aria-hidden className="select-none px-1 text-ds-text-tertiary">/</span>
        </>
      )}

      <div className="flex items-center gap-2 px-2">
        <Skeleton width={hasProject ? 220 : 280} height={16} className="rounded-sm" />
        <Skeleton width={20} height={20} className="rounded-md" />
      </div>
    </div>
  );
}
