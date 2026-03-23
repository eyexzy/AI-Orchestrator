"use client";

import { Fragment, memo, useRef, useEffect, useState, useMemo, useCallback } from "react";
import { Settings, ChevronUp, Layers2, Cpu, SlidersHorizontal, LayoutTemplate, Terminal, Braces, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { useModelsStore } from "@/lib/store/modelsStore";
import { useTemplatesStore, getMergedTemplates, type PromptTemplate } from "@/lib/store/templatesStore";
import { useTranslation } from "@/lib/store/i18nStore";

import { trackEvent } from "@/lib/eventTracker";
import { getDefaultSystem, isDefaultSystem } from "./sidebar/config";
import type { SidebarConfig } from "./sidebar/config";
import { Switch } from "@/components/ui/switch";
import { Material } from "@/components/ui/material";
import { Description } from "@/components/ui/description";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Note } from "@/components/ui/note";
import { Textarea } from "@/components/ui/textarea";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Divider, SectionHeader } from "./sidebar/SidebarUI";
import { VariableEditor } from "./sidebar/VariableEditor";
import { FewShotEditor } from "./sidebar/FewShotEditor";
import { TemplateManagerModal } from "./sidebar/TemplateManagerModal";

export { getDefaultSystem, isDefaultSystem };
export type { SidebarConfig };
export type { FewShotExample } from "./sidebar/config";

const SIDEBAR_WIDTH_CSS = "clamp(280px, 25vw, 340px)";

const TEMPLATE_BADGE_VARIANTS = {
  gray: "gray-subtle",
  blue: "blue-subtle",
  purple: "purple-subtle",
  pink: "pink-subtle",
  red: "red-subtle",
  amber: "amber-subtle",
  green: "green-subtle",
  teal: "teal-subtle",
} satisfies Record<string, NonNullable<BadgeProps["variant"]>>;

function isTemplateBadgeColor(
  value: string,
): value is keyof typeof TEMPLATE_BADGE_VARIANTS {
  return value in TEMPLATE_BADGE_VARIANTS;
}

function getTemplateBadgeVariant(
  color: string,
): NonNullable<BadgeProps["variant"]> {
  return isTemplateBadgeColor(color)
    ? TEMPLATE_BADGE_VARIANTS[color]
    : "gray-subtle";
}

function SidebarTemplateItem({ tpl, config }: { tpl: PromptTemplate; config: SidebarConfig }) {
  return (
    <Material className="group relative flex w-full cursor-pointer flex-col px-3.5 py-3 text-left hover:bg-gray-alpha-200">
      <div
        className="flex flex-1 flex-col"
        onClick={() => {
          trackEvent("template_inserted", { template_id: tpl.id, category: tpl.category_name });
          const vars = tpl.variables ?? [];
          const nv: Record<string, string> = {};
          if (vars.length > 0 && config.variables) {
            for (const v of vars) nv[v] = config.variables[v] ?? "";
          }
          config.onLoadTemplate!(tpl.prompt, nv, tpl.system_message || undefined);
          config.setShowTpl!(false);
        }}
      >
        <div className="flex min-w-0 items-center gap-2 pb-1 pr-16">
          <span className="block min-w-0 truncate text-[14px] font-semibold leading-snug text-ds-text">
            {tpl.title}
          </span>
        </div>
        <Description className="line-clamp-2 break-words">{tpl.description}</Description>
        {tpl.variables && tpl.variables.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tpl.variables.map((v: string) => (
              <span
                key={v}
                className="max-w-[100px] truncate rounded bg-gray-alpha-200 px-1.5 py-0.5 font-mono text-[10px] text-ds-text-tertiary"
              >
                {`{{${v}}}`}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute right-3 top-3">
        <Badge variant={getTemplateBadgeVariant(tpl.category_color)}>
          <span className="max-w-[120px] truncate">{tpl.category_name}</span>
        </Badge>
      </div>
    </Material>
  );
}

const ConfigSidebarComponent = ({ config, forceVisible }: { config: SidebarConfig; forceVisible?: boolean }) => {
  const { t, language } = useTranslation();
  const level = useUserLevelStore((s) => s.level);
  const { trackAdvancedFeature, trackTooltipClick } = useUserLevelStore();
  const models = useModelsStore((s) => s.models);
  const fetchModels = useModelsStore((s) => s.fetchModels);
  const customTemplates = useTemplatesStore((s) => s.templates);
  const fetchTemplates = useTemplatesStore((s) => s.fetchTemplates);
  const hiddenTemplates = useUserLevelStore((s) => s.hiddenTemplates);
  const templates = useMemo(
    () => getMergedTemplates(customTemplates, level, language as "en" | "uk", hiddenTemplates),
    [customTemplates, level, language, hiddenTemplates],
  );

  const handleTooltipOpen = useCallback((id: string) => {
    trackTooltipClick();
    trackEvent("tooltip_opened", { tooltip_id: id });
  }, [trackTooltipClick]);

  const tempTracked = useRef(false);
  const modelTracked = useRef(false);
  const sysTracked = useRef(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      setShowScrollTop(el.scrollTop > 200);
      setIsScrolled(el.scrollTop > 10);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const isVisible = level >= 2;
  const compareOn = level === 3 && (config.compareEnabled ?? false);
  const fallbackModelB = models?.[1]?.value ?? models?.[0]?.value ?? config.model;

  const presets = useMemo(() => ([
    { id: "precise", label: t("config.precise"), t: 0.1, m: 1024, p: 0.9 },
    { id: "balanced", label: t("config.balanced"), t: 0.4, m: 2048, p: 0.95 },
    { id: "creative", label: t("config.creative"), t: 0.9, m: 4096, p: 0.99 },
  ]), [t]);

  const activePresetId = useMemo(() => {
    const matched = presets.find((p) => {
      const matchBase = config.temperature === p.t && config.maxTokens === p.m;
      if (level < 3) return matchBase;
      return matchBase && config.topP === p.p;
    });
    return matched?.id;
  }, [config.temperature, config.maxTokens, config.topP, level, presets]);

  const sections: Array<{ key: string; content: React.ReactNode }> = [];

  if (level === 3) {
    sections.push({
      key: "modes",
      content: (
        <section className="flex flex-col gap-5">
          <SectionHeader icon={Layers2}>{t("config.modes")}</SectionHeader>
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Tooltip align="start" content={t("tooltip.compare")} onOpen={() => handleTooltipOpen("compare")}>
                  <span className="text-[13px] font-medium text-ds-text">{t("config.compare")}</span>
                </Tooltip>
                <Switch
                  checked={config.compareEnabled ?? false}
                  onCheckedChange={(v) => {
                    config.setCompareEnabled!(v);
                    if (v) {
                      config.setSelfConsistencyEnabled!(false);
                      trackEvent("compare_enabled");
                      trackAdvancedFeature("model_comparison");
                    }
                  }}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Tooltip align="start" content={t("tooltip.check3x")} onOpen={() => handleTooltipOpen("check3x")}>
                  <span className="text-[13px] font-medium text-ds-text">{t("config.check3x")}</span>
                </Tooltip>
                <Switch
                  checked={config.selfConsistencyEnabled ?? false}
                  onCheckedChange={(v) => {
                    config.setSelfConsistencyEnabled!(v);
                    if (v) {
                      config.setCompareEnabled!(false);
                      trackEvent("self_consistency_enabled");
                      trackAdvancedFeature("self_consistency");
                    }
                  }}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Tooltip align="start" content={t("tooltip.rawJson")} onOpen={() => handleTooltipOpen("rawJson")}>
                  <span className="text-[13px] font-medium text-ds-text">{t("config.rawJson")}</span>
                </Tooltip>
                <Switch
                  checked={config.rawJsonEnabled ?? false}
                  onCheckedChange={(v) => {
                    config.setRawJsonEnabled!(v);
                    if (v) trackAdvancedFeature("raw_json");
                  }}
                />
              </div>
            </div>
          </div>
        </section>
      ),
    });
  }

  sections.push({
    key: "model",
    content: (
      <section className="flex flex-col gap-4">
        <SectionHeader icon={Cpu}>{t("config.model")}</SectionHeader>
        {compareOn ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-800" />
                  <span className="text-[12px] font-medium text-ds-text-secondary">
                    {t("config.modelA")}
                  </span>
                </div>
                <Select
                  value={config.compareModelA ?? config.model}
                  onValueChange={(v) => {
                    config.setCompareModelA?.(v);
                    trackEvent("model_changed", { model: v, slot: "A" });
                    if (!modelTracked.current) {
                      modelTracked.current = true;
                      trackAdvancedFeature("model");
                    }
                  }}
                  options={models}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-700" />
                  <span className="text-[12px] font-medium text-ds-text-secondary">
                    {t("config.modelB")}
                  </span>
                </div>
                <Select
                  value={config.compareModelB ?? fallbackModelB}
                  onValueChange={(v) => config.setCompareModelB?.(v)}
                  options={models}
                />
              </div>
            </div>

            {(config.compareModelA ?? config.model) === (config.compareModelB ?? fallbackModelB) && (
              <Note variant="warning" size="sm">
                {t("config.sameModelWarning")}
              </Note>
            )}
          </div>
        ) : (
          <Select
            value={config.model}
            onValueChange={(v) => {
              config.setModel(v);
              trackEvent("model_changed", { model: v });
              if (!modelTracked.current) {
                modelTracked.current = true;
                trackAdvancedFeature("model");
              }
            }}
            options={models}
          />
        )}
      </section>
    ),
  });

  sections.push({
    key: "parameters",
    content: (
      <section className="flex flex-col gap-5">
        <SectionHeader icon={SlidersHorizontal}>{t("config.parameters")}</SectionHeader>
        <div className="flex flex-col gap-5">
          <SegmentedControl
            options={presets.map((p) => ({ value: p.id, label: p.label }))}
            value={activePresetId}
            onValueChange={(val) => {
              const p = presets.find((x) => x.id === val);
              if (p) {
                config.setTemperature(p.t);
                config.setMaxTokens(p.m);
                if (level === 3 && config.setTopP) {
                  config.setTopP(p.p);
                }
              }
            }}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Tooltip align="start" content={t("tooltip.temperature")} onOpen={() => handleTooltipOpen("temperature")}>
                <span className="block cursor-help pb-0 text-[13px] font-medium text-ds-text">
                  {t("config.temperature")}
                </span>
              </Tooltip>
              <span className="rounded bg-gray-alpha-200 px-2 py-0.5 font-mono text-xs font-medium text-ds-gray-1000">
                {config.temperature.toFixed(2)}
              </span>
            </div>
            <Slider
              min={0}
              max={level === 3 ? 2 : 1}
              step={0.05}
              value={[config.temperature]}
              onValueChange={(v) => {
                config.setTemperature(v[0]);
                if (!tempTracked.current && v[0] !== 0.7) {
                  tempTracked.current = true;
                  trackEvent("temperature_changed", { value: v[0] });
                  trackAdvancedFeature("temperature");
                }
              }}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Tooltip align="start" content={t("tooltip.maxTokens")} onOpen={() => handleTooltipOpen("maxTokens")}>
                <span className="block cursor-help pb-0 text-[13px] font-medium text-ds-text">
                  {t("config.maxTokens")}
                </span>
              </Tooltip>
              <span className="rounded bg-gray-alpha-200 px-2 py-0.5 font-mono text-xs font-medium text-ds-gray-1000">
                {config.maxTokens}
              </span>
            </div>
            <Slider
              min={64}
              max={4096}
              step={64}
              value={[config.maxTokens]}
              onValueChange={(v) => config.setMaxTokens(Math.round(v[0]))}
            />
          </div>

          {level === 3 && config.setTopP && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Tooltip align="start" content={t("tooltip.topP")} onOpen={() => handleTooltipOpen("topP")}>
                    <span className="block cursor-help pb-0 text-[13px] font-medium text-ds-text">
                      {t("config.topP")}
                    </span>
                  </Tooltip>
                  <span className="rounded bg-gray-alpha-200 px-2 py-0.5 font-mono text-xs font-medium text-ds-gray-1000">
                    {(config.topP ?? 1.0).toFixed(2)}
                  </span>
                </div>
                <Slider
                  min={0}
                  max={1}
                  step={0.05}
                  value={[config.topP ?? 1.0]}
                  onValueChange={(v) => {
                    config.setTopP!(v[0]);
                    trackEvent("top_p_changed", { value: v[0] });
                  }}
                />
              </div>

            </>
          )}
        </div>
      </section>
    ),
  });

  if (config.showTpl !== undefined && config.setShowTpl && config.onLoadTemplate) {
    const favorites = templates.filter((tpl) => tpl.is_favorite);
    sections.push({
      key: "templates",
      content: (
        <section className="flex flex-col gap-4">
          <SectionHeader icon={LayoutTemplate}>{t("config.templates")}</SectionHeader>
          <div className="w-full space-y-3">
            {favorites.length > 0 ? (
              <div className="flex w-full flex-col gap-2">
                {favorites.map((tpl) => <SidebarTemplateItem key={tpl.id} tpl={tpl} config={config} />)}
              </div>
            ) : (
              <div className="flex w-full flex-col gap-1 rounded-xl border border-gray-alpha-200 bg-gray-alpha-100 p-4 text-center">
                <p className="text-[13px] font-semibold text-ds-text-secondary">
                  {t("config.pinHintTitle")}
                </p>
                <p className="text-[11px] leading-relaxed text-ds-text-tertiary">
                  {t("config.pinHint")}
                </p>
              </div>
            )}
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => setIsTemplateModalOpen(true)}
              leftIcon={<Settings size={14} />}
            >
              {t("config.manageTemplates")}
            </Button>
          </div>
        </section>
      ),
    });
  }

  if (level === 3 && config.system !== undefined && config.setSystem) {
    sections.push({
      key: "system",
      content: (
        <section className="flex flex-col gap-4">
          <SectionHeader icon={Terminal}>{t("config.systemMessage")}</SectionHeader>
          <div className="space-y-2">
            <Textarea
              value={config.system}
              onChange={(e) => {
                config.setSystem!(e.target.value);
                if (!sysTracked.current && !isDefaultSystem(e.target.value) && e.target.value !== "") {
                  sysTracked.current = true;
                  trackEvent("system_prompt_edited", { length: e.target.value.length });
                  trackAdvancedFeature("system_prompt");
                }
              }}
              placeholder={t("config.systemPlaceholder")}
              className="min-h-[100px] font-mono text-[13px] leading-relaxed"
            />
            <div className="flex items-center justify-between">
              {isDefaultSystem(config.system ?? "") ? (
                <span className="text-xs text-ds-text-tertiary">{t("config.systemDefault")}</span>
              ) : (
                <span />
              )}
              {!isDefaultSystem(config.system ?? "") && (
                <button
                  type="button"
                  onClick={() => config.setSystem!(getDefaultSystem())}
                  className="text-xs font-medium text-blue-600 transition-colors hover:text-blue-500"
                  >
                    {t("config.systemReset")}
                  </button>
              )}
            </div>
          </div>
        </section>
      ),
    });
  }

  if (level === 3 && config.variables !== undefined && config.setVariables) {
    sections.push({
      key: "variables",
      content: (
        <section className="flex flex-col gap-4">
          <SectionHeader icon={Braces}>{t("config.variables")}</SectionHeader>
          <VariableEditor
            variables={config.variables}
            onChange={(v) => {
              const prevCount = Object.keys(config.variables ?? {}).length;
              const newCount = Object.keys(v).length;
              if (newCount > prevCount) {
                trackEvent("variable_added", { count: newCount });
              }
              config.setVariables!(v);
            }}
          />
        </section>
      ),
    });
  }

  if (level === 3 && config.fewShotExamples !== undefined && config.setFewShotExamples) {
    sections.push({
      key: "few-shot",
      content: (
        <section className="flex flex-col gap-4">
          <SectionHeader icon={BookOpen}>{t("config.fewShot")}</SectionHeader>
          <FewShotEditor
            examples={config.fewShotExamples}
            onChange={(v) => {
              if (v.length > (config.fewShotExamples?.length ?? 0)) {
                trackEvent("few_shot_added", { count: v.length });
                trackAdvancedFeature("few_shot");
              }
              config.setFewShotExamples!(v);
            }}
          />
        </section>
      ),
    });
  }

  return (
    <div
      className={forceVisible ? "" : `shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-in-out ${isVisible ? "hidden md:block border-l border-gray-alpha-200" : "hidden"}`}
      style={forceVisible ? {} : { width: isVisible ? SIDEBAR_WIDTH_CSS : 0, opacity: isVisible ? 1 : 0 }}
      aria-hidden={forceVisible ? false : !isVisible}
    >
      <div ref={scrollRef} className="config-scroll h-full overflow-y-auto bg-background-100 relative">

        {/* Sticky header */}
        <div className={cn("sticky top-0 z-30 bg-background-100 px-5 py-3.5 transition-shadow duration-200", isScrolled ? "shadow-sm border-b border-gray-alpha-200" : "border-b border-transparent")}>
          <h3 className="text-base font-semibold tracking-tight text-ds-text">{t("config.title")}</h3>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-6 px-5 py-6 pb-24">
          {sections.map((section, index) => (
            <Fragment key={section.key}>
              {index > 0 && <Divider />}
              {section.content}
            </Fragment>
          ))}
        </div>

        {showScrollTop && (
          <div className="sticky bottom-6 ml-auto mr-5 w-fit animate-fade-in">
            <Button
              variant="secondary"
              shape="rounded"
              size="sm"
              iconOnly
              onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
              className="shadow-elevated-panel"
              aria-label="Scroll to top"
            >
              <ChevronUp size={16} strokeWidth={2} />
            </Button>
          </div>
        )}
      </div>
      <TemplateManagerModal open={isTemplateModalOpen} onOpenChange={setIsTemplateModalOpen} />
    </div>
  );
};

export const ConfigSidebar = memo(ConfigSidebarComponent);
ConfigSidebar.displayName = "ConfigSidebar";