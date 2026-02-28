"use client";

import { useState, useCallback } from "react";
import { useChatStore } from "@/lib/store/chatStore";
import type { CompareResult } from "@/lib/store/chatStore";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import {
  COMPARE_ACCENTS,
  COMPARE_LABELS,
  MetaBadge,
  TabStrip,
  SelectBestButton,
} from "./MessageUI";
import type { TabDef } from "./MessageUI";

/* ─────────────────────────────────────────────────────────────────
 *  Compare tabbed block
 * ────────────────────────────────────────────────────────────── */
export function CompareTabs({
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
