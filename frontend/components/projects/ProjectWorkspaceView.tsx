"use client";

import { type ComponentProps, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  GitBranch,
  MessageSquare,
  MoreVertical,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";
import { MainInput } from "@/components/chat/MainInput";
import type { SidebarConfig } from "@/components/chat/ConfigSidebar";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { useChatStore, type ChatSession } from "@/lib/store/chatStore";
import { useProjectStore, type Project } from "@/lib/store/projectStore";
import { useTranslation } from "@/lib/store/i18nStore";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChatListItem } from "@/components/ChatListItem";
import { ProjectIconPicker } from "@/components/projects/ProjectIconPicker";
import { ProjectSources } from "@/components/projects/ProjectSources";
import { Tooltip } from "@/components/ui/tooltip";
import { PROJECT_WORKSPACE_UI_STATE_STORAGE_KEY } from "@/lib/config";
import { makeScopedStorageKey } from "@/lib/persistedState";
import { usePersistentUiState } from "@/lib/usePersistentUiState";

const ConfigSidebar = dynamic(
  () => import("@/components/chat/ConfigSidebar").then((m) => ({ default: m.ConfigSidebar })),
  {
    ssr: false,
  },
);

const RenameChatModal = dynamic(
  () => import("@/components/modals/RenameChatModal").then((m) => ({ default: m.RenameChatModal })),
  { ssr: false }
);

const AssignChatProjectModal = dynamic(
  () => import("@/components/modals/AssignChatProjectModal").then((m) => ({ default: m.AssignChatProjectModal })),
  { ssr: false }
);

interface ProjectWorkspaceViewProps {
  project: Project;
  chats: ChatSession[];
  composerResetKey?: number;
  isLaunchingPrompt: boolean;
  onBack: () => Promise<void> | void;
  onCustomize: () => Promise<void> | void;
  onUpdateProjectIdentity: (payload: { icon_name?: string; accent_color?: string }) => Promise<void> | void;
  onDeleteProject: () => Promise<void> | void;
  onToggleProjectFavorite: () => Promise<void> | void;
  onOpenChat: (chatId: string) => Promise<void> | void;
  onNewChat: () => Promise<void> | void;
  onLaunchPrompt: (prompt: string) => Promise<void> | void;
  chatParams: ComponentProps<typeof MainInput>["chatParams"];
  sidebarConfig: SidebarConfig;
  externalPrompt?: string | null;
  onExternalPromptConsumed?: () => void;
  onAppendToSystem?: (text: string) => void;
  onVariableNamesChange?: (names: string[]) => void;
  mono?: boolean;
  placeholder?: string;
}

function formatDate(value: string | null, locale: string) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function isProjectWorkspaceTab(value: unknown): value is "chats" | "sources" {
  return value === "chats" || value === "sources";
}

export function ProjectWorkspaceView({
  project,
  chats,
  composerResetKey = 0,
  isLaunchingPrompt,
  onBack,
  onCustomize,
  onUpdateProjectIdentity,
  onDeleteProject,
  onToggleProjectFavorite,
  onOpenChat,
  onNewChat,
  onLaunchPrompt,
  chatParams,
  sidebarConfig,
  externalPrompt,
  onExternalPromptConsumed,
  onAppendToSystem,
  onVariableNamesChange,
  mono = false,
  placeholder,
}: ProjectWorkspaceViewProps) {
  const { t, language } = useTranslation();
  const level = useUserLevelStore((s) => s.level);
  const userEmail = useUserLevelStore((s) => s.userEmail);
  const deleteChat = useChatStore((s) => s.deleteChat);
  const renameChat = useChatStore((s) => s.renameChat);
  const toggleFavorite = useChatStore((s) => s.toggleFavorite);
  const assignChatToProject = useChatStore((s) => s.assignChatToProject);
  const projects = useProjectStore((s) => s.projects);

  const projectMenuRef = useRef<HTMLButtonElement>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);

  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ChatSession | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<ChatSession | null>(null);
  const [activeTab, setActiveTab] = usePersistentUiState<"chats" | "sources">(
    makeScopedStorageKey(`${PROJECT_WORKSPACE_UI_STATE_STORAGE_KEY}:${project.id}`, userEmail),
    "chats",
    { validate: isProjectWorkspaceTab },
  );

  return (
    <div className="flex h-full min-h-0 gap-0">
      <div className="flex min-w-0 flex-1 flex-col min-h-0">
        <div className="flex min-h-0 flex-1 flex-col px-6 pb-5 pt-6">
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            onClick={() => void onBack()}
            leftIcon={<ArrowLeft size={16} strokeWidth={2} />}
            className="shrink-0 mb-5 -ml-2 text-[15px] font-medium text-ds-text self-start"
          >
            {t("projects.backToProjects")}
          </Button>

          <div className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col">
            {/* Static header: title + input — does not scroll */}
            <div className="shrink-0">
              <div className="mb-5 flex flex-col gap-1">
                <div className="flex min-w-0 items-center gap-2">
                  <ProjectIconPicker
                    iconName={project.icon_name}
                    color={project.accent_color}
                    onIconChange={(icon_name) => void onUpdateProjectIdentity({ icon_name })}
                    onColorChange={(accent_color) => void onUpdateProjectIdentity({ accent_color })}
                    variant="ghost"
                    size="md"
                    iconSize={22}
                    className="-ml-1 h-9 w-9 shrink-0"
                    ariaLabel={t("projects.chooseIcon")}
                  />
                  <h1 className="min-w-0 flex-1 truncate text-[24px] font-semibold leading-none text-ds-text sm:text-[26px]">
                    {project.name}
                  </h1>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Tooltip content={project.is_favorite ? t("projects.unstarProject") : t("projects.starProject")}>
                      <Button
                        type="button"
                        variant="tertiary"
                        size="sm"
                        iconOnly
                        onClick={() => void onToggleProjectFavorite()}
                        aria-label={project.is_favorite ? t("projects.unstarProject") : t("projects.starProject")}
                      >
                        <Star size={16} strokeWidth={2} className={project.is_favorite ? "fill-current" : ""} />
                      </Button>
                    </Tooltip>
                    <Button
                      ref={projectMenuRef}
                      type="button"
                      variant="tertiary"
                      size="sm"
                      iconOnly
                      onClick={() => setProjectMenuOpen((value) => !value)}
                      aria-label={t("projects.projectActions")}
                    >
                      <MoreVertical size={16} strokeWidth={2} />
                    </Button>
                  </div>
                </div>
                {project.description && (
                  <p className="truncate pl-[36px] text-[14px] leading-6 text-ds-text-tertiary">
                    {project.description}
                  </p>
                )}
              </div>

              {projectMenuOpen && (
                <ActionMenu
                  anchorEl={projectMenuRef.current}
                  align="end"
                  onClose={() => setProjectMenuOpen(false)}
                  items={[
                    {
                      label: t("projects.editProject"),
                      icon: <Pencil size={14} strokeWidth={2} />,
                      onClick: () => {
                        setProjectMenuOpen(false);
                        void onCustomize();
                      },
                    },
                    {
                      label: t("projects.delete"),
                      icon: <Trash2 size={14} strokeWidth={2} />,
                      onClick: () => {
                        setProjectMenuOpen(false);
                        void onDeleteProject();
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

              <MainInput
                key={composerResetKey}
                chatParams={chatParams}
                aiTutor={level <= 2}
                enhanceOnly={level === 3}
                mono={mono}
                isEmpty
                placeholder={placeholder}
                disabled={isLaunchingPrompt}
                externalPrompt={externalPrompt}
                onExternalPromptConsumed={onExternalPromptConsumed}
                sendOverride={async (text) => {
                  await onLaunchPrompt(text);
                }}
                onAppendToSystem={onAppendToSystem}
                onVariableNamesChange={onVariableNamesChange}
              />
            </div>

            {/* Tabs — fills remaining height, inner content scrolls */}
            <div className="mt-4 min-h-0 flex-1 flex flex-col">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "chats" | "sources")} variant="vercel" className="flex min-h-0 flex-1 flex-col">
                <TabsList className="shrink-0">
                  <TabsTrigger value="chats">{t("projects.tabChats")}</TabsTrigger>
                  <TabsTrigger value="sources">{t("projects.tabSources")}</TabsTrigger>
                </TabsList>
                <TabsContent value="chats" className="mt-4 min-h-0 flex-1 flex flex-col">
                  {chats.length === 0 ? (
                    <EmptyState.Root
                      title={t("projects.noChatsYet")}
                      description={t("projects.noChatsHint")}
                      icon={
                        <EmptyState.Icon>
                          <MessageSquare size={20} strokeWidth={1.5} />
                        </EmptyState.Icon>
                      }
                    />
                  ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      <div className="space-y-0.5">
                        {chats.map((chat) => (
                          <ChatListItem
                            key={chat.id}
                            chat={chat}
                            locale={language === "uk" ? "uk-UA" : "en-US"}
                            showProject={false}
                            variant="minimal"
                            onSelect={() => void onOpenChat(chat.id)}
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
                </TabsContent>
                <TabsContent value="sources" className="mt-4 min-h-0 flex-1 flex flex-col">
                  <ProjectSources projectId={project.id} />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </div>

      <ConfigSidebar config={sidebarConfig} />

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
        projects={projects}
        currentProjectId={assignTarget?.project_id ?? null}
        chatTitle={assignTarget?.title ?? ""}
        onAssign={async (projectId) => {
          if (!assignTarget) return;
          await assignChatToProject(assignTarget.id, projectId);
        }}
      />
    </div>
  );
}
