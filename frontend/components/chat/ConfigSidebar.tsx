"use client";

import { useRef, useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  SlidersHorizontal,
  Cpu,
  Settings2,
  Bookmark,
  FileText,
  Terminal,
  Braces,
  ListOrdered,
} from "lucide-react";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { TEMPLATES, CATEGORY_LABELS } from "@/lib/templates";
import type { FewShotExample } from "@/components/chat/ChatLayout";

export const MODELS = [
  { value: "llama-3.3-70b",    label: "Llama 3.3 70B · Groq" },
  { value: "llama-3.1-8b",     label: "Llama 3.1 8B · Groq" },
  { value: "mixtral-8x7b",     label: "Mixtral 8x7B · Groq" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { value: "gemini-1.5-pro",   label: "Gemini 1.5 Pro" },
  { value: "or-llama-70b",     label: "Llama 70B · OR" },
  { value: "or-deepseek-r1",   label: "DeepSeek R1 · OR" },
  { value: "or-gemma-27b",     label: "Gemma 3 27B · OR" },
  { value: "or-qwen3-coder",   label: "Qwen3 Coder · OR" },
  { value: "or-mistral-small", label: "Mistral Small · OR" },
  { value: "gpt-4o",           label: "GPT-4o" },
  { value: "gpt-4o-mini",      label: "GPT-4o Mini" },
];

export const DEFAULT_SYSTEM = "You are a helpful AI assistant. Respond in Ukrainian.";

const SIDEBAR_WIDTH = 292;

/* ── Collapsible Section ─────────────────────────────────────────
 *  Now accepts an optional lucide icon component
 * ─────────────────────────────────────────────────────────────── */
function CollapsibleSection({
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

function Divider() {
  return <div className="divider" />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
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

/* ── SliderRow — thicker track, punchier thumb ───────────────────── */
function SliderRow({
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

/* ── Inline toggle switch ─────────────────────────────────────── */
function MiniSwitch({
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

/* ── Variable Card ────────────────────────────────────────────── */
function VarCard({
  varKey,
  value,
  onRenameKey,
  onChangeValue,
}: {
  varKey: string;
  value: string;
  onRenameKey: (oldKey: string, newKey: string) => void;
  onChangeValue: (key: string, value: string) => void;
}) {
  const [draftKey, setDraftKey] = useState(varKey);
  useEffect(() => { setDraftKey(varKey); }, [varKey]);

  const commitKey = () => {
    const clean =
      draftKey.trim().replace(/\s/g, "_").replace(/[{}]/g, "") || varKey;
    setDraftKey(clean);
    if (clean !== varKey) onRenameKey(varKey, clean);
  };

  return (
    <div
      className="space-y-2 rounded-xl p-2.5"
      style={{
        background: "rgba(0,0,0,0.22)",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="font-mono text-[10px] shrink-0 select-none"
          style={{ color: "rgba(123,147,255,0.55)" }}
        >
          {"{{"}
        </span>
        <input
          type="text"
          value={draftKey}
          onChange={(e) => setDraftKey(e.target.value)}
          onBlur={commitKey}
          onKeyDown={(e) => { if (e.key === "Enter") commitKey(); }}
          placeholder="variable_name"
          className="input-field flex-1 px-2 py-1 font-mono text-[11px]"
          style={{
            height: 24,
            borderRadius: 6,
            background: "rgba(123,147,255,0.07)",
            borderColor: "rgba(123,147,255,0.16)",
          }}
        />
        <span
          className="font-mono text-[10px] shrink-0 select-none"
          style={{ color: "rgba(123,147,255,0.55)" }}
        >
          {"}}"}
        </span>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChangeValue(varKey, e.target.value)}
        placeholder="значення..."
        className="input-field w-full px-2 py-1.5 text-[11px]"
        style={{ borderRadius: 6, minHeight: 26 }}
      />
    </div>
  );
}

function VariableEditor({
  variables,
  onChange,
}: {
  variables: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  const keys = Object.keys(variables);
  return (
    <div className="space-y-2">
      {keys.length === 0 ? (
        <div
          className="rounded-xl p-3.5 text-center"
          style={{
            background: "rgba(0,0,0,0.20)",
            border: "1px dashed rgba(255,255,255,0.07)",
          }}
        >
          <p
            className="font-mono text-[10px] leading-relaxed"
            style={{ color: "rgb(var(--text-3))" }}
          >
            Використайте{" "}
            <span style={{ color: "rgb(123,147,255)" }}>{"{{змінна}}"}</span>{" "}
            у тексті — поля з&apos;являться автоматично
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {keys.map((key) => (
            <VarCard
              key={key}
              varKey={key}
              value={variables[key]}
              onRenameKey={(old, n) =>
                onChange(
                  Object.fromEntries(
                    Object.entries(variables).map(([k, v]) =>
                      k === old ? [n, v] : [k, v]
                    )
                  )
                )
              }
              onChangeValue={(k, val) => onChange({ ...variables, [k]: val })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Few-Shot Editor ──────────────────────────────────────────── */
function FewShotEditor({
  examples,
  onChange,
}: {
  examples: FewShotExample[];
  onChange: (v: FewShotExample[]) => void;
}) {
  const addExample = () => {
    onChange([...examples, { input: "", output: "" }]);
  };

  const removeExample = (idx: number) => {
    onChange(examples.filter((_, i) => i !== idx));
  };

  const updateExample = (
    idx: number,
    field: "input" | "output",
    value: string
  ) => {
    onChange(
      examples.map((ex, i) => (i === idx ? { ...ex, [field]: value } : ex))
    );
  };

  return (
    <div className="space-y-2">
      {examples.length === 0 ? (
        <div
          className="rounded-xl p-3 text-center"
          style={{
            background: "rgba(0,0,0,0.20)",
            border: "1px dashed rgba(255,255,255,0.07)",
          }}
        >
          <p
            className="font-mono text-[10px]"
            style={{ color: "rgb(var(--text-3))" }}
          >
            Приклади автоматично додаються до system message
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {examples.map((ex, idx) => (
            <div
              key={idx}
              className="rounded-xl p-2.5 space-y-1.5"
              style={{
                background: "rgba(0,0,0,0.22)",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className="font-mono text-[9px] font-bold uppercase tracking-wider"
                  style={{ color: "rgb(var(--text-3))" }}
                >
                  #{idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeExample(idx)}
                  className="flex h-5 w-5 items-center justify-center rounded transition-colors hover:text-red-400"
                  style={{ color: "rgb(var(--text-3))" }}
                >
                  <Trash2 size={10} strokeWidth={2.2} />
                </button>
              </div>
              <div>
                <p
                  className="mb-1 font-mono text-[9px]"
                  style={{ color: "rgba(123,147,255,0.65)" }}
                >
                  User
                </p>
                <input
                  type="text"
                  value={ex.input}
                  onChange={(e) => updateExample(idx, "input", e.target.value)}
                  placeholder="Вхідний приклад..."
                  className="input-field w-full px-2 py-1.5 text-[11px]"
                  style={{ borderRadius: 6, minHeight: 26 }}
                />
              </div>
              <div>
                <p
                  className="mb-1 font-mono text-[9px]"
                  style={{ color: "rgba(52,211,153,0.65)" }}
                >
                  Assistant
                </p>
                <input
                  type="text"
                  value={ex.output}
                  onChange={(e) =>
                    updateExample(idx, "output", e.target.value)
                  }
                  placeholder="Відповідь-приклад..."
                  className="input-field w-full px-2 py-1.5 text-[11px]"
                  style={{ borderRadius: 6, minHeight: 26 }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={addExample}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] transition-all"
        style={{
          border: "1px dashed rgba(255,255,255,0.10)",
          color: "rgb(var(--text-3))",
          background: "transparent",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "rgba(255,255,255,0.04)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = "transparent")
        }
      >
        <Plus size={11} strokeWidth={2.2} />
        Додати приклад
      </button>
    </div>
  );
}

/* ── SidebarConfig interface ──────────────────────────────────── */
export interface SidebarConfig {
  model: string;
  setModel: (v: string) => void;
  temperature: number;
  setTemperature: (v: number) => void;
  maxTokens: number;
  setMaxTokens: (v: number) => void;
  showTpl?: boolean;
  setShowTpl?: React.Dispatch<React.SetStateAction<boolean>>;
  onLoadTemplate?: (
    prompt: string,
    vars: Record<string, string>,
    system?: string
  ) => void;
  system?: string;
  setSystem?: (v: string) => void;
  variables?: Record<string, string>;
  setVariables?: (v: Record<string, string>) => void;
  topP?: number;
  setTopP?: (v: number) => void;
  topK?: number;
  setTopK?: (v: number) => void;
  fewShotExamples?: FewShotExample[];
  setFewShotExamples?: (v: FewShotExample[]) => void;
  compareEnabled?: boolean;
  setCompareEnabled?: (v: boolean) => void;
  compareModelA?: string;
  setCompareModelA?: (v: string) => void;
  compareModelB?: string;
  setCompareModelB?: (v: string) => void;
  rawJsonEnabled?: boolean;
  setRawJsonEnabled?: (v: boolean) => void;
  selfConsistencyEnabled?: boolean;
  setSelfConsistencyEnabled?: (v: boolean) => void;
}

/* ── Styled select ─────────────────────────────────────────────── */
function StyledSelect({
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

/* ── Main ConfigSidebar ───────────────────────────────────────── */
export function ConfigSidebar({ config }: { config: SidebarConfig }) {
  const level = useUserLevelStore((s) => s.level);
  const { trackAdvancedFeature } = useUserLevelStore();
  const tempTracked  = useRef(false);
  const modelTracked = useRef(false);
  const sysTracked   = useRef(false);

  const isVisible = level >= 2;
  const compareOn = level === 3 && (config.compareEnabled ?? false);
  const scOn      = level === 3 && (config.selfConsistencyEnabled ?? false);

  const presets = [
    { label: "Точний",   t: 0.1, m: 512 },
    { label: "Balanced", t: 0.7, m: 1024 },
    { label: "Creative", t: 0.9, m: 2048 },
    { label: "Determ.",  t: 0,   m: 256 },
  ];

  return (
    <div
      className={`shrink-0 overflow-hidden transition-all duration-300 ease-in-out ${
        isVisible ? "hidden md:block" : "hidden"
      }`}
      style={{
        width: isVisible ? SIDEBAR_WIDTH : 0,
        opacity: isVisible ? 1 : 0,
        borderLeft: isVisible ? "1px solid rgba(255,255,255,0.06)" : "none",
      }}
      aria-hidden={!isVisible}
    >
      <div
        className="h-full overflow-y-auto config-scroll"
        style={{ width: SIDEBAR_WIDTH, background: "rgba(0,0,0,0.12)" }}
      >
        <div className="space-y-4 p-4">
          {/* ── Header ── */}
          <div className="flex items-center justify-between pb-1">
            <h3
              className="font-display text-[12px] font-semibold tracking-tight"
              style={{ color: "rgb(var(--text-1))" }}
            >
              Config
            </h3>
            <span
              className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold"
              style={
                level === 3
                  ? {
                      background: "rgba(251,191,36,0.12)",
                      color: "rgb(251,197,68)",
                      border: "1px solid rgba(251,191,36,0.20)",
                    }
                  : {
                      background: "rgba(52,211,153,0.12)",
                      color: "rgb(74,222,168)",
                      border: "1px solid rgba(52,211,153,0.20)",
                    }
              }
            >
              L{level} {level === 2 ? "Constructor" : "Engineer"}
            </span>
          </div>

          <Divider />

          {/* ── L3 Mode Toggles ── */}
          {level === 3 && (
            <>
              <CollapsibleSection
                title="Режими"
                icon={SlidersHorizontal}
                defaultOpen
              >
                <div className="space-y-1.5">
                  {/* Compare */}
                  <div
                    className="flex items-center justify-between rounded-xl px-3 py-2.5"
                    style={{
                      background: compareOn
                        ? "rgba(123,147,255,0.08)"
                        : "rgba(0,0,0,0.20)",
                      border: `1px solid ${
                        compareOn
                          ? "rgba(123,147,255,0.25)"
                          : "rgba(255,255,255,0.05)"
                      }`,
                      transition: "all 0.2s",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[11px]"></span>
                      <span
                        className="font-mono text-[10px] font-bold select-none"
                        style={{
                          color: compareOn
                            ? "rgb(163,178,255)"
                            : "rgb(var(--text-3))",
                        }}
                      >
                        Compare
                      </span>
                    </div>
                    <MiniSwitch
                      checked={config.compareEnabled ?? false}
                      onChange={(v) => {
                        config.setCompareEnabled!(v);
                        if (v) trackAdvancedFeature("model_comparison");
                      }}
                    />
                  </div>

                  {/* Self-Consistency */}
                  <div
                    className="flex items-center justify-between rounded-xl px-3 py-2.5"
                    style={{
                      background: scOn
                        ? "rgba(251,191,36,0.08)"
                        : "rgba(0,0,0,0.20)",
                      border: `1px solid ${
                        scOn
                          ? "rgba(251,191,36,0.25)"
                          : "rgba(255,255,255,0.05)"
                      }`,
                      transition: "all 0.2s",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[11px]"></span>
                      <span
                        className="font-mono text-[10px] font-bold select-none"
                        style={{
                          color: scOn
                            ? "rgb(251,197,68)"
                            : "rgb(var(--text-3))",
                        }}
                      >
                        Self-Consistency ×3
                      </span>
                    </div>
                    <MiniSwitch
                      checked={config.selfConsistencyEnabled ?? false}
                      onChange={(v) => {
                        config.setSelfConsistencyEnabled!(v);
                        if (v) trackAdvancedFeature("self_consistency");
                      }}
                      color="251,191,36"
                    />
                  </div>

                  {/* RAW JSON */}
                  <div
                    className="flex items-center justify-between rounded-xl px-3 py-2.5"
                    style={{
                      background: config.rawJsonEnabled
                        ? "rgba(52,211,153,0.08)"
                        : "rgba(0,0,0,0.20)",
                      border: `1px solid ${
                        config.rawJsonEnabled
                          ? "rgba(52,211,153,0.25)"
                          : "rgba(255,255,255,0.05)"
                      }`,
                      transition: "all 0.2s",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[11px]">{""}</span>
                      <span
                        className="font-mono text-[10px] font-bold select-none"
                        style={{
                          color: config.rawJsonEnabled
                            ? "rgb(52,211,153)"
                            : "rgb(var(--text-3))",
                        }}
                      >
                        RAW JSON
                      </span>
                    </div>
                    <MiniSwitch
                      checked={config.rawJsonEnabled ?? false}
                      onChange={(v) => {
                        config.setRawJsonEnabled!(v);
                        if (v) trackAdvancedFeature("raw_json");
                      }}
                      color="52,211,153"
                    />
                  </div>
                </div>
              </CollapsibleSection>

              <Divider />
            </>
          )}

          {/* ── Model ── */}
          <CollapsibleSection title="Модель" icon={Cpu} defaultOpen>
            {compareOn ? (
              <div className="space-y-2.5">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-4 w-4 items-center justify-center rounded font-mono text-[9px] font-bold shrink-0"
                      style={{
                        background: "rgba(123,147,255,0.15)",
                        color: "rgb(123,147,255)",
                      }}
                    >
                      A
                    </span>
                    <SectionLabel>Модель A</SectionLabel>
                  </div>
                  <StyledSelect
                    value={config.compareModelA ?? config.model}
                    onChange={(v) => {
                      config.setCompareModelA?.(v);
                      if (!modelTracked.current) {
                        modelTracked.current = true;
                        trackAdvancedFeature("model");
                      }
                    }}
                    borderColor="rgba(123,147,255,0.20)"
                  >
                    {MODELS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </StyledSelect>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-4 w-4 items-center justify-center rounded font-mono text-[9px] font-bold shrink-0"
                      style={{
                        background: "rgba(52,211,153,0.15)",
                        color: "rgb(52,211,153)",
                      }}
                    >
                      B
                    </span>
                    <SectionLabel>Модель B</SectionLabel>
                  </div>
                  <StyledSelect
                    value={config.compareModelB ?? "gemini-2.0-flash"}
                    onChange={(v) => config.setCompareModelB?.(v)}
                    borderColor="rgba(52,211,153,0.20)"
                  >
                    {MODELS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </StyledSelect>
                </div>
              </div>
            ) : (
              <StyledSelect
                value={config.model}
                onChange={(v) => {
                  config.setModel(v);
                  if (!modelTracked.current) {
                    modelTracked.current = true;
                    trackAdvancedFeature("model");
                  }
                }}
              >
                {MODELS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </StyledSelect>
            )}
          </CollapsibleSection>

          <Divider />

          {/* ── Параметри генерації ── */}
          <CollapsibleSection title="Параметри" icon={Settings2} defaultOpen>
            <SliderRow
              label="Temperature"
              min={0}
              max={level === 3 ? 2 : 1}
              step={0.05}
              value={config.temperature}
              onChange={(v) => {
                config.setTemperature(v);
                if (!tempTracked.current && v !== 0.7) {
                  tempTracked.current = true;
                  trackAdvancedFeature("temperature");
                }
              }}
              format={(v) => v.toFixed(2)}
            />
            <div className="flex justify-between px-0.5">
              <span
                className="font-mono text-[9px]"
                style={{ color: "rgb(var(--text-3))" }}
              >
                Точний
              </span>
              <span
                className="font-mono text-[9px]"
                style={{ color: "rgb(var(--text-3))" }}
              >
                Креативний
              </span>
            </div>

            <SliderRow
              label="Max Tokens"
              min={64}
              max={4096}
              step={64}
              value={config.maxTokens}
              onChange={(v) => config.setMaxTokens(Math.round(v))}
              format={(v) => String(v)}
              trackColor="52,211,153"
            />

            {/* Top-P and Top-K — L3 only */}
            {level === 3 && config.setTopP && (
              <>
                <SliderRow
                  label="Top-P"
                  min={0}
                  max={1}
                  step={0.05}
                  value={config.topP ?? 1.0}
                  onChange={(v) => config.setTopP!(v)}
                  format={(v) => v.toFixed(2)}
                  trackColor="16,178,255"
                />
                <SliderRow
                  label="Top-K"
                  min={1}
                  max={100}
                  step={1}
                  value={config.topK ?? 40}
                  onChange={(v) => config.setTopK!(Math.round(v))}
                  format={(v) => String(v)}
                  trackColor="251,191,36"
                />
              </>
            )}
          </CollapsibleSection>

          <Divider />

          {/* ── Пресети ── */}
          <CollapsibleSection
            title="Пресети"
            icon={Bookmark}
            defaultOpen={false}
          >
            <div className="grid grid-cols-2 gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    config.setTemperature(p.t);
                    config.setMaxTokens(p.m);
                  }}
                  className="rounded-xl px-2 py-2 text-center text-[11px] font-medium transition-all active:scale-95"
                  style={{
                    border: "1px solid rgba(255,255,255,0.07)",
                    color: "rgb(var(--text-2))",
                    background: "rgba(0,0,0,0.20)",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "rgba(255,255,255,0.06)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "rgba(0,0,0,0.20)")
                  }
                >
                  {p.label}
                  <br />
                  <span
                    className="font-mono text-[9px]"
                    style={{ color: "rgb(var(--text-3))" }}
                  >
                    t={p.t} · {p.m}tok
                  </span>
                </button>
              ))}
            </div>
          </CollapsibleSection>

          {/* ── Templates (L2+) ── */}
          {config.showTpl !== undefined &&
            config.setShowTpl &&
            config.onLoadTemplate && (
              <>
                <Divider />
                <CollapsibleSection
                  title="Шаблони"
                  icon={FileText}
                  defaultOpen={false}
                >
                  <div className="space-y-1">
                    {TEMPLATES.filter((t) =>
                      level === 2 ? t.level <= 2 : true
                    ).map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => {
                          const nv: Record<string, string> = {};
                          if (tpl.variables && config.variables) {
                            for (const v of tpl.variables)
                              nv[v] = config.variables[v] ?? "";
                          }
                          config.onLoadTemplate!(
                            tpl.prompt,
                            nv,
                            tpl.systemMessage
                          );
                          config.setShowTpl!(false);
                        }}
                        className="flex w-full flex-col rounded-xl px-3 py-2 text-left transition-all active:scale-[0.98]"
                        style={{
                          border: "1px solid rgba(255,255,255,0.05)",
                          background: "rgba(0,0,0,0.18)",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background =
                            "rgba(255,255,255,0.05)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background =
                            "rgba(0,0,0,0.18)")
                        }
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="text-[11px] font-medium"
                            style={{ color: "rgb(var(--text-1))" }}
                          >
                            {tpl.title}
                          </span>
                          <span
                            className="rounded px-1.5 py-0.5 font-mono text-[9px]"
                            style={{
                              background: "rgba(255,255,255,0.06)",
                              color: "rgb(var(--text-3))",
                            }}
                          >
                            {CATEGORY_LABELS[tpl.category]}
                          </span>
                          <span
                            className="ml-auto font-mono text-[9px]"
                            style={{ color: "rgb(123,147,255)" }}
                          >
                            L{tpl.level}
                          </span>
                        </div>
                        <span
                          className="mt-0.5 text-[10px] leading-relaxed"
                          style={{ color: "rgb(var(--text-3))" }}
                        >
                          {tpl.description}
                        </span>
                        {tpl.variables && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {tpl.variables.map((v) => (
                              <span
                                key={v}
                                className="font-mono text-[9px] rounded px-1 py-0.5"
                                style={{
                                  background: "rgba(123,147,255,0.10)",
                                  color: "rgba(163,178,255,0.8)",
                                }}
                              >
                                {`{{${v}}}`}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </CollapsibleSection>
              </>
            )}

          {/* ── L3 blocks ── */}
          {level === 3 && (
            <>
              <Divider />

              {/* System Message */}
              {config.system !== undefined && config.setSystem && (
                <CollapsibleSection
                  title="System Message"
                  icon={Terminal}
                  defaultOpen
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span />
                    <button
                      type="button"
                      onClick={() => config.setSystem!(DEFAULT_SYSTEM)}
                      className="rounded px-2 py-0.5 font-mono text-[9px] transition-all"
                      style={{
                        color: "rgb(var(--text-3))",
                        border: "1px solid rgba(255,255,255,0.07)",
                        background: "transparent",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "rgba(255,255,255,0.05)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      reset
                    </button>
                  </div>
                  <textarea
                    value={config.system}
                    onChange={(e) => {
                      config.setSystem!(e.target.value);
                      if (
                        !sysTracked.current &&
                        e.target.value !== DEFAULT_SYSTEM
                      ) {
                        sysTracked.current = true;
                        trackAdvancedFeature("system_prompt");
                      }
                    }}
                    className="input-field w-full resize-y px-3 py-2 font-mono text-[11px] leading-relaxed"
                    placeholder="Роль та інструкції..."
                    style={{
                      minHeight: 80,
                      borderRadius: 9,
                      background: "rgba(0,0,0,0.25)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  />
                </CollapsibleSection>
              )}

              <Divider />

              {/* Variables */}
              {config.variables !== undefined && config.setVariables && (
                <CollapsibleSection
                  title="Змінні"
                  icon={Braces}
                  defaultOpen
                >
                  {config.variables &&
                    Object.keys(config.variables).length > 0 && (
                      <div className="mb-1.5 flex items-center justify-end">
                        <span
                          className="font-mono text-[9px]"
                          style={{ color: "rgb(var(--text-3))" }}
                        >
                          {Object.keys(config.variables).length} активних
                        </span>
                      </div>
                    )}
                  <VariableEditor
                    variables={config.variables}
                    onChange={(v) => {
                      if (
                        Object.keys(v).length >
                        Object.keys(config.variables!).length
                      ) {
                        trackAdvancedFeature("variable");
                      }
                      config.setVariables!(v);
                    }}
                  />
                </CollapsibleSection>
              )}

              <Divider />

              {/* Few-Shot Examples */}
              {config.fewShotExamples !== undefined &&
                config.setFewShotExamples && (
                  <CollapsibleSection
                    title="Few-Shot Приклади"
                    icon={ListOrdered}
                    defaultOpen={false}
                  >
                    <FewShotEditor
                      examples={config.fewShotExamples}
                      onChange={(v) => {
                        if (
                          v.length > (config.fewShotExamples?.length ?? 0)
                        ) {
                          trackAdvancedFeature("few_shot");
                        }
                        config.setFewShotExamples!(v);
                      }}
                    />
                  </CollapsibleSection>
                )}
            </>
          )}

          {/* Bottom padding */}
          <div style={{ height: 8 }} />
        </div>
      </div>
    </div>
  );
}