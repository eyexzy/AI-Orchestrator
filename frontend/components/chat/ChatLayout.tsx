"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import { AssignChatProjectModal } from "@/components/modals/AssignChatProjectModal";
import { useProjectStore } from "@/lib/store/projectStore";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { useModelsStore } from "@/lib/store/modelsStore";
import { useChatStore } from "@/lib/store/chatStore";
import { resolveVariables } from "@/lib/api";
import {
  readGenerationPreferences,
  writeGenerationPreferences,
  type GenerationPreferences,
} from "@/lib/generationPreferences";
import { extractVarNames } from "@/components/chat/extractVarNames";
import { MessageList } from "@/components/chat/MessageList";
import { MainInput } from "@/components/chat/MainInput";
import { ConfigSidebar, type SidebarConfig, type FewShotExample } from "@/components/chat/ConfigSidebar";
import { getDefaultSystem } from "@/components/chat/sidebar/config";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useTranslation } from "@/lib/store/i18nStore";

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

const CHAT_TOP_OVERLAY_FADE_HEIGHT = 20;
const CHAT_TOP_OVERLAY_FALLBACK_HEIGHT = 74;
const CHAT_INPUT_WIDTH_CLASS = "max-w-[46rem]";

export function ChatLayout({ header }: { header?: ReactNode }) {
  const { t } = useTranslation();
  const level = useUserLevelStore((s) => s.level);
  const attachFilesRef = useRef<((files: FileList) => void) | null>(null);
  const userEmail = useUserLevelStore((s) => s.userEmail);
  const projects = useProjectStore((s) => s.projects);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const activeChat = useChatStore((s) => s.chats.find((c) => c.id === s.activeChatId));
  const assignChatToProject = useChatStore((s) => s.assignChatToProject);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const trackAdvancedFeature = useUserLevelStore((s) => s.trackAdvancedFeature);
  const models = useModelsStore((s) => s.models);
  const messages = useChatStore((s) => s.messages);
  const isSending = useChatStore((s) => s.isSending);
  const messagesError = useChatStore((s) => s.messagesError);
  const setComposerSendOpts = useChatStore((s) => s.setComposerSendOpts);
  const chatIsEmpty = messages.length === 0 && !isSending && !messagesError;

  const [inputWrapperHeight, setInputWrapperHeight] = useState(220);
  const roRef = useRef<ResizeObserver | null>(null);
  const topOverlayRoRef = useRef<ResizeObserver | null>(null);
  const [topOverlayOffset, setTopOverlayOffset] = useState(0);
  const inputWrapperRef = useCallback((node: HTMLDivElement | null) => {
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    if (node) {
      roRef.current = new ResizeObserver(([entry]) => {
        setInputWrapperHeight(entry.contentRect.height + 48);
      });
      roRef.current.observe(node);
    }
  }, []);
  const topOverlayRef = useCallback((node: HTMLDivElement | null) => {
    if (topOverlayRoRef.current) {
      topOverlayRoRef.current.disconnect();
      topOverlayRoRef.current = null;
    }

    if (!node) {
      setTopOverlayOffset(0);
      return;
    }

    const updateOffset = (height: number) => {
      setTopOverlayOffset(Math.ceil(height) + CHAT_TOP_OVERLAY_FADE_HEIGHT);
    };

    updateOffset(node.getBoundingClientRect().height);
    topOverlayRoRef.current = new ResizeObserver(([entry]) => {
      updateOffset(entry.contentRect.height);
    });
    topOverlayRoRef.current.observe(node);
  }, []);

  // ChatLayout does NOT handle drop itself — ChatInputBox handles it directly.
  // We only preventDefault on dragover so the browser doesn't open the file.

  const handleManageProject = useCallback(() => {
    setProjectModalOpen(true);
  }, []);

  const defaultModel = useMemo(() => {
    const available = models.filter((m) => m.available);
    const gemini = available.find((m) => m.value === "gemini-2.0-flash");
    return gemini?.value ?? available[0]?.value ?? "gemini-2.0-flash";
  }, [models]);

  const secondModel = useMemo(
    () => resolveSecondaryModel(models, defaultModel),
    [defaultModel, models],
  );

  const storedGenerationPreferencesRef = useRef<GenerationPreferences>({});

  // SSR-safe defaults — must match exactly between server and client initial
  // render to avoid React hydration errors. useLayoutEffect below restores
  // persisted values before the browser paints (no visible flash).
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
  const [mobileConfigOpen, setMobileConfigOpen] = useState(false);
  const [templatePrompt, setTemplatePrompt] = useState<string | null>(null);
  const [inputVariableNames, setInputVariableNames] = useState<string[]>([]);
  const prevVarCountRef = useRef(0);
  const prefsHydratedRef = useRef(false);

  // Restore persisted preferences before the browser paints. useLayoutEffect
  // is client-only so server HTML and client initial tree both use the same
  // SSR-safe defaults above — no hydration mismatch. The layout effect fires
  // synchronously before paint so the user never sees the defaults.
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

  // Sync model selection when models load from backend — validate that the
  // stored model is still available; fall back to defaultModel if not.
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

  // Persist preferences immediately whenever they change — no longer gated on
  // models initialization so changes made before models load are never lost.
  useEffect(() => {
    const storedPreferences = storedGenerationPreferencesRef.current;
    // When level < 3, the level-gate effect clears L3 state in memory.
    // Preserve the stored L3 values so they survive a level demotion + refresh.
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
    model,
    temperature,
    topP,
    maxTokens,
    level,
    system,
    variables,
    compareEnabled,
    compareModelA,
    compareModelB,
    rawJsonEnabled,
    selfConsistencyEnabled,
    fewShotExamples,
    userEmail,
  ]);

  const handleInputVariableNamesChange = useCallback((names: string[]) => {
    setInputVariableNames((prev) => (sameNames(prev, names) ? prev : names));
  }, []);

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

  useEffect(() => {
    if (level < 3) {
      setVariables({});
      setInputVariableNames([]);
      setCompareEnabled(false);
      setRawJsonEnabled(false);
      setSelfConsistencyEnabled(false);
    }
  }, [level]);

  const handleSetCompare = useCallback((value: boolean) => {
    setCompareEnabled(value);
    if (value) setSelfConsistencyEnabled(false);
  }, []);

  const handleSetSelfConsistency = useCallback((value: boolean) => {
    setSelfConsistencyEnabled(value);
    if (value) setCompareEnabled(false);
  }, []);

  const handleLoadTemplate = useCallback((prompt: string, vars: Record<string, string>, sys?: string) => {
    setTemplatePrompt(prompt);
    if (Object.keys(vars).length > 0) setVariables(vars);
    if (sys !== undefined) setSystem(sys);
  }, []);

  const handleAppendToSystem = useCallback((text: string) => {
    setSystem((prev) => (prev.includes(text) ? prev : prev ? `${prev}\n\n${text}` : text));
  }, []);

  const isCompareMode = compareEnabled && level === 3;
  const isSelfConsistency = selfConsistencyEnabled && level === 3;
  const mono = level === 3;

  const resolvedSystem = useMemo(() => {
    if (level < 3) return undefined;

    let nextSystem = resolveVariables(system, variables);
    if (fewShotExamples.length === 0) return nextSystem;

    const fewShotBlock = fewShotExamples
      .filter((example) => example.input.trim() || example.output.trim())
      .map((example) => `User: ${example.input}\nAssistant: ${example.output}`)
      .join("\n\n");

    if (fewShotBlock) {
      nextSystem = `${nextSystem}\n\nExamples:\n${fewShotBlock}`;
    }

    return nextSystem;
  }, [fewShotExamples, level, system, variables]);

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
    handleLoadTemplate,
    handleSetCompare,
    handleSetSelfConsistency,
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


  const chatEmptyHint = useMemo(() => (
    level === 1 ? "" :
      level === 2 ? t("chat.emptyConstructor") :
        isCompareMode
          ? t("chat.emptyCompare")
          : isSelfConsistency
            ? t("chat.emptyCheck3x")
            : `${t("chat.emptyEngineer")}<br/><span style='opacity:.6'>${t("chat.supportsVars")}</span>`
  ), [isCompareMode, isSelfConsistency, level, t]);

  const placeholder = useMemo(() => (
    isCompareMode
      ? t("placeholder.compare")
      : isSelfConsistency
        ? t("placeholder.check3x")
        : mono
          ? t("placeholder.mono")
          : t("placeholder.default")
  ), [isCompareMode, isSelfConsistency, mono, t]);

  const inputBlock = (
    <MainInput
      chatParams={chatParams}
      aiTutor={level <= 2}
      enhanceOnly={level === 3}
      mono={mono}
      isEmpty={chatIsEmpty}
      placeholder={placeholder}

      externalPrompt={templatePrompt}
      onExternalPromptConsumed={() => setTemplatePrompt(null)}
      onAppendToSystem={level === 3 ? handleAppendToSystem : undefined}
      onVariableNamesChange={level === 3 ? handleInputVariableNamesChange : undefined}
      attachFilesRef={attachFilesRef}
      inProject={Boolean(activeChat?.project_id)}
      onManageProject={handleManageProject}
    />
  );

  useEffect(() => {
    setComposerSendOpts({
      userEmail: userEmail ?? "anonymous",
      model: chatParams.model,
      temperature: chatParams.temperature,
      max_tokens: chatParams.max_tokens,
      top_p: chatParams.top_p,
      system_message: chatParams.system_message,
      compareModel: chatParams.compareModel,
      modelLabel: chatParams.modelLabel,
      compareModelLabel: chatParams.compareModelLabel,
      selfConsistencyEnabled: chatParams.selfConsistencyEnabled,
      projectId: activeChat?.project_id ?? null,
      stream: true,
      forceNewChat: false,
    });

    return () => {
      setComposerSendOpts(null);
    };
  }, [chatParams, setComposerSendOpts, userEmail, activeChat?.project_id]);

  return (
    <div
      className="flex h-full min-h-0 overflow-hidden"
      style={{ width: "100%" }}
    >
      {/* Project assignment modal */}
      <AssignChatProjectModal
        open={projectModalOpen}
        onOpenChange={setProjectModalOpen}
        projects={projects}
        currentProjectId={activeChat?.project_id ?? null}
        chatTitle={activeChat?.title ?? ""}
        onAssign={async (projectId) => {
          if (activeChatId) await assignChatToProject(activeChatId, projectId);
        }}
      />

      <div className="chat-main" style={{ minWidth: 0, flex: "1 1 0" }}>
        {chatIsEmpty ? (
          <div className="flex h-full flex-col items-center justify-center px-6">
            <h1 className="-mt-12 mb-4 text-center text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
              {t("chat.greeting")}
            </h1>
            <div className={`w-full ${CHAT_INPUT_WIDTH_CLASS}`}>
              {inputBlock}
            </div>
          </div>
        ) : (
          <div className="chat-body">
            {header && (
              <div ref={topOverlayRef} className="chat-top-overlay">
                {header}
              </div>
            )}
            <MessageList
              showRaw={rawJsonEnabled}
              emptyHint={chatEmptyHint}
              floatingInputOffset={inputWrapperHeight}
              topOverlayOffset={header ? topOverlayOffset || CHAT_TOP_OVERLAY_FALLBACK_HEIGHT : 0}
            />
            <div className="fade-out-gradient" />
            <div ref={inputWrapperRef} className="floating-input-wrapper">
              <div className={`mx-auto w-full ${CHAT_INPUT_WIDTH_CLASS} px-6`}>
                {inputBlock}
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfigSidebar config={sidebarConfig} />

      <Sheet open={mobileConfigOpen} onOpenChange={setMobileConfigOpen}>
        <SheetContent side="right" className="w-[320px] p-0">
          <SheetHeader className="px-4 pb-2 pt-4">
            <SheetTitle className="text-[15px]">{t("config.mobileTitle")}</SheetTitle>
            <SheetDescription className="text-xs">{t("config.mobileDescription")}</SheetDescription>
          </SheetHeader>
          <ConfigSidebar config={sidebarConfig} forceVisible />
        </SheetContent>
      </Sheet>
    </div>
  );
}
