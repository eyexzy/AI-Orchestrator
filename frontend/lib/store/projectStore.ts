import { create } from "zustand";
import { actionToast } from "@/components/ui/action-toast";
import { PROJECTS_CACHE_STORAGE_KEY, PROJECTS_CACHE_TTL_MS } from "@/lib/config";
import { makeScopedStorageKey, readPersistedState, writePersistedState } from "@/lib/persistedState";
import { getErrorMessage, readResponseError } from "@/lib/request";
import { getTranslation } from "@/lib/store/i18nStore";
import { useUserLevelStore } from "@/lib/store/userLevelStore";

export interface Project {
  id: string;
  name: string;
  description: string;
  accent_color: string;
  icon_name: string;
  starter_prompt: string;
  system_hint: string;
  is_favorite: boolean;
  chat_count: number;
  source_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface ProjectSource {
  id: string;
  project_id: string;
  file_id: string;
  title: string | null;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string | null;
  thumbnail_data?: string | null;
}

interface ProjectState {
  projects: Project[];
  isLoadingProjects: boolean;
  projectsError: string | null;
  loadProjects: (force?: boolean) => Promise<void>;
  createProject: (payload: ProjectDraft) => Promise<Project | null>;
  updateProject: (
    id: string,
    payload: Partial<ProjectDraft>,
    options?: { silentSuccess?: boolean },
  ) => Promise<Project | null>;
  deleteProject: (id: string) => Promise<void>;
}

export interface ProjectDraft {
  name: string;
  description?: string;
  accent_color?: string;
  icon_name?: string;
  starter_prompt?: string;
  system_hint?: string;
  is_favorite?: boolean;
}

let projectsInflight: Promise<void> | null = null;
let projectsInflightScopeKey: string | null = null;
type PersistedProjectsCache = {
  projects: Project[];
  fetchedAt: number;
};

function getProjectsCacheKey(userEmail?: string | null): string {
  return makeScopedStorageKey(PROJECTS_CACHE_STORAGE_KEY, userEmail);
}

function readPersistedProjectsCache(userEmail?: string | null): PersistedProjectsCache | null {
  const persisted = readPersistedState<PersistedProjectsCache>(getProjectsCacheKey(userEmail));
  if (!persisted || !Array.isArray(persisted.projects) || typeof persisted.fetchedAt !== "number") {
    return null;
  }
  return persisted;
}

function writePersistedProjectsCache(data: PersistedProjectsCache, userEmail?: string | null): void {
  writePersistedState(getProjectsCacheKey(userEmail), data);
}

let projectsLastFetchedAt = 0;

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  isLoadingProjects: false,
  projectsError: null,

  loadProjects: async (force = false) => {
    const { isLoadingProjects, projects } = get();
    const userEmail = useUserLevelStore.getState().userEmail;
    const scopeKey = getProjectsCacheKey(userEmail);
    const hasFreshCache =
      (projects.length > 0 || projectsLastFetchedAt > 0) &&
      Date.now() - projectsLastFetchedAt < PROJECTS_CACHE_TTL_MS;

    if ((!force && hasFreshCache) || isLoadingProjects) return;
    if (projectsInflight && projectsInflightScopeKey === scopeKey) return projectsInflight;

    const shouldShowLoading = projects.length === 0;
    set({ isLoadingProjects: shouldShowLoading, projectsError: null });
    projectsInflightScopeKey = scopeKey;
    projectsInflight = (async () => {
      try {
        const res = await fetch("/api/projects", { cache: "no-store" });
        if (!res.ok) {
          throw new Error(await readResponseError(res, "Failed to load projects"));
        }
        const data: unknown = await res.json();
        const nextProjects = Array.isArray(data) ? (data as Project[]) : [];
        writePersistedProjectsCache({
          projects: nextProjects,
          fetchedAt: Date.now(),
        }, userEmail);
        const isCurrentScope =
          getProjectsCacheKey(useUserLevelStore.getState().userEmail) === scopeKey;
        if (!isCurrentScope) {
          return;
        }
        projectsLastFetchedAt = Date.now();
        set({
          projects: nextProjects,
          projectsError: null,
        });
      } catch (error) {
        const isCurrentScope =
          getProjectsCacheKey(useUserLevelStore.getState().userEmail) === scopeKey;
        if (!isCurrentScope) {
          return;
        }
        set({ projectsError: getErrorMessage(error, "Failed to load projects") });
      } finally {
        projectsInflight = null;
        projectsInflightScopeKey = null;
        set({ isLoadingProjects: false });
      }
    })();

    return projectsInflight;
  },

  createProject: async (draft) => {
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          description: draft.description ?? "",
          accent_color: draft.accent_color ?? "blue",
          icon_name: draft.icon_name ?? "folder",
          system_hint: draft.system_hint ?? "",
        }),
      });
      if (!res.ok) {
        throw new Error(await readResponseError(res, "Failed to create project"));
      }
      const project: Project = await res.json();
      projectsLastFetchedAt = Date.now();
      const nextProjects = [project, ...get().projects.filter((item) => item.id !== project.id)];
      writePersistedProjectsCache(
        { projects: nextProjects, fetchedAt: projectsLastFetchedAt },
        useUserLevelStore.getState().userEmail,
      );
      set({ projects: nextProjects });
      actionToast.success(getTranslation("projects.createSuccess"));
      return project;
    } catch (error) {
      actionToast.error(getErrorMessage(error, "Failed to create project"));
      return null;
    }
  },

  updateProject: async (id, payload, options) => {
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await readResponseError(res, "Failed to update project"));
      }
      const project: Project = await res.json();
      projectsLastFetchedAt = Date.now();
      const nextProjects = get().projects.map((item) => (item.id === id ? project : item));
      writePersistedProjectsCache(
        { projects: nextProjects, fetchedAt: projectsLastFetchedAt },
        useUserLevelStore.getState().userEmail,
      );
      set({ projects: nextProjects });
      const isFavoriteToggleOnly =
        Object.keys(payload).length === 1 && typeof payload.is_favorite === "boolean";
      if (isFavoriteToggleOnly) {
        actionToast.info(
          getTranslation(
            payload.is_favorite
              ? "toast.addedToFavorites"
              : "toast.removedFromFavorites",
          ),
        );
      } else if (!options?.silentSuccess) {
        actionToast.saved(getTranslation("projects.updateSuccess"));
      }
      return project;
    } catch (error) {
      actionToast.error(getErrorMessage(error, "Failed to update project"));
      return null;
    }
  },

  deleteProject: async (id) => {
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(await readResponseError(res, "Failed to delete project"));
      }
      projectsLastFetchedAt = Date.now();
      const nextProjects = get().projects.filter((project) => project.id !== id);
      writePersistedProjectsCache(
        { projects: nextProjects, fetchedAt: projectsLastFetchedAt },
        useUserLevelStore.getState().userEmail,
      );
      set({ projects: nextProjects });
      actionToast.deleted(getTranslation("projects.deleteSuccess"));
    } catch (error) {
      actionToast.error(getErrorMessage(error, "Failed to delete project"));
    }
  },
}));

export function hydrateProjectStoreFromPersistence(userEmail?: string | null): void {
  const persistedProjectsCache = readPersistedProjectsCache(userEmail);
  projectsLastFetchedAt = persistedProjectsCache?.fetchedAt ?? 0;
  useProjectStore.setState({ projects: persistedProjectsCache?.projects ?? [] });
}
