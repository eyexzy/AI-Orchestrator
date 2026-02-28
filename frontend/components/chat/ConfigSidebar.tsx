"use client";

import { useRef } from "react";
import {
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

import { MODELS, DEFAULT_SYSTEM } from "./sidebar/config";
import type { SidebarConfig } from "./sidebar/config";
import {
  CollapsibleSection, Divider, SectionLabel, SliderRow, MiniSwitch, StyledSelect,
} from "./sidebar/SidebarUI";
import { VariableEditor } from "./sidebar/VariableEditor";
import { FewShotEditor } from "./sidebar/FewShotEditor";

export { MODELS, DEFAULT_SYSTEM };
export type { SidebarConfig };
export type { FewShotExample } from "./sidebar/config";

const SIDEBAR_WIDTH = 292;

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