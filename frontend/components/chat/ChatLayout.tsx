"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Settings2 } from "lucide-react";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { useModelsStore } from "@/lib/store/modelsStore";
import { useChatStore } from "@/lib/store/chatStore";
import { resolveVariables } from "@/lib/api";
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

export function ChatLayout() {
  const { t } = useTranslation();
  const level = useUserLevelStore((s) => s.level);
  const trackAdvancedFeature = useUserLevelStore((s) => s.trackAdvancedFeature);
  const models = useModelsStore((s) => s.models);
  const messages = useChatStore((s) => s.messages);
  const isSending = useChatStore((s) => s.isSending);
  const chatIsEmpty = messages.length === 0 && !isSending;

  const [inputWrapperHeight, setInputWrapperHeight] = useState(220);
  const roRef = useRef<ResizeObserver | null>(null);
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

  const [model, setModel] = useState("llama-3.3-70b");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [system, setSystem] = useState(() => getDefaultSystem());
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [showTpl, setShowTpl] = useState(false);
  const [topP, setTopP] = useState(1.0);
  const [fewShotExamples, setFewShotExamples] = useState<FewShotExample[]>([]);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareModelA, setCompareModelA] = useState("llama-3.3-70b");
  const [compareModelB, setCompareModelB] = useState("gemini-2.0-flash");
  const [rawJsonEnabled, setRawJsonEnabled] = useState(false);
  const [selfConsistencyEnabled, setSelfConsistencyEnabled] = useState(false);
  const [mobileConfigOpen, setMobileConfigOpen] = useState(false);
  const [templatePrompt, setTemplatePrompt] = useState<string | null>(null);
  const [inputVariableNames, setInputVariableNames] = useState<string[]>([]);
  const prevVarCountRef = useRef(0);

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

  const statusBar = useMemo(() => {
    if (level < 2) return undefined;

    return (
      <div className="flex h-5 items-center gap-2 px-1 font-mono text-xs text-ds-text-tertiary whitespace-nowrap overflow-hidden">
        <button
          type="button"
          onClick={() => setMobileConfigOpen(true)}
          className="flex items-center justify-center rounded-md p-1 text-ds-text-tertiary transition-colors hover:bg-gray-alpha-200 md:hidden"
          aria-label="Open configuration"
        >
          <Settings2 size={14} strokeWidth={2} />
        </button>
        {isCompareMode ? (
          <>
            <span className="text-blue-700">{models.find((option) => option.value === compareModelA)?.label ?? compareModelA}</span>
            <span className="opacity-40">vs</span>
            <span className="text-green-700">{models.find((option) => option.value === compareModelB)?.label ?? compareModelB}</span>
            <span className="rounded bg-blue-700/[0.15] px-1.5 text-[11px] leading-[20px] font-bold text-blue-700">Compare</span>
          </>
        ) : isSelfConsistency ? (
          <>
            <span>{models.find((option) => option.value === model)?.label ?? model}</span>
            <span className="rounded bg-amber-700/[0.15] px-1.5 text-[11px] leading-[20px] font-bold text-amber-700">{t("config.check3x")}</span>
          </>
        ) : (
          <span>{models.find((option) => option.value === model)?.label ?? model}</span>
        )}
        <span>&middot;</span>
        <span>t={temperature.toFixed(2)}</span>
        {level === 3 && (
          <>
            <span>&middot;</span>
            <span>p={topP.toFixed(2)}</span>
          </>
        )}
        <span>&middot;</span>
        <span>{maxTokens} tok</span>
        {level === 3 && Object.keys(variables).length > 0 && (
          <>
            <span>&middot;</span>
            <span>{Object.keys(variables).length} vars</span>
          </>
        )}
        {level === 3 && fewShotExamples.length > 0 && (
          <>
            <span>&middot;</span>
            <span>{fewShotExamples.length} examples</span>
          </>
        )}
      </div>
    );
  }, [
    compareModelA,
    compareModelB,
    fewShotExamples.length,
    isCompareMode,
    isSelfConsistency,
    level,
    maxTokens,
    model,
    models,
    t,
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
      mono={mono}
      isEmpty={chatIsEmpty}
      placeholder={placeholder}
      statusBar={statusBar}
      externalPrompt={templatePrompt}
      onExternalPromptConsumed={() => setTemplatePrompt(null)}
      onAppendToSystem={level === 3 ? handleAppendToSystem : undefined}
      onVariableNamesChange={level === 3 ? handleInputVariableNamesChange : undefined}
    />
  );

  return (
    <div className="flex h-full min-h-0 overflow-hidden" style={{ width: "100%" }}>
      <div className="chat-main" style={{ minWidth: 0, flex: "1 1 0" }}>
        {chatIsEmpty ? (
          <div className="flex h-full flex-col items-center justify-center px-6">
            <h1 className="-mt-12 mb-4 text-center text-[32px] font-semibold tracking-tight text-foreground leading-tight">
              {t("chat.greeting")}
            </h1>
            <div className="w-full max-w-3xl">
              {inputBlock}
            </div>
          </div>
        ) : (
          <div className="chat-body">
            <MessageList
              showRaw={rawJsonEnabled}
              emptyHint={chatEmptyHint}
              floatingInputOffset={inputWrapperHeight}
            />
            <div className="fade-out-gradient" />
            <div ref={inputWrapperRef} className="floating-input-wrapper">
              <div className="mx-auto w-full max-w-3xl px-6">
                {inputBlock}
                <p className="mt-1.5 text-center text-[11px] select-none text-[var(--ds-gray-600)]">
                  {t("chat.enterHint")}
                </p>
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