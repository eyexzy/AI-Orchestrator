"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import {
  Copy,
  Check,
  RotateCcw,
  Pencil,
  X,
  Send,
} from "lucide-react";
import { useChatStore } from "@/lib/store/chatStore";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import type { CompareResult, SelfConsistencyRun } from "@/lib/store/chatStore";

interface MessageListProps {
  showRaw?: boolean;
  emptyHint?: string;
  floatingInputOffset?: number;
}

/* ─────────────────────────────────────────────────────────────────
 *  Accent palette
 * ────────────────────────────────────────────────────────────── */
const COMPARE_ACCENTS = ["123,147,255", "52,211,153"] as const;
const SC_ACCENTS      = ["123,147,255", "52,211,153", "251,191,36"] as const;
const COMPARE_LABELS  = ["A", "B"] as const;
const SC_RUN_LABELS   = ["Run 1", "Run 2", "Run 3"] as const;

/* ─────────────────────────────────────────────────────────────────
 *  Small helpers
 * ────────────────────────────────────────────────────────────── */
function MetaBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px]"
      style={{ background: "rgba(255,255,255,0.05)", color: "rgb(var(--text-3))" }}
    >
      <span style={{ opacity: 0.65 }}>{label}</span>
      <span style={{ color: "rgb(var(--text-2))" }}>{value}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 *  Action bar button
 * ────────────────────────────────────────────────────────────── */
function ActionBtn({
  onClick,
  label,
  active = false,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: 7,
        border: "none",
        background: hovered
          ? "rgba(255,255,255,0.10)"
          : "rgba(255,255,255,0.04)",
        color: active
          ? "rgb(52,211,153)"
          : hovered
          ? "rgb(var(--text-1))"
          : "rgb(var(--text-3))",
        cursor: "pointer",
        transition: "background 0.15s, color 0.15s",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────
 *  Assistant action bar — Copy + Regenerate
 * ────────────────────────────────────────────────────────────── */
function AssistantActionBar({
  content,
  onRegenerate,
}: {
  content: string;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silent */ }
  }, [content]);

  return (
    <div
      className="flex items-center gap-0.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
    >
      <ActionBtn onClick={handleCopy} label="Копіювати" active={copied}>
        {copied
          ? <Check size={13} strokeWidth={2.5} />
          : <Copy size={13} strokeWidth={2.2} />
        }
      </ActionBtn>
      <ActionBtn onClick={onRegenerate} label="Повторити генерацію">
        <RotateCcw size={13} strokeWidth={2.2} />
      </ActionBtn>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 *  User message with inline edit
 * ────────────────────────────────────────────────────────────── */
function UserMessageBubble({
  id,
  content,
  isOptimistic,
}: {
  id: string | number;
  content: string;
  isOptimistic?: boolean;
}) {
  const { editAndResend, isSending } = useChatStore();
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState(content);
  const textareaRef             = useRef<HTMLTextAreaElement>(null);

  // Auto-focus + auto-resize textarea
  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editing]);

  const handleAutoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const handleSave = () => {
    const trimmed = draft.trim();
    if (!trimmed || isSending) return;
    setEditing(false);
    editAndResend(id, trimmed);
  };

  const handleCancel = () => {
    setDraft(content);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSave(); }
    if (e.key === "Escape") handleCancel();
  };

  if (editing) {
    return (
      <div style={{ maxWidth: "min(78%, 600px)" }}>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); handleAutoResize(); }}
          onKeyDown={handleKeyDown}
          rows={1}
          className="chat-input-textarea"
          style={{
            width: "100%",
            resize: "none",
            border: "1px solid rgba(123,147,255,0.4)",
            borderRadius: 12,
            background: "rgb(var(--surface-3))",
            color: "rgb(var(--text-1))",
            padding: "10px 14px",
            fontSize: 14,
            lineHeight: 1.65,
            outline: "none",
            overflowY: "hidden",
            boxShadow: "0 0 0 3px rgba(123,147,255,0.10)",
          }}
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "transparent",
              color: "rgb(var(--text-3))",
              fontSize: 12,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <X size={12} strokeWidth={2.2} />
            Скасувати
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!draft.trim() || isSending}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 14px",
              borderRadius: 8,
              border: "none",
              background: "rgb(var(--accent-blue))",
              color: "#fff",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              opacity: !draft.trim() || isSending ? 0.4 : 1,
              transition: "opacity 0.15s",
            }}
          >
            <Send size={12} strokeWidth={2.2} />
            Зберегти й надіслати
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex flex-col items-end">
      <div
        className={`msg-user px-4 py-2.5 text-[14px] leading-relaxed ${isOptimistic ? "opacity-60" : ""}`}
        style={{ color: "rgb(var(--text-1))" }}
      >
        {content}
      </div>
      {/* Action bar — edit */}
      <div className="flex items-center gap-0.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <ActionBtn onClick={() => { setDraft(content); setEditing(true); }} label="Редагувати">
          <Pencil size={13} strokeWidth={2.2} />
        </ActionBtn>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 *  Segmented tab strip
 * ────────────────────────────────────────────────────────────── */
interface TabDef {
  key: string;
  label: string;
  accentRgb: string;
}

function TabStrip({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-xl p-1"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className="relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all duration-200"
            style={{
              background: isActive ? `rgba(${tab.accentRgb}, 0.14)` : "transparent",
              color: isActive ? `rgb(${tab.accentRgb})` : "rgb(var(--text-3))",
              border: isActive
                ? `1px solid rgba(${tab.accentRgb}, 0.28)`
                : "1px solid transparent",
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full transition-opacity"
              style={{
                background: `rgb(${tab.accentRgb})`,
                opacity: isActive ? 1 : 0.25,
              }}
            />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 *  "Select as best" button
 * ────────────────────────────────────────────────────────────── */
function SelectBestButton({
  accentRgb,
  onClick,
}: {
  accentRgb: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-medium transition-all duration-200 active:scale-[0.97]"
      style={{
        background: hovered
          ? `rgba(${accentRgb}, 0.16)`
          : `rgba(${accentRgb}, 0.08)`,
        border: `1px solid rgba(${accentRgb}, ${hovered ? 0.45 : 0.22})`,
        color: `rgb(${accentRgb})`,
        fontFamily: "'IBM Plex Mono', monospace",
      }}
    >
      <Check size={11} strokeWidth={2.5} />
      Обрати цю відповідь
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────
 *  Compare tabbed block
 * ────────────────────────────────────────────────────────────── */
function CompareTabs({
  messageId,
  modelA,
  modelB,
}: {
  messageId: string | number;
  modelA: CompareResult;
  modelB: CompareResult;
}) {
  const [activeTab, setActiveTab] = useState("A");
  const { resolveMultiResponse } = useChatStore();

  const tabs: TabDef[] = [
    { key: "A", label: modelA.modelLabel, accentRgb: COMPARE_ACCENTS[0] },
    { key: "B", label: modelB.modelLabel, accentRgb: COMPARE_ACCENTS[1] },
  ];

  const current       = activeTab === "A" ? modelA : modelB;
  const currentAccent = activeTab === "A" ? COMPARE_ACCENTS[0] : COMPARE_ACCENTS[1];
  const currentLabel  = activeTab === "A" ? COMPARE_LABELS[0] : COMPARE_LABELS[1];

  const handleSelectBest = useCallback(() => {
    resolveMultiResponse(messageId, current.text, {
      model: current.model,
      modelLabel: current.modelLabel,
      tokens: current.total_tokens,
      latency_ms: current.latency_ms,
    });
  }, [messageId, current, resolveMultiResponse]);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: `1px solid rgba(${currentAccent}, 0.18)`,
        transition: "border-color 0.25s ease",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold"
          style={{
            background: "rgba(123,147,255,0.10)",
            border: "1px solid rgba(123,147,255,0.20)",
            color: "rgb(163,178,255)",
          }}
        >
          Compare
        </div>
        <TabStrip tabs={tabs} active={activeTab} onChange={setActiveTab} />
      </div>

      {/* Content */}
      <div className="px-5 py-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md font-mono text-[11px] font-bold"
              style={{
                background: `rgba(${currentAccent}, 0.15)`,
                color: `rgb(${currentAccent})`,
              }}
            >
              {currentLabel}
            </span>
            <span
              className="font-mono text-[12px] font-semibold"
              style={{ color: "rgb(var(--text-1))" }}
            >
              {current.modelLabel}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <MetaBadge label="ms"  value={current.latency_ms}   />
            <MetaBadge label="tok" value={current.total_tokens} />
          </div>
        </div>
        <div
          className="rounded-xl px-4 py-3"
          style={{
            background: `rgba(${currentAccent}, 0.04)`,
            borderLeft: `2px solid rgba(${currentAccent}, 0.3)`,
            transition: "background 0.25s ease, border-color 0.25s ease",
          }}
        >
          <MarkdownRenderer content={current.text} />
        </div>
        <div className="mt-4 flex justify-end">
          <SelectBestButton accentRgb={currentAccent} onClick={handleSelectBest} />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 *  Self-Consistency tabbed block
 * ────────────────────────────────────────────────────────────── */
function SelfConsistencyTabs({
  messageId,
  modelLabel,
  runs,
}: {
  messageId: string | number;
  modelLabel: string;
  runs: SelfConsistencyRun[];
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const { resolveMultiResponse } = useChatStore();

  const tabs: TabDef[] = runs.map((_, i) => ({
    key: String(i),
    label: SC_RUN_LABELS[i],
    accentRgb: SC_ACCENTS[i],
  }));

  const current       = runs[activeIdx];
  const currentAccent = SC_ACCENTS[activeIdx];

  const handleSelectBest = useCallback(() => {
    resolveMultiResponse(messageId, current.text, {
      model: modelLabel,
      modelLabel,
      tokens: current.total_tokens,
      latency_ms: current.latency_ms,
      run: activeIdx + 1,
    });
  }, [messageId, current, modelLabel, activeIdx, resolveMultiResponse]);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: `1px solid rgba(${currentAccent}, 0.18)`,
        transition: "border-color 0.25s ease",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold"
          style={{
            background: "rgba(251,191,36,0.10)",
            border: "1px solid rgba(251,191,36,0.22)",
            color: "rgb(251,197,68)",
          }}
        >
          Self-Consistency x3
        </div>
        <TabStrip
          tabs={tabs}
          active={String(activeIdx)}
          onChange={(k) => setActiveIdx(Number(k))}
        />
      </div>

      {/* Content */}
      <div className="px-5 py-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md font-mono text-[10px] font-bold"
              style={{
                background: `rgba(${currentAccent}, 0.15)`,
                color: `rgb(${currentAccent})`,
              }}
            >
              {activeIdx + 1}
            </span>
            <span
              className="font-mono text-[12px] font-semibold"
              style={{ color: "rgb(var(--text-1))" }}
            >
              {modelLabel}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <MetaBadge label="ms"  value={current.latency_ms}   />
            <MetaBadge label="tok" value={current.total_tokens} />
          </div>
        </div>
        <div
          className="rounded-xl px-4 py-3"
          style={{
            background: `rgba(${currentAccent}, 0.04)`,
            borderLeft: `2px solid rgba(${currentAccent}, 0.3)`,
            transition: "background 0.25s ease, border-color 0.25s ease",
          }}
        >
          <MarkdownRenderer content={current.text} />
        </div>
        <div className="mt-3 flex items-center justify-between">
          {/* Dot indicators */}
          <div className="flex items-center gap-1.5">
            {runs.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveIdx(i)}
                className="transition-all duration-200"
                style={{
                  width: i === activeIdx ? 20 : 6,
                  height: 6,
                  borderRadius: 999,
                  background:
                    i === activeIdx
                      ? `rgb(${SC_ACCENTS[i]})`
                      : `rgba(${SC_ACCENTS[i]}, 0.28)`,
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
                aria-label={`Switch to run ${i + 1}`}
              />
            ))}
          </div>
          <SelectBestButton accentRgb={currentAccent} onClick={handleSelectBest} />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 *  Normal assistant message
 * ────────────────────────────────────────────────────────────── */
function AssistantMessage({
  content,
  metadata,
  showRaw,
}: {
  content: string;
  metadata?: Record<string, unknown>;
  showRaw: boolean;
}) {
  const { regenerateLastResponse } = useChatStore();

  return (
    <div className="group min-w-0" style={{ maxWidth: "min(85%, 680px)" }}>
      <MarkdownRenderer content={content} />

      {metadata && (
        <div
          className="mt-1.5 flex flex-wrap gap-2 font-mono text-[10px]"
          style={{ color: "rgb(var(--text-3))" }}
        >
          {metadata.model      != null && <span>{String(metadata.model)}</span>}
          {metadata.tokens     != null && <><span>·</span><span>{String(metadata.tokens)} tok</span></>}
          {metadata.latency_ms != null && <><span>·</span><span>{String(metadata.latency_ms)} ms</span></>}
        </div>
      )}

      {showRaw && metadata && (
        <details className="mt-2">
          <summary
            className="cursor-pointer font-mono text-[10px] transition-opacity hover:opacity-80 select-none"
            style={{ color: "rgb(var(--text-3))" }}
          >
            json
          </summary>
          <pre
            className="mt-1 max-h-[240px] overflow-auto rounded-xl px-4 py-3 font-mono text-[10px] leading-relaxed"
            style={{
              background: "rgba(255,255,255,0.03)",
              color: "rgb(var(--text-2))",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </details>
      )}

      {/* Action bar */}
      <AssistantActionBar
        content={content}
        onRegenerate={regenerateLastResponse}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 *  Main MessageList
 * ────────────────────────────────────────────────────────────── */
export function MessageList({
  showRaw = false,
  emptyHint,
  floatingInputOffset = 0,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, isSending } = useChatStore();

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isSending]);

  return (
    <div ref={scrollRef} className="message-scroll">
      <div
        className="mx-auto w-full max-w-3xl px-6 py-5 space-y-5"
        style={floatingInputOffset > 0 ? { paddingBottom: floatingInputOffset } : undefined}
      >
        {/* ── Empty hint ── */}
        {messages.length === 0 && !isSending && emptyHint && (
          <div className="flex h-40 items-center justify-center">
            <p
              className="text-center text-[13px]"
              style={{ color: "rgb(var(--text-3))" }}
              dangerouslySetInnerHTML={{ __html: emptyHint }}
            />
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-in`}
          >
            {m.role === "user" ? (
              /* ── User message ── */
              <UserMessageBubble
                id={m.id}
                content={m.content}
                isOptimistic={m.isOptimistic}
              />

            ) : m.isSelfConsistency && m.selfConsistency ? (
              /* ── Self-Consistency block ── */
              <div className="w-full">
                <SelfConsistencyTabs
                  messageId={m.id}
                  modelLabel={m.selfConsistency.modelLabel}
                  runs={m.selfConsistency.runs}
                />
              </div>

            ) : m.comparison ? (
              /* ── Compare block ── */
              <div className="w-full">
                <CompareTabs
                  messageId={m.id}
                  modelA={m.comparison.modelA}
                  modelB={m.comparison.modelB}
                />
              </div>

            ) : (
              /* ── Normal assistant message ── */
              <AssistantMessage
                content={m.content}
                metadata={m.metadata}
                showRaw={showRaw}
              />
            )}
          </div>
        ))}

        {/* ── Typing indicator ── */}
        {isSending && (
          <div className="flex justify-start animate-in">
            <div className="flex items-center gap-1.5 px-1 py-3">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: "rgb(var(--text-3))",
                    animation: `pulse-dot 1.2s ${d}ms infinite`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}