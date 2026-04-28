"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectModal } from "@/components/modals/ProjectModal";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PROJECTS_PAGE_UI_STATE_STORAGE_KEY } from "@/lib/config";
import { makeScopedStorageKey } from "@/lib/persistedState";
import { useTranslation } from "@/lib/store/i18nStore";
import { useProjectStore, type Project } from "@/lib/store/projectStore";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { usePersistentUiState } from "@/lib/usePersistentUiState";

type SortMode = "activity" | "name" | "chats";

interface ProjectsPageUiState {
  query: string;
  sortMode: SortMode;
}

const DEFAULT_PROJECTS_PAGE_UI_STATE: ProjectsPageUiState = {
  query: "",
  sortMode: "activity",
};

function isSortMode(value: unknown): value is SortMode {
  return value === "activity" || value === "name" || value === "chats";
}

function isProjectsPageUiState(value: unknown): value is ProjectsPageUiState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.query === "string" && isSortMode(candidate.sortMode);
}

function ControlSkeleton({ label }: { label: string }) {
  return (
    <div className="inline-flex h-10 items-center rounded-[6px] bg-background-100 px-3 text-[14px] text-ds-text-secondary shadow-[0_0_0_1px_var(--ds-gray-alpha-400)]">
      {label}
    </div>
  );
}

function ProjectsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex min-h-[168px] flex-col rounded-md bg-background-100 px-6 py-5 shadow-[0_0_0_1px_var(--ds-gray-alpha-400)] dark:shadow-[0_0_0_1px_#ffffff2b]"
        >
          <div className="flex min-h-[128px] flex-col justify-between gap-4">
            <div className="flex items-start justify-between gap-3">
              <Skeleton height={22} width="62%" />
              <Skeleton width={32} height={32} className="rounded-md" />
            </div>
            <Skeleton height={54} width="100%" className="rounded-lg" />
            <Skeleton height={14} width={112} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectsPageSkeleton({
  title,
  createLabel,
  searchPlaceholder,
  sortByLabel,
  sortLabel,
}: {
  title: string;
  createLabel: string;
  searchPlaceholder: string;
  sortByLabel: string;
  sortLabel: string;
}) {
  return (
    <div className="flex flex-col gap-6">
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
          {createLabel}
        </Button>
      </div>

      <div className="space-y-3">
        <Input
          variant="default"
          size="md"
          value=""
          readOnly
          placeholder={searchPlaceholder}
          leftIcon={<Search size={16} strokeWidth={2} className="text-ds-text-tertiary" />}
          className="bg-background-100"
        />
        <div className="flex items-center justify-end gap-3">
          <span className="text-[14px] text-ds-text-tertiary">{sortByLabel}</span>
          <ControlSkeleton label={sortLabel} />
        </div>
      </div>

      <div className="pr-1 pb-1">
        <ProjectsGridSkeleton />
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const level = useUserLevelStore((s) => s.level);
  const profileLoaded = useUserLevelStore((s) => s.profileLoaded);
  const userEmail = useUserLevelStore((s) => s.userEmail);
  const {
    projects,
    isLoadingProjects,
    projectsError,
    loadProjects,
    createProject,
    updateProject,
    deleteProject,
  } = useProjectStore(
    useShallow((state) => ({
      projects: state.projects,
      isLoadingProjects: state.isLoadingProjects,
      projectsError: state.projectsError,
      loadProjects: state.loadProjects,
      createProject: state.createProject,
      updateProject: state.updateProject,
      deleteProject: state.deleteProject,
    })),
  );

  const [pageUiState, setPageUiState] = usePersistentUiState<ProjectsPageUiState>(
    makeScopedStorageKey(PROJECTS_PAGE_UI_STATE_STORAGE_KEY, userEmail),
    DEFAULT_PROJECTS_PAGE_UI_STATE,
    { validate: isProjectsPageUiState },
  );
  const { query, sortMode } = pageUiState;
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Project | null>(null);

  useEffect(() => {
    if (!profileLoaded) return;
    if (level === 1) {
      router.replace("/chat");
      return;
    }
    if (!userEmail) return;
    void loadProjects();
  }, [level, loadProjects, profileLoaded, router, userEmail]);

  const sortedProjects = useMemo(() => {
    const next = [...projects];

    next.sort((a, b) => {
      if (sortMode === "name") {
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }

      if (sortMode === "chats") {
        if (b.chat_count !== a.chat_count) return b.chat_count - a.chat_count;
      }

      const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;

      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    return next;
  }, [projects, sortMode]);

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sortedProjects;
    return sortedProjects.filter((project) =>
      project.name.toLowerCase().includes(normalized)
      || project.description.toLowerCase().includes(normalized),
    );
  }, [query, sortedProjects]);

  if (!profileLoaded) {
    return (
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-col px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
          <ProjectsPageSkeleton
            title={t("nav.projects")}
            createLabel={t("projects.create")}
            searchPlaceholder={t("projects.searchPlaceholder")}
            sortByLabel={t("projects.sortBy")}
            sortLabel={t("projects.sortActivity")}
          />
        </div>
      </main>
    );
  }

  if (level === 1) {
    return null;
  }

  const handleDeleteProject = async (project: Project) => {
    await deleteProject(project.id);
  };

  return (
    <>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col overflow-hidden px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
          {isLoadingProjects ? (
            <ProjectsPageSkeleton
              title={t("nav.projects")}
              createLabel={t("projects.create")}
              searchPlaceholder={t("projects.searchPlaceholder")}
              sortByLabel={t("projects.sortBy")}
              sortLabel={t("projects.sortActivity")}
            />
          ) : (
            <div className="flex flex-1 min-h-0 flex-col gap-6">
              <div className="shrink-0 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-[28px] font-semibold text-ds-text sm:text-[32px]">
                  {t("nav.projects")}
                </h1>

                <Button
                  type="button"
                  variant="default"
                  size="md"
                  leftIcon={<Plus size={16} strokeWidth={2} />}
                  onClick={() => setCreateModalOpen(true)}
                  className="w-fit"
                >
                  {t("projects.create")}
                </Button>
              </div>

              <div className="shrink-0 space-y-3">
                <Input
                  variant="default"
                  size="md"
                  value={query}
                  onChange={(e) =>
                    setPageUiState((prev) => ({
                      ...prev,
                      query: e.target.value,
                    }))}
                  placeholder={t("projects.searchPlaceholder")}
                  leftIcon={<Search size={16} strokeWidth={2} className="text-ds-text-tertiary" />}
                  className="bg-background-100"
                />

                {projects.length > 1 && (
                  <div className="flex items-center justify-end gap-3">
                    <span className="text-[14px] text-ds-text-tertiary">{t("projects.sortBy")}</span>
                    <Select
                      size="sm"
                      align="end"
                      dropdownWidthMode="content"
                      dropdownMinWidth={184}
                      triggerWidthMode="content"
                      value={sortMode}
                      onValueChange={(value) =>
                        setPageUiState((prev) => ({
                          ...prev,
                          sortMode: value as SortMode,
                        }))}
                      options={[
                        { value: "activity", label: t("projects.sortActivity") },
                        { value: "name", label: t("projects.sortName") },
                        { value: "chats", label: t("projects.sortChats") },
                      ]}
                      className="bg-background-100"
                    />
                  </div>
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col">
                {projectsError ? (
                  <ErrorState
                    centered
                    title={t("projects.loadErrorTitle")}
                    description={projectsError}
                    actionLabel={t("common.retry")}
                    onAction={() => void loadProjects(true)}
                  />
                ) : projects.length === 0 ? (
                  <EmptyState.Panel
                    title={t("projects.emptyTitle")}
                    description={t("projects.emptyDescription")}
                    className="min-h-[420px]"
                  />
                ) : filteredProjects.length === 0 ? (
                  <EmptyState.Panel
                    title={t("projects.emptySearchTitle")}
                    description={t("projects.emptySearchDescription")}
                    className="min-h-[420px]"
                  />
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    <div className="grid gap-4 md:grid-cols-2">
                      {filteredProjects.map((project) => (
                        <ProjectCard
                          key={project.id}
                          project={project}
                          onOpen={() => router.push(`/projects/${project.id}`)}
                          onToggleFavorite={() =>
                            void updateProject(project.id, { is_favorite: !project.is_favorite })
                          }
                          onEdit={() => setEditTarget(project)}
                          onDelete={() => void handleDeleteProject(project)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <ProjectModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        mode="create"
        initialAccentColor="blue"
        initialIconName="folder"
        onSave={async (payload) => {
          const created = await createProject(payload);
          if (created) {
            router.push(`/projects/${created.id}`);
          }
        }}
      />

      <ProjectModal
        open={Boolean(editTarget)}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        mode="edit"
        initialName={editTarget?.name ?? ""}
        initialDescription={editTarget?.description ?? ""}
        initialAccentColor={editTarget?.accent_color ?? "blue"}
        initialIconName={editTarget?.icon_name ?? "folder"}
        initialSystemHint={editTarget?.system_hint ?? ""}
        onSave={async (payload) => {
          if (!editTarget) return;
          await updateProject(editTarget.id, payload);
        }}
      />
    </>
  );
}
