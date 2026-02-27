"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { useChatStore } from "@/lib/store/chatStore";
import { ChatInputBox } from "@/components/chat/ChatInputBox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { TEMPLATES, CATEGORY_LABELS } from "@/lib/templates";
import { API_URL } from "@/lib/config";
import { resolveVariables } from "@/lib/api";

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
  /** Callback to append text to the system message (L3 only) */
  onAppendToSystem?: (text: string) => void;
}

/* ── AI Tutor Modal ─────────────────────────────────────────────── */
function TutorModal({
  open, onOpenChange, isRefining,
  originalPrompt, improvedPrompt, clarifyingQuestions,
  onSendOriginal, onSendImproved, onCancel,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; isRefining: boolean;
  originalPrompt: string; improvedPrompt: string; clarifyingQuestions: string[];
  onSendOriginal: () => void; onSendImproved: () => void; onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} onCancel={onCancel}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(123,147,255,0.14)" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgb(163,178,255)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>
            <div>
              <DialogTitle>Покращимо ваш запит</DialogTitle>
              <DialogDescription>ШІ-тьютор допомагає зробити промпт точнішим</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="px-5 py-4 space-y-4">
          {isRefining ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <div className="flex items-center gap-1.5">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="h-2 w-2 rounded-full" style={{ background: "rgb(123,147,255)", animation: `pulse-dot 1.2s ${d}ms infinite` }} />
                ))}
              </div>
              <p className="text-[13px]" style={{ color: "rgb(var(--text-2))" }}>Аналізую запит...</p>
            </div>
          ) : (
            <>
              {clarifyingQuestions.length > 0 && (
                <div>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider font-mono" style={{ color: "rgb(var(--text-3))" }}>
                    Уточнення для кращої відповіді
                  </p>
                  <ul className="space-y-2">
                    {clarifyingQuestions.map((q, i) => (
                      <li key={i} className="flex items-start gap-3 rounded-xl px-4 py-3"
                        style={{ background: "rgb(var(--surface-2))", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold font-mono"
                          style={{ background: "rgba(123,147,255,0.15)", color: "rgb(163,178,255)" }}>{i + 1}</span>
                        <span className="text-[13px] leading-relaxed" style={{ color: "rgb(var(--text-1))" }}>{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {improvedPrompt && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider font-mono" style={{ color: "rgb(var(--text-3))" }}>
                    Покращений промпт
                  </p>
                  <div className="relative rounded-xl px-4 py-3.5"
                    style={{ background: "rgba(123,147,255,0.07)", border: "1px solid rgba(123,147,255,0.22)" }}>
                    <div className="absolute left-0 top-0 h-full w-0.5 rounded-l-xl" style={{ background: "rgba(123,147,255,0.5)" }} />
                    <p className="pl-2 text-[13px] leading-relaxed" style={{ color: "rgb(var(--text-1))" }}>{improvedPrompt}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        {!isRefining && (
          <DialogFooter>
            <div className="flex items-center justify-between gap-2">
              <button onClick={onCancel} className="btn-ghost rounded-lg px-3 py-1.5 text-[12px]">Скасувати</button>
              <div className="flex gap-2">
                <button onClick={onSendOriginal} className="rounded-lg px-3 py-1.5 text-[12px] transition-colors"
                  style={{ border: "1px solid rgba(255,255,255,0.1)", color: "rgb(var(--text-2))" }}>
                  Надіслати оригінал
                </button>
                <button onClick={onSendImproved} disabled={!improvedPrompt}
                  className="btn-primary flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px]">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Надіслати покращений
                </button>
              </div>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Fixed dropdown ─────────────────────────────────────────────── */
function DropdownMenu({ anchorEl, onClose, children, minWidth = 220 }: {
  anchorEl: HTMLElement | null; onClose: () => void; children: React.ReactNode; minWidth?: number;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!anchorEl) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) onClose();
    };
    const tid = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => { clearTimeout(tid); document.removeEventListener("mousedown", handler); };
  }, [anchorEl, onClose]);

  if (!anchorEl) return null;
  const rect = anchorEl.getBoundingClientRect();
  return (
    <div ref={menuRef} style={{
      position: "fixed",
      bottom: window.innerHeight - rect.top + 8,
      left: Math.min(rect.left, window.innerWidth - minWidth - 8),
      zIndex: 9999, minWidth, borderRadius: 14, padding: "6px",
      boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
      background: "rgb(var(--surface-3))", border: "1px solid rgba(255,255,255,0.12)",
    }}>
      {children}
    </div>
  );
}

function MenuBtn({ onClick, children, column = false }: { onClick: () => void; children: React.ReactNode; column?: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button type="button" onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", flexDirection: column ? "column" : "row",
        alignItems: column ? "flex-start" : "center", gap: column ? 3 : 8,
        width: "100%", borderRadius: 9, padding: column ? "8px 10px" : "7px 10px",
        fontSize: 12, color: "rgb(var(--text-2))",
        background: hovered ? "rgba(255,255,255,0.06)" : "transparent",
        border: "none", cursor: "pointer", textAlign: "left", transition: "background 0.1s",
      }}>
      {children}
    </button>
  );
}

/* ── L1 chips ───────────────────────────────────────────────────── */
function L1Chips({ input, setInput, onSendSuggestion }: {
  input: string; setInput: (v: string) => void; onSendSuggestion: (text: string) => void;
}) {
  const [activeMenu, setActiveMenu] = useState<"role" | "tone" | "templates" | null>(null);
  const roleRef      = useRef<HTMLButtonElement>(null);
  const toneRef      = useRef<HTMLButtonElement>(null);
  const templatesRef = useRef<HTMLButtonElement>(null);

  const getAnchor = () => {
    if (activeMenu === "role")      return roleRef.current;
    if (activeMenu === "tone")      return toneRef.current;
    if (activeMenu === "templates") return templatesRef.current;
    return null;
  };

  const applyPrefix = (prefix: string) => { setInput(input.trim() ? `${prefix}${input}` : prefix); setActiveMenu(null); };
  const applySuffix = (suffix: string) => { setInput(input.trim() ? `${input}${suffix}` : suffix.trimStart()); setActiveMenu(null); };

  const chip: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.09)", color: "rgb(var(--text-2))", background: "rgba(255,255,255,0.03)" };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button ref={roleRef} type="button" onClick={() => setActiveMenu((p) => p === "role" ? null : "role")}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition-all"
          style={{ ...chip, background: activeMenu === "role" ? "rgba(255,255,255,0.06)" : chip.background }}>
          <span>🎭</span> Роль
        </button>
        <button ref={toneRef} type="button" onClick={() => setActiveMenu((p) => p === "tone" ? null : "tone")}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition-all"
          style={{ ...chip, background: activeMenu === "tone" ? "rgba(255,255,255,0.06)" : chip.background }}>
          <span>🎯</span> Тон
        </button>
        <button ref={templatesRef} type="button" onClick={() => setActiveMenu((p) => p === "templates" ? null : "templates")}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition-all"
          style={{ ...chip, background: activeMenu === "templates" ? "rgba(255,255,255,0.06)" : chip.background }}>
          <span>📋</span> Шаблони
        </button>
        {[
          { label: "Як працює ChatGPT?", text: "Як працює ChatGPT?" },
          { label: "Що таке prompt engineering?", text: "Що таке prompt engineering?" },
        ].map((s) => (
          <button key={s.label} type="button" onClick={() => onSendSuggestion(s.text)}
            className="rounded-full px-3.5 py-1.5 text-[12px] transition-all hover:bg-white/5" style={chip}>
            {s.label}
          </button>
        ))}
      </div>

      {activeMenu === "role" && (
        <DropdownMenu anchorEl={getAnchor()} onClose={() => setActiveMenu(null)} minWidth={220}>
          {[
            { label: "👨‍🏫 Вчитель",   value: "Поясни як досвідчений вчитель: " },
            { label: "👨‍💻 Розробник", value: "Як senior розробник, напиши: " },
            { label: "🔬 Науковець",  value: "З наукової точки зору поясни: " },
            { label: "✍️ Письменник", value: "Як досвідчений автор, створи: " },
          ].map((o) => <MenuBtn key={o.label} onClick={() => applyPrefix(o.value)}>{o.label}</MenuBtn>)}
        </DropdownMenu>
      )}
      {activeMenu === "tone" && (
        <DropdownMenu anchorEl={getAnchor()} onClose={() => setActiveMenu(null)} minWidth={240}>
          {[
            { label: "🎓 Формальний", value: " Відповідай формально." },
            { label: "😊 Простий",    value: " Поясни простими словами." },
            { label: "⚡ Короткий",   value: " Максимум 3 речення." },
            { label: "📝 Детальний",  value: " Дай розгорнуту відповідь з прикладами." },
          ].map((o) => <MenuBtn key={o.label} onClick={() => applySuffix(o.value)}>{o.label}</MenuBtn>)}
        </DropdownMenu>
      )}
      {activeMenu === "templates" && (
        <DropdownMenu anchorEl={getAnchor()} onClose={() => setActiveMenu(null)} minWidth={280}>
          {TEMPLATES.filter((t) => t.level === 1 && (t.category === "learning" || t.category === "code")).map((tpl) => (
            <MenuBtn key={tpl.id} column onClick={() => { setInput(tpl.prompt); setActiveMenu(null); }}>
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-medium" style={{ color: "rgb(var(--text-1))" }}>{tpl.title}</span>
                <span className="rounded px-1 py-0.5 font-mono text-[9px]"
                  style={{ background: "rgba(255,255,255,0.05)", color: "rgb(var(--text-3))" }}>
                  {CATEGORY_LABELS[tpl.category]}
                </span>
              </div>
              <span className="text-[11px]" style={{ color: "rgb(var(--text-3))" }}>{tpl.description}</span>
            </MenuBtn>
          ))}
        </DropdownMenu>
      )}
    </>
  );
}

/* ── L3 Prompt Strategy Chips (CoT + Step-Back) ─────────────────── */
function L3StrategyChips({
  onInjectCoT,
  onInjectStepBack,
}: {
  onInjectCoT: () => void;
  onInjectStepBack: () => void;
}) {
  const [cotActive,  setCotActive]  = useState(false);
  const [sbActive,   setSbActive]   = useState(false);

  const handleCoT = () => {
    onInjectCoT();
    setCotActive(true);
    setTimeout(() => setCotActive(false), 2000);
  };

  const handleStepBack = () => {
    onInjectStepBack();
    setSbActive(true);
    setTimeout(() => setSbActive(false), 2000);
  };

  const baseChip: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.09)",
    color: "rgb(var(--text-2))",
    background: "rgba(255,255,255,0.03)",
    transition: "all 0.15s",
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleCoT}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px]"
        style={{
          ...baseChip,
          ...(cotActive ? { background: "rgba(123,147,255,0.15)", borderColor: "rgba(123,147,255,0.35)", color: "rgb(163,178,255)" } : {}),
        }}
        title="Додати Chain-of-Thought до System Message"
      >
        <span className="font-mono text-[11px] font-bold" style={{ color: cotActive ? "rgb(163,178,255)" : "rgb(var(--text-3))" }}>+</span>
        <span>CoT</span>
      </button>

      <button
        type="button"
        onClick={handleStepBack}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px]"
        style={{
          ...baseChip,
          ...(sbActive ? { background: "rgba(52,211,153,0.12)", borderColor: "rgba(52,211,153,0.30)", color: "rgb(52,211,153)" } : {}),
        }}
        title="Додати Step-Back prompting до початку промпту"
      >
        <span className="font-mono text-[11px] font-bold" style={{ color: sbActive ? "rgb(52,211,153)" : "rgb(var(--text-3))" }}>+</span>
        <span>Step-Back</span>
      </button>

      <span className="font-mono text-[10px] select-none" style={{ color: "rgb(var(--text-3))", opacity: 0.5 }}>
        {cotActive ? "✓ CoT додано до system prompt" : sbActive ? "✓ Step-Back додано до промпту" : ""}
      </span>
    </div>
  );
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
      return false; // API error — caller decides what to do
    } catch {
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

  // ── "✨ Покращити" button visibility ────────────────────────────
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