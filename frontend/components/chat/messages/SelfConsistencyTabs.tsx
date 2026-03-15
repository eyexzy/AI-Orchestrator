"use client";

import { useCallback } from "react";
import { useChatStore } from "@/lib/store/chatStore";
import type { SelfConsistencyRun } from "@/lib/store/chatStore";
import { SC_ACCENTS } from "./MessageUI";
import { MultiResponseCard, type ResponseTab } from "./MultiResponseCard";

export function SelfConsistencyTabs({
  messageId,
  modelLabel,
  runs,
}: {
  messageId: string | number;
  modelLabel: string;
  runs: SelfConsistencyRun[];
}) {
  const { resolveMultiResponse } = useChatStore();

  const tabs: ResponseTab[] = runs.map((run, i) => {
    const accentRgb = SC_ACCENTS[i] ?? SC_ACCENTS[SC_ACCENTS.length - 1];
    return {
      key: String(i),
      label: modelLabel,
      shortLabel: String(i + 1),
      accentRgb,
      text: run.text,
      latencyMs: run.latency_ms,
      totalTokens: run.total_tokens,
    };
  });

  const handleSelectBest = useCallback(
    (tab: ResponseTab) => {
      const idx = Number(tab.key);
      const run = runs[idx];
      if (!run) return;
      resolveMultiResponse(messageId, run.text, {
        model: modelLabel,
        modelLabel,
        tokens: run.total_tokens,
        latency_ms: run.latency_ms,
        run: idx + 1,
      });
    },
    [messageId, modelLabel, resolveMultiResponse, runs],
  );

  return (
    <MultiResponseCard
      mode="self-consistency"
      messageId={messageId}
      tabs={tabs}
      onSelectBest={handleSelectBest}
    />
  );
}
