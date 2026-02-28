"use client";

import { useState, useCallback } from "react";
import {
  Copy,
  Check,
  RotateCcw,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────
 *  Accent palette
 * ────────────────────────────────────────────────────────────── */
export const COMPARE_ACCENTS = ["123,147,255", "52,211,153"] as const;
export const SC_ACCENTS      = ["123,147,255", "52,211,153", "251,191,36"] as const;
export const COMPARE_LABELS  = ["A", "B"] as const;
export const SC_RUN_LABELS   = ["Run 1", "Run 2", "Run 3"] as const;

/* ─────────────────────────────────────────────────────────────────
 *  Small helpers
 * ────────────────────────────────────────────────────────────── */
export function MetaBadge({ label, value }: { label: string; value: string | number }) {
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
export function ActionBtn({
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
export function AssistantActionBar({
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
 *  TabDef + TabStrip
 * ────────────────────────────────────────────────────────────── */
export interface TabDef {
  key: string;
  label: string;
  accentRgb: string;
}

export function TabStrip({
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
export function SelectBestButton({
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
