"use client";

import { useEffect, useMemo, useState } from "react";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { Card } from "@/components/ui/card";
import { useTranslation } from "@/lib/store/i18nStore";
import { MetaBadge, SelectBestButton, TabStrip } from "./MessageUI";
import type { TabDef } from "./MessageUI";

export interface ResponseTab {
  key: string;
  label: string;
  shortLabel: string;
  accentRgb: string;
  text: string;
  latencyMs: number;
  totalTokens: number;
}

interface MultiResponseCardProps {
  mode: "compare" | "self-consistency";
  messageId: string | number;
  tabs: ResponseTab[];
  onSelectBest: (tab: ResponseTab) => void;
}

export function MultiResponseCard({
  mode,
  messageId,
  tabs,
  onSelectBest,
}: MultiResponseCardProps) {
  const { t } = useTranslation();
  const [activeKey, setActiveKey] = useState(tabs[0]?.key ?? "");

  useEffect(() => {
    if (!tabs.length) {
      setActiveKey("");
      return;
    }
    if (!tabs.some((tab) => tab.key === activeKey)) {
      setActiveKey(tabs[0].key);
    }
  }, [activeKey, tabs]);

  const currentTab = tabs.find((tab) => tab.key === activeKey) ?? tabs[0];
  const isCompare = mode === "compare";
  const isSelfConsistency = mode === "self-consistency";
  const activeIndex = tabs.findIndex((tab) => tab.key === currentTab?.key);

  const tabDefs: TabDef[] = useMemo(
    () =>
      tabs.map((tab) => ({
        key: tab.key,
        label: isCompare ? tab.label : `${t("msg.run")} ${tab.shortLabel}`,
        accentRgb: tab.accentRgb,
      })),
    [isCompare, t, tabs],
  );

  if (!currentTab) return null;

  return (
    <Card
      data-message-id={messageId}
      className="overflow-hidden rounded-2xl border border-gray-alpha-200 bg-background-100 shadow-geist-sm"
    >
      <div className="flex items-center justify-between border-b border-gray-alpha-200 px-4 py-3">
        <span className="text-lg font-semibold tracking-tight text-ds-text">
          {isCompare ? t("config.compare") : t("config.check3x")}
        </span>
        <TabStrip tabs={tabDefs} active={activeKey} onChange={setActiveKey} />
      </div>

      <div className="px-5 py-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="rounded bg-gray-alpha-200 px-2 py-0.5 text-[13px] font-semibold text-ds-text-secondary">
              {currentTab.shortLabel}
            </span>
            <span className="text-[14px] font-semibold text-ds-text">
              {currentTab.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <MetaBadge label="ms" value={currentTab.latencyMs} />
            <MetaBadge label="tok" value={currentTab.totalTokens} />
          </div>
        </div>

        <div
          className="rounded-xl border border-gray-alpha-200 bg-gray-alpha-100 px-4 py-3"
        >
          <MarkdownRenderer content={currentTab.text} />
        </div>

        {isSelfConsistency ? (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[13px] text-ds-text-tertiary">
              {t("msg.run")} {Math.max(1, activeIndex + 1)} / {tabs.length}
            </span>
            <SelectBestButton
              accentRgb={currentTab.accentRgb}
              onClick={() => onSelectBest(currentTab)}
            />
          </div>
        ) : (
          <div className="mt-4 flex justify-end">
            <SelectBestButton
              accentRgb={currentTab.accentRgb}
              onClick={() => onSelectBest(currentTab)}
            />
          </div>
        )}
      </div>
    </Card>
  );
}
