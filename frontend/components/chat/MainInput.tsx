"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { Sparkles } from "lucide-react";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { useChatStore } from "@/lib/store/chatStore";
import { ChatInputBox } from "@/components/chat/ChatInputBox";
import { extractVarNames } from "@/components/chat/extractVarNames";
import { REQUEST_TIMEOUT_MS } from "@/lib/config";
import { resolveVariables } from "@/lib/api";
import { readResponseError } from "@/lib/request";
import { toast } from "sonner";
import { TutorModal } from "./input/TutorModal";
import { L1Chips } from "./input/L1Chips";
import { L3StrategyChips } from "./input/L3StrategyChips";
import { useTranslation } from "@/lib/store/i18nStore";
import { Button } from "@/components/ui/button";

const MIN_WORDS = 5;
const VARIABLE_SYNC_DEBOUNCE_MS = 120;

interface ChatParams {
  model: string;
  temperature: number;
  max_tokens: number;
  top_p?: number;
  system_message?: string;
  variables?: Record<string, string>;
  compareModel?: string;
  modelLabel?: string;
  compareModelLabel?: string;
  selfConsistencyEnabled?: boolean;
}

export interface MainInputProps {
  chatParams: ChatParams;
  aiTutor?: boolean;
  mono?: boolean;
  placeholder?: string;
  disabled?: boolean;
  statusBar?: React.ReactNode;
  topSlot?: React.ReactNode;
  externalPrompt?: string | null;
  onExternalPromptConsumed?: () => void;
  sendOverride?: (text: string) => Promise<void>;
  onRawResponse?: (raw: Record<string, unknown>) => void;
  onAppendToSystem?: (text: string) => void;
  onVariableNamesChange?: (names: string[]) => void;
  isEmpty?: boolean;
}

/* Main component */
export function MainInput({
  chatParams,
  aiTutor = false, mono = false, placeholder,
  disabled: externalDisabled = false,
  statusBar, topSlot,
  externalPrompt, onExternalPromptConsumed,
  sendOverride, onRawResponse,
  onAppendToSystem,
  onVariableNamesChange,
  isEmpty = false,
}: MainInputProps) {
  const isMountedRef = useRef(true);
  const { t } = useTranslation();
  const { data: session } = useSession();
  const level = useUserLevelStore((s) => s.level);

  const [isRefining, setIsRefining] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [originalPrompt, setOriginalPrompt] = useState("");
  const [improvedPrompt, setImprovedPrompt] = useState("");
  const [clarifyingQuestions, setClarifyingQuestions] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const refineAbortRef = useRef<AbortController | null>(null);
  const refineRequestIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      refineAbortRef.current?.abort();
      refineAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (externalPrompt) {
      setDraft(externalPrompt);
      onExternalPromptConsumed?.();
    }
  }, [externalPrompt, onExternalPromptConsumed]);

  useEffect(() => {
    if (!onVariableNamesChange) return;
    const tid = window.setTimeout(() => {
      onVariableNamesChange(extractVarNames(draft));
    }, VARIABLE_SYNC_DEBOUNCE_MS);
    return () => window.clearTimeout(tid);
  }, [draft, onVariableNamesChange]);

  const { analyzePrompt, trackSuggestionClick, trackCancelAction } = useUserLevelStore();
  const { isSending, sendMessage } = useChatStore();
  const userEmail = session?.user?.email ?? "anonymous";

  const lastKeystrokeTimeRef = useRef<number | null>(null);
  const activeTypingDurationMsRef = useRef<number>(0);
  const typingCharsRef = useRef<number>(0);

  const _dispatch = useCallback(async (text: string) => {
    setDraft("");
    onVariableNamesChange?.([]);
    setModalOpen(false);

    const finalPrompt = chatParams.variables
      ? resolveVariables(text, chatParams.variables)
      : text;

    const elapsedSeconds = Math.max(activeTypingDurationMsRef.current / 1000, 0.1);
    const cps = typingCharsRef.current > 0 ? typingCharsRef.current / elapsedSeconds : 0;

    try {
      const result = await sendMessage(finalPrompt, {
        userEmail,
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
      if (result) {
        analyzePrompt(finalPrompt, cps);
        if (onRawResponse && result.metadata) {
          onRawResponse(result.metadata as Record<string, unknown>);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      lastKeystrokeTimeRef.current = null;
      activeTypingDurationMsRef.current = 0;
      typingCharsRef.current = 0;
    }
  }, [sendMessage, analyzePrompt, userEmail, chatParams, onRawResponse, onVariableNamesChange]);

  const _callRefine = useCallback(async (text: string): Promise<boolean> => {
    refineAbortRef.current?.abort();
    const requestId = refineRequestIdRef.current + 1;
    refineRequestIdRef.current = requestId;
    const controller = new AbortController();
    refineAbortRef.current = controller;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    setOriginalPrompt(text);
    setIsRefining(true);
    setImprovedPrompt("");
    setClarifyingQuestions([]);
    setModalOpen(false);

    try {
      const res = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(await readResponseError(res, t("input.enhanceError")));
      }

      const data = await res.json();
      if (
        !isMountedRef.current ||
        requestId !== refineRequestIdRef.current ||
        controller.signal.aborted
      ) {
        return false;
      }

      setImprovedPrompt(data.improved_prompt ?? text);
      setClarifyingQuestions(data.clarifying_questions ?? []);
      setModalOpen(true);
      return true;
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      const isStale = requestId !== refineRequestIdRef.current;
      if (isAbort && (isStale || !timedOut)) {
        return false;
      }

      toast.error(
        timedOut
          ? t("input.enhanceError")
          : error instanceof Error && error.message
            ? error.message
            : t("input.enhanceError"),
      );
      return false;
    } finally {
      window.clearTimeout(timeoutId);
      if (refineAbortRef.current === controller) {
        refineAbortRef.current = null;
      }
      if (isMountedRef.current && requestId === refineRequestIdRef.current) {
        setIsRefining(false);
      }
    }
  }, [t]);

  const handleSend = useCallback(async (text?: string) => {
    const trimmed = (text ?? draft).trim();
    if (!trimmed || isSending || isRefining || externalDisabled) return;

    if (sendOverride) {
      setDraft("");
      onVariableNamesChange?.([]);
      await sendOverride(trimmed);
      return;
    }

    if (aiTutor && !text) {
      const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
      if (wordCount < MIN_WORDS) {
        const opened = await _callRefine(trimmed);
        if (!opened && isMountedRef.current) {
          await _dispatch(trimmed);
        }
        return;
      }
    }

    await _dispatch(trimmed);
  }, [draft, isSending, isRefining, externalDisabled, sendOverride, aiTutor, _callRefine, _dispatch, onVariableNamesChange]);

  const handleManualRefine = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || isSending || isRefining || externalDisabled) return;

    await _callRefine(trimmed);
  }, [draft, isSending, isRefining, externalDisabled, _callRefine]);

  const handleCoT = useCallback(() => {
    onAppendToSystem?.(t("input.strategy.cot"));
  }, [onAppendToSystem, t]);

  const handleStepBack = useCallback(() => {
    const prefix = t("input.strategy.stepBack");
    setDraft((prev) => (prev.startsWith(prefix) ? prev : prefix + prev));
  }, [t]);

  const isDisabled = isRefining || isSending || externalDisabled;
  const showEnhance = (level === 1 || level === 2) && draft.trim().length >= 2 && !isRefining;
  const showStatusBar = !!statusBar;

  const resolvedPlaceholder = placeholder ?? (mono ? t("placeholder.mono") : t("placeholder.default"));

  const enhanceButton = showEnhance ? (
    <Button
      variant="chip"
      size="sm"
      shape="rounded"
      onClick={handleManualRefine}
      disabled={isDisabled}
      leftIcon={
        isRefining ? (
          <span className="flex items-center gap-0.5">
            {[0, 150, 300].map((d) => (
              <span key={d} className="h-1 w-1 rounded-full bg-[var(--ds-gray-900)]"
                style={{ animation: `pulse-dot 1.2s ${d}ms infinite` }} />
            ))}
          </span>
        ) : (
          <Sparkles size={13} strokeWidth={2} />
        )
      }
    >
      {isRefining ? t("input.analyzing") : t("input.enhance")}
    </Button>
  ) : null;

  return (
    <>
      {aiTutor && (
        <TutorModal
          open={modalOpen}
          onOpenChange={(v) => !isRefining && setModalOpen(v)}
          isRefining={isRefining}
          originalPrompt={originalPrompt}
          improvedPrompt={improvedPrompt}
          clarifyingQuestions={clarifyingQuestions}
          onSendOriginal={() => _dispatch(originalPrompt)}
          onSendImproved={() => _dispatch(improvedPrompt || originalPrompt)}
          onCancel={() => { trackCancelAction(); setModalOpen(false); }}
        />
      )}

      <ChatInputBox
        value={draft}
        onChange={(v) => {
          const now = Date.now();
          if (lastKeystrokeTimeRef.current !== null) {
            const delta = now - lastKeystrokeTimeRef.current;
            if (delta < 3000) activeTypingDurationMsRef.current += delta;
          }
          lastKeystrokeTimeRef.current = now;
          typingCharsRef.current++;
          setDraft(v);
        }}
        onSend={() => handleSend()}
        placeholder={resolvedPlaceholder}
        disabled={isDisabled}
        mono={mono}
        topSlot={topSlot}
        bottomSlot={
          <div>
            {/* Chips area — fixed height in empty state to prevent layout shift between levels */}
            {isEmpty && (
              <div className="min-h-[36px] flex flex-wrap items-center justify-center gap-2 mt-1">
                {enhanceButton}
                {level === 1 && (
                  <L1Chips
                    input={draft}
                    setInput={setDraft}
                    onSendSuggestion={(text) => { trackSuggestionClick(); handleSend(text); }}
                  />
                )}
                {level === 3 && onAppendToSystem && (
                  <L3StrategyChips
                    onInjectCoT={handleCoT}
                    onInjectStepBack={handleStepBack}
                  />
                )}
              </div>
            )}

            {/* Enhance — floating mode (not empty state) */}
            {!isEmpty && enhanceButton && (
              <div className="flex items-center justify-start gap-2 mt-1 animate-fade-in">
                {enhanceButton}
              </div>
            )}

            {/* Status bar — visible for L2/L3, hidden in empty state */}
            {showStatusBar && !isEmpty && statusBar}
          </div>
        }
      />
    </>
  );
}