"use client";

import { useRef, useEffect, useCallback, type KeyboardEvent, type ReactNode, type RefObject, type MutableRefObject } from "react";

/* ── Inline SVG Icons ─────────────────────────────────────────── */
function IconSend({ active }: { active: boolean }) {
  if (active) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14"/>
    </svg>
  );
}
function IconImage() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  );
}
function IconGlobe() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10"/>
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"/>
    </svg>
  );
}
function IconMic() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
    </svg>
  );
}

/* ── Tooltip action button ────────────────────────────────────── */
function ActionBtn({ label, children, disabled = true }: { label: string; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 30, height: 30, borderRadius: 8, border: "none",
        background: "transparent", color: "rgb(var(--text-3))",
        cursor: disabled ? "not-allowed" : "pointer", opacity: 0.45, flexShrink: 0,
        transition: "background 0.12s, color 0.12s",
      }}
    >
      {children}
    </button>
  );
}

/* ── Main component ───────────────────────────────────────────── */
export interface ChatInputBoxProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onFocus?: () => void;
  placeholder?: string;
  disabled?: boolean;
  topSlot?: ReactNode;
  bottomSlot?: ReactNode;
  mono?: boolean;
  maxHeight?: number;
  /** Optional ref to attach to the textarea (e.g. for focus after role/template) */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}

export function ChatInputBox({
  value, onChange, onSend, onFocus,
  placeholder = "Введіть повідомлення...",
  disabled = false, topSlot, bottomSlot,
  mono = false, maxHeight = 200, inputRef: externalInputRef,
}: ChatInputBoxProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef  = useRef<HTMLDivElement>(null);

  const setTextareaRef = useCallback((el: HTMLTextAreaElement | null) => {
    (internalRef as MutableRefObject<HTMLTextAreaElement | null>).current = el;
    if (externalInputRef) (externalInputRef as MutableRefObject<HTMLTextAreaElement | null>).current = el;
  }, [externalInputRef]);

  useEffect(() => {
    const el = internalRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [value, maxHeight]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) onSend();
    }
  };

  const canSend = value.trim().length > 0 && !disabled;

  const focusOn  = () => {
    if (!wrapperRef.current) return;
    wrapperRef.current.style.borderColor = "rgba(123,147,255,0.5)";
    wrapperRef.current.style.boxShadow   = "0 0 0 3px rgba(123,147,255,0.10), 0 4px 20px rgba(0,0,0,0.4)";
  };
  const focusOff = (e: React.FocusEvent) => {
    if (wrapperRef.current?.contains(e.relatedTarget as Node)) return;
    wrapperRef.current!.style.borderColor = "rgba(255,255,255,0.10)";
    wrapperRef.current!.style.boxShadow   = "0 2px 12px rgba(0,0,0,0.3)";
  };

  return (
    <div style={{ width: "100%" }}>
      {/* The floating pill */}
      <div
        ref={wrapperRef}
        onFocusCapture={focusOn}
        onBlurCapture={focusOff}
        style={{
          display: "flex", flexDirection: "column",
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgb(var(--surface-2))",
          boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
          transition: "border-color 0.15s, box-shadow 0.15s",
          overflow: "hidden",
        }}
      >
        {topSlot && <div style={{ padding: "10px 14px 0" }}>{topSlot}</div>}

        <textarea
          ref={setTextareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          style={{
            resize: "none", border: "none", outline: "none",
            background: "transparent", width: "100%",
            padding: "14px 16px 10px",
            fontSize: 14, lineHeight: 1.65,
            fontFamily: mono ? "'IBM Plex Mono', monospace" : "inherit",
            color: "rgb(var(--text-1))",
            minHeight: 52, maxHeight, overflowY: "hidden",
            display: "block",
          }}
          className="chat-input-textarea"
        />

        {/* Action bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 10px 10px" }}>
          {/* Left: decorative actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <ActionBtn label="Прикріпити файл" disabled><IconPlus /></ActionBtn>
            <ActionBtn label="Додати зображення" disabled><IconImage /></ActionBtn>
            <ActionBtn label="Пошук у вебі" disabled><IconGlobe /></ActionBtn>
            <ActionBtn label="Голосове введення" disabled><IconMic /></ActionBtn>
          </div>

          {/* Right: Send */}
          <button
            type="button"
            onClick={() => { if (canSend) onSend(); }}
            disabled={!canSend}
            title={canSend ? "Надіслати (Enter)" : "Введіть повідомлення"}
            aria-label="Надіслати"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, borderRadius: "50%", border: "none",
              background: canSend ? "rgb(var(--accent-blue))" : "rgba(255,255,255,0.07)",
              color: canSend ? "#fff" : "rgb(var(--text-3))",
              cursor: canSend ? "pointer" : "default",
              transition: "background 0.15s, transform 0.1s, opacity 0.15s",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { if (canSend) (e.currentTarget as HTMLButtonElement).style.opacity = "0.82"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
            onMouseDown={(e)  => { if (canSend) (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.88)"; }}
            onMouseUp={(e)    => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
          >
            <IconSend active={canSend} />
          </button>
        </div>
      </div>

      {bottomSlot && <div style={{ marginTop: 8 }}>{bottomSlot}</div>}

      <p style={{ marginTop: 6, textAlign: "center", fontSize: 11, color: "rgb(var(--text-3))", userSelect: "none" }}>
        Enter&nbsp;—&nbsp;надіслати&nbsp;&nbsp;·&nbsp;&nbsp;Shift+Enter&nbsp;—&nbsp;новий рядок
      </p>
    </div>
  );
}