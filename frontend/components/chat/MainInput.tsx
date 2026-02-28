"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { useChatStore } from "@/lib/store/chatStore";
import { ChatInputBox } from "@/components/chat/ChatInputBox";
import { API_URL } from "@/lib/config";
import { resolveVariables } from "@/lib/api";
import { toast } from "sonner";
import { TutorModal } from "./input/TutorModal";
import { L1Chips } from "./input/L1Chips";
import { L3StrategyChips } from "./input/L3StrategyChips";

const MIN_WORDS = 5;

interface ChatParams {
  model: string;
  temperature: number;
  max_tokens: number;
  top_p?: number;
  top_k?: number;
  system_message?: string;
  variables?: Record<string, string>;
  compareModel?: string;
  modelLabel?: string;
  compareModelLabel?: string;
  selfConsistencyEnabled?: boolean;
}

export interface MainInputProps {
  value: string;
  onChange: (v: string) => void;
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
}

/* ── Main component ─────────────────────────────────────────────── */
export function MainInput({
  value, onChange, chatParams,
  aiTutor = false, mono = false, placeholder,
  disabled: externalDisabled = false,
  statusBar, topSlot,
  externalPrompt, onExternalPromptConsumed,
  sendOverride, onRawResponse,
  onAppendToSystem,
}: MainInputProps) {
  const isMountedRef = useRef(true);
  const { data: session } = useSession();
  const level = useUserLevelStore((s) => s.level);

  const [isRefining,          setIsRefining]         = useState(false);
  const [modalOpen,           setModalOpen]           = useState(false);
  const [originalPrompt,      setOriginalPrompt]      = useState("");
  const [improvedPrompt,      setImprovedPrompt]      = useState("");
  const [clarifyingQuestions, setClarifyingQuestions] = useState<string[]>([]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (externalPrompt) {
      onChange(externalPrompt);
      onExternalPromptConsumed?.();
    }
  }, [externalPrompt, onExternalPromptConsumed, onChange]);

  const { startTyping, recordKeystroke, analyzePrompt, trackSuggestionClick, trackCancelAction } = useUserLevelStore();
  const { isSending, sendMessage } = useChatStore();
  const userEmail = session?.user?.email ?? "anonymous";

  const _dispatch = useCallback(async (text: string) => {
    onChange("");
    setModalOpen(false);

    const finalPrompt = chatParams.variables
      ? resolveVariables(text, chatParams.variables)
      : text;

    try {
      const result = await sendMessage(finalPrompt, {
        userEmail,
        model:                     chatParams.model,
        temperature:               chatParams.temperature,
        max_tokens:                chatParams.max_tokens,
        top_p:                     chatParams.top_p,
        top_k:                     chatParams.top_k,
        system_message:            chatParams.system_message,
        compareModel:              chatParams.compareModel,
        modelLabel:                chatParams.modelLabel,
        compareModelLabel:         chatParams.compareModelLabel,
        selfConsistencyEnabled:    chatParams.selfConsistencyEnabled,
      });
      if (result) {
        analyzePrompt(finalPrompt);
        if (onRawResponse && result.metadata) {
          onRawResponse(result.metadata as Record<string, unknown>);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, [sendMessage, analyzePrompt, userEmail, chatParams, onChange, onRawResponse]);

  // ── Extracted refine logic (shared by auto-refine & manual button) ───
  const _callRefine = useCallback(async (text: string): Promise<boolean> => {
    setOriginalPrompt(text);
    setIsRefining(true);
    setImprovedPrompt("");
    setClarifyingQuestions([]);

    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${API_URL}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
        signal: controller.signal,
      });
      clearTimeout(tid);

      if (res.ok) {
        const data = await res.json();
        if (isMountedRef.current) {
          setImprovedPrompt(data.improved_prompt ?? text);
          setClarifyingQuestions(data.clarifying_questions ?? []);
          setModalOpen(true);
        }
        return true; // success — modal is open
      }
      toast.error("Не вдалося покращити промпт. Сервер недоступний.");
      return false; // API error — caller decides what to do
    } catch {
      toast.error("Не вдалося покращити промпт. Сервер недоступний.");
      return false; // network / timeout error
    } finally {
      if (isMountedRef.current) setIsRefining(false);
    }
  }, []);

  const handleSend = useCallback(async (text?: string) => {
    const trimmed = (text ?? value).trim();
    if (!trimmed || isSending || isRefining || externalDisabled) return;

    if (sendOverride) { onChange(""); await sendOverride(trimmed); return; }

    // Auto-refine for short prompts (< MIN_WORDS) when aiTutor is on
    if (aiTutor && !text) {
      const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
      if (wordCount < MIN_WORDS) {
        const opened = await _callRefine(trimmed);
        if (!opened && isMountedRef.current) {
          // Refine failed — send as-is
          await _dispatch(trimmed);
        }
        return;
      }
    }

    await _dispatch(trimmed);
  }, [value, isSending, isRefining, externalDisabled, sendOverride, aiTutor, _callRefine, _dispatch, onChange]);

  // ── Manual refine (triggered by "✨ Покращити" button) ──────────
  const handleManualRefine = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || isSending || isRefining || externalDisabled) return;

    const opened = await _callRefine(trimmed);
    if (!opened && isMountedRef.current) {
      // Refine failed — do nothing, user still has their text in the input
      // (no auto-dispatch on manual refine — let the user decide)
    }
  }, [value, isSending, isRefining, externalDisabled, _callRefine]);

  /* CoT injection — append to system message */
  const handleCoT = useCallback(() => {
    onAppendToSystem?.("Let's think step by step. Explain your reasoning.");
  }, [onAppendToSystem]);

  /* Step-Back injection — prepend to input */
  const handleStepBack = useCallback(() => {
    const prefix = "Identify the core abstract principles or laws underlying this request before answering. ";
    onChange(value.startsWith(prefix) ? value : prefix + value);
  }, [onChange, value]);

  const wordCount = value.trim().split(/\s+/).filter(Boolean).length;
  const isShort   = value.trim() && wordCount < MIN_WORDS;
  const isDisabled = isRefining || isSending || externalDisabled;

  // ── "Покращити" button visibility ────────────────────────────
  const showManualRefine = aiTutor && (level === 1 || level === 2) && value.trim().length >= 2;

  const resolvedPlaceholder = placeholder ?? (mono ? "Введіть промпт... Підтримуються {{змінні}}" : "Напишіть повідомлення...");

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
        value={value}
        onChange={(v) => {
          if (value.length === 0 && v.length > 0) startTyping();
          recordKeystroke();
          onChange(v);
        }}
        onSend={() => handleSend()}
        placeholder={resolvedPlaceholder}
        disabled={isDisabled}
        mono={mono}
        topSlot={topSlot}
        bottomSlot={
          <div>
            {aiTutor && isShort && !isRefining && (
              <p className="mb-2 text-center text-[11px]" style={{ color: "rgb(var(--text-3))" }}>
                Надішліть — ШІ-тьютор допоможе покращити запит
              </p>
            )}
            {aiTutor && isRefining && (
              <div className="mb-2 flex items-center justify-center gap-2">
                <div className="flex items-center gap-1">
                  {[0, 150, 300].map((d) => (
                    <span key={d} className="h-1.5 w-1.5 rounded-full"
                      style={{ background: "rgb(123,147,255)", animation: `pulse-dot 1.2s ${d}ms infinite` }} />
                  ))}
                </div>
                <p className="text-[12px]" style={{ color: "rgb(var(--text-3))" }}>Аналізую...</p>
              </div>
            )}

            {/* L3 Strategy Chips */}
            {level === 3 && onAppendToSystem && (
              <div className="mb-2">
                <L3StrategyChips
                  onInjectCoT={handleCoT}
                  onInjectStepBack={handleStepBack}
                />
              </div>
            )}

            {/* L1 Chips + Manual Refine button */}
            {aiTutor && (
              <div className="flex flex-wrap items-center gap-2">
                <L1Chips
                  input={value}
                  setInput={onChange}
                  onSendSuggestion={(text) => { trackSuggestionClick(); handleSend(text); }}
                />

                {showManualRefine && (
                  <button
                    type="button"
                    onClick={handleManualRefine}
                    disabled={isDisabled}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition-all"
                    style={{
                      border: "1px solid rgba(251,191,36,0.3)",
                      color: "rgb(251,197,68)",
                      background: "rgba(251,191,36,0.06)",
                      opacity: isDisabled ? 0.4 : 1,
                      cursor: isDisabled ? "not-allowed" : "pointer",
                    }}
                    title="ШІ-тьютор покращить ваш промпт"
                  >
                    <span> Покращити</span>
                  </button>
                )}
              </div>
            )}
            {statusBar}
          </div>
        }
      />
    </>
  );
}