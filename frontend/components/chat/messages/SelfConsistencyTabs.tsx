"use client";

import { useState, useCallback } from "react";
import { useChatStore } from "@/lib/store/chatStore";
import type { SelfConsistencyRun } from "@/lib/store/chatStore";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import {
  SC_ACCENTS,
  SC_RUN_LABELS,
  MetaBadge,
  TabStrip,
  SelectBestButton,
} from "./MessageUI";
import type { TabDef } from "./MessageUI";

/* ─────────────────────────────────────────────────────────────────
 *  Self-Consistency tabbed block
 * ────────────────────────────────────────────────────────────── */
export function SelfConsistencyTabs({
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
