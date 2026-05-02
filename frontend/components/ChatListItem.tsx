"use client";

import { memo, useRef, useState } from "react";
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Folder,
  GitFork,
  Star,
  CircleDashed,
} from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { ProjectIcon } from "@/components/projects/ProjectIcon";
import { PROJECT_COLOR_ICON_CLASSES } from "@/components/projects/projectTheme";
import { useTranslation } from "@/lib/store/i18nStore";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import type { ChatSession } from "@/lib/store/chatStore";
import { useProjectStore } from "@/lib/store/projectStore";

export interface ChatListItemProps {
  chat: ChatSession;
  locale: string;
  showProject: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: () => void;
  onToggleFavorite: () => void;
  onAssignProject: () => void;
  variant?: "default" | "minimal";
}

export function getChatListGrid(showProject: boolean): string {
  return showProject
    ? "grid-cols-[minmax(0,1fr)_200px_132px_36px]"
    : "grid-cols-[minmax(0,1fr)_132px_36px]";
}

export const ChatListItem = memo(function ChatListItem({
  chat,
  locale,
  showProject,
  onSelect,
  onDelete,
  onRename,
  onToggleFavorite,
  onAssignProject,
  variant = "default",
}: ChatListItemProps) {
  const { t } = useTranslation();
  const dotsRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const projectMeta = useProjectStore((state) =>
    chat.project_id
      ? state.projects.find((project) => project.id === chat.project_id) ?? null
      : null,
  );

  const relativeTime = formatRelativeTime(chat.updated_at, locale);
  const isFork = Boolean(chat.parent_chat_id);
  const hasProject = Boolean(chat.project_id);
  const gridClass = variant === "minimal"
    ? "grid-cols-[minmax(0,1fr)_36px]"
    : getChatListGrid(showProject);

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
        className={[
          "group grid w-full cursor-pointer items-center gap-4 rounded-xl border-none bg-transparent px-4 py-3 text-left transition-colors hover:bg-gray-alpha-200",
          gridClass,
        ].join(" ")}
      >
        {variant === "minimal" ? (
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              {isFork && (
                <GitFork
                  size={18}
                  strokeWidth={2}
                  className={`shrink-0 ${PROJECT_COLOR_ICON_CLASSES.green}`}
                  aria-label={t("projects.forkedChat")}
                />
              )}
              <span className="truncate text-[15px] font-medium leading-6 text-ds-text">
                {chat.title}
              </span>
            </div>
            <span className="text-[13px] tabular-nums text-ds-text-tertiary">{relativeTime}</span>
          </div>
        ) : (
          <>
            {/* Name */}
            <div className="flex min-w-0 items-center gap-2">
              {isFork && (
                <GitFork
                  size={18}
                  strokeWidth={2}
                  className={`shrink-0 ${PROJECT_COLOR_ICON_CLASSES.green}`}
                  aria-label={t("projects.forkedChat")}
                />
              )}
              <span className="truncate text-[15px] font-medium leading-6 text-ds-text">
                {chat.title}
              </span>
            </div>

            {/* Project */}
            {showProject && (
              <div className="flex min-w-0 items-center gap-2">
                {hasProject ? (
                  <ProjectIcon
                    iconName={projectMeta?.icon_name}
                    color={projectMeta?.accent_color}
                    size={18}
                    strokeWidth={2}
                  />
                ) : (
                  <CircleDashed size={18} strokeWidth={2} className="shrink-0 text-ds-text-tertiary" />
                )}
                <span
                  className={[
                    "truncate text-[15px] font-medium leading-6",
                    hasProject ? "text-ds-text-secondary" : "text-ds-text-tertiary",
                  ].join(" ")}
                >
                  {hasProject ? chat.project_name : t("projects.noProject")}
                </span>
              </div>
            )}

            {/* Updated */}
            <div className="text-[15px] tabular-nums text-ds-text-tertiary">{relativeTime}</div>
          </>
        )}

        {/* Actions */}
        <button
          ref={dotsRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-ds-text-tertiary opacity-0 transition-all group-hover:opacity-100 hover:bg-gray-alpha-300 hover:text-ds-text"
          aria-label={t("chats.chatActions")}
        >
          <MoreHorizontal size={16} strokeWidth={2} />
        </button>
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
            {
              label: chat.project_id
                ? t("projects.changeProject")
                : t("projects.moveToProject"),
              icon: <Folder size={14} strokeWidth={2} />,
              onClick: () => {
                setMenuOpen(false);
                onAssignProject();
              },
            },
            {
              label: t("sidebar.rename"),
              icon: <Pencil size={14} strokeWidth={2} />,
              onClick: () => {
                setMenuOpen(false);
                onRename();
              },
            },
            {
              label: t("sidebar.delete"),
              icon: <Trash2 size={14} strokeWidth={2} />,
              onClick: () => {
                setMenuOpen(false);
                onDelete();
              },
              confirm: {
                title: t("confirm.deleteChatTitle"),
                description: t("confirm.deleteChatDescription"),
                actionLabel: t("sidebar.delete"),
              },
              variant: "danger" as const,
            },
          ]}
        />
      )}
    </>
  );
});
