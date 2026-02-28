"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

/* ── Collapsible Section ─────────────────────────────────────────── */
export function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon?: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [hovered, setHovered] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 transition-all duration-150"
        style={{
          background: hovered ? "rgba(255,255,255,0.05)" : "transparent",
        }}
      >
        <div className="flex items-center gap-2">
          {Icon && (
            <Icon
              size={12}
              strokeWidth={2.2}
              style={{
                color: hovered ? "rgb(var(--text-2))" : "rgb(var(--text-3))",
                transition: "color 0.15s",
                flexShrink: 0,
              }}
            />
          )}
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: hovered ? "rgb(var(--text-2))" : "rgb(var(--text-3))",
              fontFamily: "'IBM Plex Mono', monospace",
              transition: "color 0.15s",
            }}
          >
            {title}
          </span>
        </div>
        {open ? (
          <ChevronDown
            size={11}
            strokeWidth={2.2}
            style={{ color: "rgb(var(--text-3))", flexShrink: 0, transition: "color 0.15s" }}
          />
        ) : (
          <ChevronRight
            size={11}
            strokeWidth={2.2}
            style={{ color: "rgb(var(--text-3))", flexShrink: 0, transition: "color 0.15s" }}
          />
        )}
      </button>
      {open && <div className="mt-2.5 space-y-3">{children}</div>}
    </div>
  );
}

/* ── Divider ─────────────────────────────────────────────────────── */
export function Divider() {
  return <div className="divider" />;
}

/* ── Section Label ───────────────────────────────────────────────── */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        color: "rgb(var(--text-3))",
        fontFamily: "'IBM Plex Mono', monospace",
      }}
    >
      {children}
    </p>
  );
}

/* ── SliderRow ───────────────────────────────────────────────────── */
export function SliderRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
  trackColor = "123,147,255",
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  trackColor?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <SectionLabel>{label}</SectionLabel>
        <span
          className="rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold"
          style={{
            background: `rgba(${trackColor},0.14)`,
            color: `rgb(${trackColor})`,
            border: `1px solid rgba(${trackColor},0.20)`,
          }}
        >
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider-input w-full"
        style={{
          height: 4,
          background: `linear-gradient(to right,
            rgba(${trackColor},0.70) 0%, rgba(${trackColor},0.70) ${pct}%,
            rgba(255,255,255,0.10) ${pct}%, rgba(255,255,255,0.10) 100%)`,
        }}
      />
    </div>
  );
}

/* ── MiniSwitch ──────────────────────────────────────────────────── */
export function MiniSwitch({
  checked,
  onChange,
  color = "123,147,255",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  color?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-[18px] w-[32px] shrink-0 cursor-pointer items-center rounded-full transition-colors"
      style={{
        background: checked ? `rgb(${color})` : "rgba(255,255,255,0.1)",
        boxShadow: checked ? `0 0 0 1px rgba(${color},0.35)` : "none",
        transition: "background 0.2s, box-shadow 0.2s",
      }}
    >
      <span
        className="pointer-events-none block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: `translateX(${checked ? 16 : 2}px)` }}
      />
    </button>
  );
}

/* ── StyledSelect ────────────────────────────────────────────────── */
export function StyledSelect({
  value,
  onChange,
  borderColor,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  borderColor?: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input-field w-full px-2.5 text-[11px]"
      style={{
        height: 32,
        borderRadius: 8,
        background: "rgba(0,0,0,0.22)",
        border: `1px solid ${borderColor ?? "rgba(255,255,255,0.07)"}`,
      }}
    >
      {children}
    </select>
  );
}
