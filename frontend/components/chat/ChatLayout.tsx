"use client";

import { useState, useEffect } from "react";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { resolveVariables } from "@/lib/api";
import { MessageList } from "@/components/chat/MessageList";
import { MainInput } from "@/components/chat/MainInput";
import {
  ConfigSidebar, DEFAULT_SYSTEM, MODELS, type SidebarConfig, type FewShotExample,
} from "@/components/chat/ConfigSidebar";

/* ── Variable autoparse regex ────────────────────────────────── */
const VAR_REGEX = /(?<!\\)\{\{([^{}]+)\}\}(?!\\)/g;

function extractVarNames(text: string): string[] {
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  VAR_REGEX.lastIndex = 0;
  while ((m = VAR_REGEX.exec(text)) !== null) {
    const name = m[1].trim();
    if (name) seen.add(name);
  }
  return Array.from(seen);
}

/* ── ChatLayout ───────────────────────────────────────────────── */
export function ChatLayout() {
  const level = useUserLevelStore((s) => s.level);

  /* Core config */
  const [model,       setModel]       = useState("llama-3.3-70b");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens,   setMaxTokens]   = useState(1024);
  const [system,      setSystem]      = useState(DEFAULT_SYSTEM);
  const [variables,   setVariables]   = useState<Record<string, string>>({});
  const [showTpl,     setShowTpl]     = useState(false);

  /* L3 advanced sampling params */
  const [topP, setTopP] = useState(1.0);
  const [topK, setTopK] = useState(40);

  /* L3 Few-Shot examples */
  const [fewShotExamples, setFewShotExamples] = useState<FewShotExample[]>([]);

  /* L3 mode toggles */
  const [compareEnabled,        setCompareEnabled]        = useState(false);
  const [compareModelA,         setCompareModelA]         = useState("llama-3.3-70b");
  const [compareModelB,         setCompareModelB]         = useState("gemini-2.0-flash");
  const [rawJsonEnabled,        setRawJsonEnabled]        = useState(false);
  const [selfConsistencyEnabled, setSelfConsistencyEnabled] = useState(false);

  /* Shared input */
  const [chatInput, setChatInput] = useState("");

  /* Template injection */
  const [templatePrompt, setTemplatePrompt] = useState<string | null>(null);

  /* Variable autoparse — bidirectional sync */
  useEffect(() => {
    if (level < 3) return;
    const allText = `${chatInput}\n${system}`;
    const foundNames = new Set(extractVarNames(allText));
    setVariables((prev) => {
      const next: Record<string, string> = {};
      let changed = false;
      for (const name of foundNames) {
        next[name] = prev[name] ?? "";
        if (!(name in prev)) changed = true;
      }
      for (const key of Object.keys(prev)) {
        if (!foundNames.has(key)) changed = true;
      }
      return changed ? next : prev;
    });
  }, [chatInput, system, level]);

  /* Reset on level drop */
  useEffect(() => {
    if (level < 3) {
      setVariables({});
      setCompareEnabled(false);
      setRawJsonEnabled(false);
      setSelfConsistencyEnabled(false);
    }
  }, [level]);

  /* Mutually exclusive: Compare and Self-Consistency */
  const handleSetCompare = (v: boolean) => {
    setCompareEnabled(v);
    if (v) setSelfConsistencyEnabled(false);
  };
  const handleSetSelfConsistency = (v: boolean) => {
    setSelfConsistencyEnabled(v);
    if (v) setCompareEnabled(false);
  };

  /* Build resolved system message — inject Few-Shot examples */
  let resolvedSystem = level >= 3 ? resolveVariables(system, variables) : undefined;
  if (resolvedSystem !== undefined && fewShotExamples.length > 0) {
    const fewShotBlock = fewShotExamples
      .filter((ex) => ex.input.trim() || ex.output.trim())
      .map((ex) => `User: ${ex.input}\nAssistant: ${ex.output}`)
      .join("\n\n");
    if (fewShotBlock) {
      resolvedSystem = `${resolvedSystem}\n\nExamples:\n${fewShotBlock}`;
    }
  }

  /* Sidebar config */
  const sidebarConfig: SidebarConfig = {
    model, setModel,
    temperature, setTemperature,
    maxTokens, setMaxTokens,
    ...(level >= 2 && {
      showTpl, setShowTpl,
      onLoadTemplate: (prompt: string, vars: Record<string, string>, sys?: string) => {
        setTemplatePrompt(prompt);
        if (Object.keys(vars).length > 0) setVariables(vars);
        if (sys !== undefined) setSystem(sys);
      },
    }),
    ...(level === 3 && {
      system, setSystem,
      variables, setVariables,
      topP, setTopP,
      topK, setTopK,
      fewShotExamples, setFewShotExamples,
      compareEnabled, setCompareEnabled: handleSetCompare,
      compareModelA,  setCompareModelA,
      compareModelB,  setCompareModelB,
      rawJsonEnabled, setRawJsonEnabled,
      selfConsistencyEnabled, setSelfConsistencyEnabled: handleSetSelfConsistency,
    }),
  };

  const isCompareMode       = compareEnabled && level === 3;
  const isSelfConsistency   = selfConsistencyEnabled && level === 3;

  const chatParams = {
    model: isCompareMode ? compareModelA : model,
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
    top_k: topK,
    system_message: resolvedSystem,
    variables,
    ...(isCompareMode && {
      compareModel:      compareModelB,
      modelLabel:        MODELS.find((o) => o.value === compareModelA)?.label ?? compareModelA,
      compareModelLabel: MODELS.find((o) => o.value === compareModelB)?.label ?? compareModelB,
    }),
    ...(isSelfConsistency && {
      selfConsistencyEnabled: true,
      modelLabel: MODELS.find((o) => o.value === model)?.label ?? model,
    }),
  };

  const mono = level === 3;

  const statusBar = level >= 2 ? (
    <div className="flex flex-wrap items-center gap-2 px-1 font-mono text-[11px]" style={{ color: "rgb(var(--text-3))" }}>
      {isCompareMode ? (
        <>
          <span style={{ color: "rgb(123,147,255)" }}>{MODELS.find((o) => o.value === compareModelA)?.label ?? compareModelA}</span>
          <span style={{ opacity: 0.4 }}>vs</span>
          <span style={{ color: "rgb(52,211,153)" }}>{MODELS.find((o) => o.value === compareModelB)?.label ?? compareModelB}</span>
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: "rgba(123,147,255,0.15)", color: "rgb(163,178,255)" }}>Compare</span>
        </>
      ) : isSelfConsistency ? (
        <>
          <span>{MODELS.find((o) => o.value === model)?.label ?? model}</span>
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: "rgba(251,191,36,0.15)", color: "rgb(251,197,68)" }}>Self-Consistency ×3</span>
        </>
      ) : (
        <span>{MODELS.find((o) => o.value === model)?.label ?? model}</span>
      )}
      <span>·</span>
      <span>t={temperature.toFixed(2)}</span>
      <span>·</span>
      <span>p={topP.toFixed(2)}</span>
      <span>·</span>
      <span>{maxTokens} tok</span>
      {level === 3 && Object.keys(variables).length > 0 && (
        <><span>·</span><span>{Object.keys(variables).length} vars</span></>
      )}
      {level === 3 && fewShotExamples.length > 0 && (
        <><span>·</span><span>{fewShotExamples.length} examples</span></>
      )}
    </div>
  ) : undefined;

  const chatEmptyHint =
    level === 1 ? "" :
    level === 2 ? "Constructor Mode — налаштуйте параметри та надішліть промпт" :
    isCompareMode
      ? "Compare Mode · Надішліть промпт — отримайте відповіді двох моделей одночасно"
      : isSelfConsistency
      ? "Self-Consistency Mode · Надішліть промпт — отримайте 3 незалежних відповіді"
      : "Engineer Mode · Enter надіслати · Shift+Enter новий рядок<br/><span style='opacity:.6'>Підтримуються {{змінні}}</span>";

  return (
    <div className="flex h-full min-h-0 overflow-hidden" style={{ width: "100%" }}>
      {/* Centre column */}
      <div className="chat-main" style={{ minWidth: 0, flex: "1 1 0" }}>
        <div className="chat-body">
          <MessageList
            showRaw={rawJsonEnabled}
            emptyHint={chatEmptyHint}
            floatingInputOffset={220}
          />
          <div className="fade-out-gradient" />
          <div className="floating-input-wrapper">
            <div className="mx-auto w-full max-w-3xl px-6">
              <MainInput
                value={chatInput}
                onChange={setChatInput}
                chatParams={chatParams}
                aiTutor={level === 1}
                mono={mono}
                placeholder={
                  isCompareMode
                    ? "Промпт для порівняння... Обидві моделі відповідять одночасно"
                    : isSelfConsistency
                    ? "Промпт для Self-Consistency... Три незалежних відповіді"
                    : mono
                    ? "Введіть промпт... Підтримуються {{змінні}}"
                    : "Напишіть повідомлення..."
                }
                statusBar={statusBar}
                externalPrompt={templatePrompt}
                onExternalPromptConsumed={() => setTemplatePrompt(null)}
                onAppendToSystem={level === 3
                  ? (text) => setSystem((prev) => prev.includes(text) ? prev : prev ? `${prev}\n\n${text}` : text)
                  : undefined
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* Config Sidebar */}
      <ConfigSidebar config={sidebarConfig} />
    </div>
  );
}