"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { ProjectWorkspaceView } from "@/components/projects/ProjectWorkspaceView";
import { ProjectModal } from "@/components/modals/ProjectModal";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { type SidebarConfig, type FewShotExample, getDefaultSystem } from "@/components/chat/ConfigSidebar";
import { extractVarNames } from "@/components/chat/extractVarNames";
import { resolveVariables } from "@/lib/api";
import {
  readGenerationPreferences,
  writeGenerationPreferences,
  type GenerationPreferences,
} from "@/lib/generationPreferences";
import { useTranslation } from "@/lib/store/i18nStore";
import { dedupeChatSessions, useChatStore } from "@/lib/store/chatStore";
import { useModelsStore } from "@/lib/store/modelsStore";
import { useProjectStore } from "@/lib/store/projectStore";
import { useUserLevelStore } from "@/lib/store/userLevelStore";

function ProjectDetailSkeleton({
  backLabel,
  inputPlaceholder,
}: {
  backLabel: string;
  inputPlaceholder: string;
}) {
  return (
    <div className="flex h-full min-h-0 gap-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-5 pt-6 [scrollbar-gutter:stable]">
          <div className="mb-5 inline-flex h-8 items-center text-[15px] font-medium text-ds-text">
            {backLabel}
          </div>

          <div className="mx-auto flex w-full max-w-3xl flex-col">
            <div className="shrink-0">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <Skeleton width={36} height={36} className="rounded-lg" />
                    <div className="min-w-0 flex-1 py-2">
                      <Skeleton height={28} width="42%" />
                    </div>
                  </div>
                  <div className="mt-1 pl-[60px]">
                    <Skeleton height={16} width="56%" />
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <div className="h-8 w-8 rounded-md bg-gray-alpha-100 shadow-[0_0_0_1px_var(--ds-gray-alpha-300)]" />
                  <div className="h-8 w-8 rounded-md bg-gray-alpha-100 shadow-[0_0_0_1px_var(--ds-gray-alpha-300)]" />
                </div>
              </div>

              <div className="rounded-2xl border border-gray-alpha-200 bg-background-100 px-5 py-4">
                <div className="min-h-[148px] rounded-xl border border-gray-alpha-200 bg-background px-4 py-4 text-[15px] text-ds-text-tertiary">
                  {inputPlaceholder}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-col">
              <div className="flex items-center gap-5 border-b border-gray-alpha-200 pb-2 text-[15px] font-medium">
                <span className="text-ds-text">Chats</span>
                <span className="text-ds-text-tertiary">Sources</span>
              </div>

              <div className="mt-4 space-y-0.5 px-1 -mx-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[minmax(0,1fr)_36px] items-center gap-4 rounded-xl px-4 py-3"
                  >
                    <div className="space-y-2">
                      <Skeleton height={18} width={`${48 + (i % 3) * 14}%`} />
                      <Skeleton height={14} width={i % 2 === 0 ? 104 : 124} />
                    </div>
                    <div className="h-8 w-8 rounded-md bg-gray-alpha-100 shadow-[0_0_0_1px_var(--ds-gray-alpha-300)]" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden w-[320px] shrink-0 border-l border-gray-alpha-200 bg-background-100 xl:block" />
    </div>
  );
}

function sameNames(a: string[], b: string[]) {
  return a.length === b.length && a.every((name, index) => name === b[index]);
}

function resolvePreferredModel(
  preferredModel: string | undefined,
  models: Array<{ value: string; available: boolean }>,
  fallbackModel: string,
) {
  if (
    preferredModel &&
    models.some((model) => model.available && model.value === preferredModel)
  ) {
    return preferredModel;
  }
  return fallbackModel;
}

function resolveSecondaryModel(
  models: Array<{ value: string; available: boolean }>,
  primaryModel: string,
) {
  const available = models.filter((model) => model.available);
  const alternative = available.find((model) => model.value !== primaryModel);
  return alternative?.value ?? primaryModel;
}

export default function ProjectDetailPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = typeof params?.id === "string" ? params.id : "";
  const userEmail = useUserLevelStore((s) => s.userEmail);
  const level = useUserLevelStore((s) => s.level);
  const profileLoaded = useUserLevelStore((s) => s.profileLoaded);
  const trackAdvancedFeature = useUserLevelStore((s) => s.trackAdvancedFeature);
  const models = useModelsStore((s) => s.models);
  const {
    projects,
    isLoadingProjects,
    projectsError,
    loadProjects,
    updateProject,
    deleteProject,
  } = useProjectStore(
    useShallow((state) => ({
      projects: state.projects,
      isLoadingProjects: state.isLoadingProjects,
      projectsError: state.projectsError,
      loadProjects: state.loadProjects,
      updateProject: state.updateProject,
      deleteProject: state.deleteProject,
    })),
  );
  const {
    chats,
    isLoadingChats,
    chatListError,
    loadChats,
    selectChat,
    sendMessage,
  } = useChatStore(
    useShallow((state) => ({
      chats: state.chats,
      isLoadingChats: state.isLoadingChats,
      chatListError: state.chatListError,
      loadChats: state.loadChats,
      selectChat: state.selectChat,
      sendMessage: state.sendMessage,
    })),
  );

  const defaultModel = useMemo(() => {
    const available = models.filter((item) => item.available);
    const gemini = available.find((item) => item.value === "gemini-2.0-flash");
    return gemini?.value ?? available[0]?.value ?? "gemini-2.0-flash";
  }, [models]);

  const secondModel = useMemo(
    () => resolveSecondaryModel(models, defaultModel),
    [defaultModel, models],
  );
  const storedGenerationPreferencesRef = useRef<GenerationPreferences>({});

  const [editOpen, setEditOpen] = useState(false);
  const [isLaunchingPrompt, setIsLaunchingPrompt] = useState(false);
  const [composerResetKey, setComposerResetKey] = useState(0);
  const [model, setModel] = useState(defaultModel);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [system, setSystem] = useState(() => getDefaultSystem());
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [showTpl, setShowTpl] = useState(false);
  const [topP, setTopP] = useState(1.0);
  const [fewShotExamples, setFewShotExamples] = useState<FewShotExample[]>([]);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareModelA, setCompareModelA] = useState(defaultModel);
  const [compareModelB, setCompareModelB] = useState(secondModel);
  const [rawJsonEnabled, setRawJsonEnabled] = useState(false);
  const [selfConsistencyEnabled, setSelfConsistencyEnabled] = useState(false);
  const [templatePrompt, setTemplatePrompt] = useState<string | null>(null);
  const [inputVariableNames, setInputVariableNames] = useState<string[]>([]);
  const prevVarCountRef = useRef(0);
  const prefsHydratedRef = useRef(false);

  useEffect(() => {
    if (!profileLoaded) return;
    if (level === 1) {
      router.replace("/chat");
    }
  }, [level, profileLoaded, router]);

  useLayoutEffect(() => {
    if (prefsHydratedRef.current) return;
    prefsHydratedRef.current = true;
    const storeEmail = useUserLevelStore.getState().userEmail;
    const storedPreferences = readGenerationPreferences(storeEmail || userEmail);
    storedGenerationPreferencesRef.current = storedPreferences;
    if (storedPreferences.model !== undefined) setModel(storedPreferences.model);
    if (storedPreferences.temperature !== undefined) setTemperature(storedPreferences.temperature);
    if (storedPreferences.topP !== undefined) setTopP(storedPreferences.topP);
    if (storedPreferences.maxTokens !== undefined) setMaxTokens(storedPreferences.maxTokens);
    if (storedPreferences.system !== undefined) setSystem(storedPreferences.system);
    if (storedPreferences.variables !== undefined) setVariables(storedPreferences.variables);
    if (storedPreferences.compareEnabled !== undefined) setCompareEnabled(storedPreferences.compareEnabled);
    if (storedPreferences.compareModelA !== undefined) setCompareModelA(storedPreferences.compareModelA);
    if (storedPreferences.compareModelB !== undefined) setCompareModelB(storedPreferences.compareModelB);
    if (storedPreferences.rawJsonEnabled !== undefined) setRawJsonEnabled(storedPreferences.rawJsonEnabled);
    if (storedPreferences.selfConsistencyEnabled !== undefined) setSelfConsistencyEnabled(storedPreferences.selfConsistencyEnabled);
    if (storedPreferences.fewShotExamples !== undefined) setFewShotExamples(storedPreferences.fewShotExamples);
  }, [userEmail]);

  const modelsInitialized = useRef(false);
  useEffect(() => {
    if (modelsInitialized.current || models.length === 0) {
      return;
    }

    modelsInitialized.current = true;
    const storedPreferences = storedGenerationPreferencesRef.current;

    const preferredModel = resolvePreferredModel(
      storedPreferences.model,
      models,
      defaultModel,
    );
    const preferredCompareModelA = resolvePreferredModel(
      storedPreferences.compareModelA ?? storedPreferences.model,
      models,
      preferredModel,
    );
    const preferredCompareModelB = resolvePreferredModel(
      storedPreferences.compareModelB,
      models,
      resolveSecondaryModel(models, preferredCompareModelA),
    );

    setModel(preferredModel);
    setCompareModelA(preferredCompareModelA);
    setCompareModelB(
      preferredCompareModelB === preferredCompareModelA
        ? resolveSecondaryModel(models, preferredCompareModelA)
        : preferredCompareModelB,
    );
  }, [defaultModel, models]);

  useEffect(() => {
    const storedPreferences = storedGenerationPreferencesRef.current;

    const l3Fields = level === 3
      ? {
          system,
          variables,
          compareEnabled,
          compareModelA,
          compareModelB,
          rawJsonEnabled,
          selfConsistencyEnabled,
          fewShotExamples,
        }
      : {
          system: storedPreferences.system,
          variables: storedPreferences.variables,
          compareEnabled: storedPreferences.compareEnabled,
          compareModelA: storedPreferences.compareModelA,
          compareModelB: storedPreferences.compareModelB,
          rawJsonEnabled: storedPreferences.rawJsonEnabled,
          selfConsistencyEnabled: storedPreferences.selfConsistencyEnabled,
          fewShotExamples: storedPreferences.fewShotExamples,
        };

    const nextPreferences: GenerationPreferences = {
      model,
      temperature,
      topP,
      maxTokens,
      ...l3Fields,
    };
    writeGenerationPreferences(nextPreferences, userEmail);
    storedGenerationPreferencesRef.current = nextPreferences;
  }, [
    compareEnabled,
    compareModelA,
    compareModelB,
    fewShotExamples,
    level,
    maxTokens,
    model,
    rawJsonEnabled,
    selfConsistencyEnabled,
    system,
    temperature,
    topP,
    userEmail,
    variables,
  ]);

  useEffect(() => {
    if (!profileLoaded || !userEmail || level === 1) return;
    if (projects.length === 0) {
      void loadProjects();
    }
  }, [level, loadProjects, profileLoaded, projects.length, userEmail]);

  useEffect(() => {
    if (level < 3) {
      setVariables({});
      setInputVariableNames([]);
      setCompareEnabled(false);
      setRawJsonEnabled(false);
      setSelfConsistencyEnabled(false);
    }
  }, [level]);

  const systemVariableNames = useMemo(
    () => (level === 3 ? extractVarNames(system) : []),
    [level, system],
  );

  const mergedVariableNames = useMemo(() => {
    if (level < 3) return [];
    return Array.from(new Set([...inputVariableNames, ...systemVariableNames]));
  }, [inputVariableNames, level, systemVariableNames]);

  useEffect(() => {
    if (level < 3) return;
    if (mergedVariableNames.length > prevVarCountRef.current) {
      trackAdvancedFeature("variable");
    }
    prevVarCountRef.current = mergedVariableNames.length;

    setVariables((prev) => {
      const next: Record<string, string> = {};
      let changed = false;

      for (const name of mergedVariableNames) {
        next[name] = prev[name] ?? "";
        if (!(name in prev)) changed = true;
      }

      for (const key of Object.keys(prev)) {
        if (!(key in next)) changed = true;
      }

      return changed ? next : prev;
    });
  }, [level, mergedVariableNames, trackAdvancedFeature]);

  const visibleChats = useMemo(() => dedupeChatSessions(chats), [chats]);
  const project = projects.find((item) => item.id === projectId) ?? null;
  const projectChats = useMemo(
    () =>
      visibleChats
        .filter((chat) => chat.project_id === projectId)
        .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? "")),
    [projectId, visibleChats],
  );

  const projectLoadError = projectsError;

  const handleInputVariableNamesChange = (names: string[]) => {
    setInputVariableNames((prev) => (sameNames(prev, names) ? prev : names));
  };

  const handleSetCompare = (value: boolean) => {
    setCompareEnabled(value);
    if (value) setSelfConsistencyEnabled(false);
  };

  const handleSetSelfConsistency = (value: boolean) => {
    setSelfConsistencyEnabled(value);
    if (value) setCompareEnabled(false);
  };

  const handleLoadTemplate = (
    prompt: string,
    vars: Record<string, string>,
    sys?: string,
  ) => {
    setTemplatePrompt(prompt);
    if (Object.keys(vars).length > 0) setVariables(vars);
    if (sys !== undefined) setSystem(sys);
  };

  const handleAppendToSystem = (text: string) => {
    setSystem((prev) => (prev.includes(text) ? prev : prev ? `${prev}\n\n${text}` : text));
  };

  const isCompareMode = compareEnabled && level === 3;
  const isSelfConsistency = selfConsistencyEnabled && level === 3;
  const mono = level === 3;

  const resolvedSystem = useMemo(() => {
    if (level < 3) return project?.system_hint || undefined;

    let nextSystem = resolveVariables(system, variables);
    if (project?.system_hint?.trim()) {
      nextSystem = [project.system_hint.trim(), nextSystem.trim()].filter(Boolean).join("\n\n");
    }
    if (fewShotExamples.length === 0) return nextSystem;

    const fewShotBlock = fewShotExamples
      .filter((example) => example.input.trim() || example.output.trim())
      .map((example) => `User: ${example.input}\nAssistant: ${example.output}`)
      .join("\n\n");

    if (fewShotBlock) {
      nextSystem = `${nextSystem}\n\nExamples:\n${fewShotBlock}`;
    }

    return nextSystem;
  }, [fewShotExamples, level, project?.system_hint, system, variables]);

  const chatParams = useMemo(() => ({
    model: isCompareMode ? compareModelA : model,
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
    system_message: resolvedSystem,
    variables,
    ...(isCompareMode && {
      compareModel: compareModelB,
      modelLabel: models.find((option) => option.value === compareModelA)?.label ?? compareModelA,
      compareModelLabel: models.find((option) => option.value === compareModelB)?.label ?? compareModelB,
    }),
    ...(isSelfConsistency && {
      selfConsistencyEnabled: true,
      modelLabel: models.find((option) => option.value === model)?.label ?? model,
    }),
  }), [
    compareModelA,
    compareModelB,
    isCompareMode,
    isSelfConsistency,
    maxTokens,
    model,
    models,
    resolvedSystem,
    temperature,
    topP,
    variables,
  ]);

  const sidebarConfig = useMemo<SidebarConfig>(() => ({
    model,
    setModel,
    temperature,
    setTemperature,
    maxTokens,
    setMaxTokens,
    ...(level >= 2 && {
      showTpl,
      setShowTpl,
      onLoadTemplate: handleLoadTemplate,
    }),
    ...(level === 3 && {
      system,
      setSystem,
      variables,
      setVariables,
      topP,
      setTopP,
      fewShotExamples,
      setFewShotExamples,
      compareEnabled,
      setCompareEnabled: handleSetCompare,
      compareModelA,
      setCompareModelA,
      compareModelB,
      setCompareModelB,
      rawJsonEnabled,
      setRawJsonEnabled,
      selfConsistencyEnabled,
      setSelfConsistencyEnabled: handleSetSelfConsistency,
    }),
  }), [
    compareEnabled,
    compareModelA,
    compareModelB,
    fewShotExamples,
    level,
    maxTokens,
    model,
    rawJsonEnabled,
    selfConsistencyEnabled,
    showTpl,
    system,
    temperature,
    topP,
    variables,
  ]);

  const placeholder = useMemo(() => (
    isCompareMode
      ? t("placeholder.compare")
      : isSelfConsistency
        ? t("placeholder.check3x")
        : mono
          ? t("placeholder.mono")
          : t("placeholder.default")
  ), [isCompareMode, isSelfConsistency, mono, t]);

  const openChat = async (chatId: string) => {
    router.push("/chat");
    await selectChat(chatId);
  };

  const handleNewChat = async () => {
    setComposerResetKey((value) => value + 1);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const launchPrompt = async (prompt: string) => {
    if (!project || !userEmail) return;
    setIsLaunchingPrompt(true);
    try {
      router.push("/chat");

      await sendMessage(prompt, {
        userEmail,
        projectId: project.id,
        forceNewChat: true,
        model: chatParams.model,
        temperature: chatParams.temperature,
        max_tokens: chatParams.max_tokens,
        top_p: chatParams.top_p,
        system_message: chatParams.system_message,
        compareModel: chatParams.compareModel,
        modelLabel: chatParams.modelLabel,
        compareModelLabel: chatParams.compareModelLabel,
        selfConsistencyEnabled: chatParams.selfConsistencyEnabled,
      });
    } finally {
      setIsLaunchingPrompt(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!project) return;
    await deleteProject(project.id);
    router.push("/projects");
  };

  if (!profileLoaded) {
    return (
      <ProjectDetailSkeleton
        backLabel={t("projects.backToProjects")}
        inputPlaceholder={t("placeholder.default")}
      />
    );
  }

  if (level === 1) {
    return null;
  }

  if (isLoadingProjects && !project) {
    return (
      <ProjectDetailSkeleton
        backLabel={t("projects.backToProjects")}
        inputPlaceholder={t("placeholder.default")}
      />
    );
  }

  if (projectLoadError && !project) {
    return (
      <div className="px-6 py-10">
        <ErrorState
          centered
          title={t("projects.loadErrorTitle")}
          description={projectLoadError}
          actionLabel={t("common.retry")}
          onAction={() => {
            if (!profileLoaded || !userEmail) return;
            void loadProjects();
            void loadChats(userEmail);
          }}
        />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="px-6 py-10">
        <ErrorState
          centered
          title={t("projects.workspaceNotFound")}
          description={t("projects.workspaceNotFoundDescription")}
          actionLabel={t("projects.backToProjects")}
          onAction={() => router.push("/projects")}
        />
      </div>
    );
  }

  return (
    <>
      <main className="flex-1 overflow-hidden">
        <ProjectWorkspaceView
          project={project}
          chats={projectChats}
          isLoadingChats={isLoadingChats}
          chatsError={chatListError}
          composerResetKey={composerResetKey}
          isLaunchingPrompt={isLaunchingPrompt}
          onBack={() => router.push("/projects")}
          onCustomize={() => setEditOpen(true)}
          onUpdateProjectIdentity={async (payload) => {
            await updateProject(project.id, payload, { silentSuccess: true });
          }}
          onDeleteProject={handleDeleteProject}
          onToggleProjectFavorite={() => void updateProject(project.id, { is_favorite: !project.is_favorite })}
          onOpenChat={openChat}
          onNewChat={handleNewChat}
          onLaunchPrompt={launchPrompt}
          chatParams={chatParams}
          sidebarConfig={sidebarConfig}
          externalPrompt={templatePrompt}
          onExternalPromptConsumed={() => setTemplatePrompt(null)}
          onAppendToSystem={level === 3 ? handleAppendToSystem : undefined}
          onVariableNamesChange={level === 3 ? handleInputVariableNamesChange : undefined}
          mono={mono}
          placeholder={placeholder}
        />
      </main>

      <ProjectModal
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        initialName={project.name}
        initialDescription={project.description}
        initialAccentColor={project.accent_color}
        initialIconName={project.icon_name}
        initialSystemHint={project.system_hint}
        onSave={async (payload) => {
          await updateProject(project.id, payload);
        }}
      />
    </>
  );
}
