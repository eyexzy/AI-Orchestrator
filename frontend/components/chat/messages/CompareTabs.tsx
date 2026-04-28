"use client";

import { useCallback } from "react";
import { useChatStore } from "@/lib/store/chatStore";
import type { CompareResult } from "@/lib/store/chatStore";
import { COMPARE_ACCENTS, COMPARE_LABELS } from "./MessageUI";
import { MultiResponseCard, type ResponseTab } from "./MultiResponseCard";

export function CompareTabs({
  messageId,
  modelA,
  modelB,
}: {
  messageId: string | number;
  modelA: CompareResult;
  modelB: CompareResult;
}) {
  const { resolveMultiResponse } = useChatStore();

  const tabs: ResponseTab[] = [
    {
      key: "A",
      label: modelA.modelLabel,
      shortLabel: COMPARE_LABELS[0],
      accentRgb: COMPARE_ACCENTS[0],
      text: modelA.text,
      latencyMs: modelA.latency_ms,
      totalTokens: modelA.total_tokens,
    },
    {
      key: "B",
      label: modelB.modelLabel,
      shortLabel: COMPARE_LABELS[1],
      accentRgb: COMPARE_ACCENTS[1],
      text: modelB.text,
      latencyMs: modelB.latency_ms,
      totalTokens: modelB.total_tokens,
    },
  ];

  const handleSelectBest = useCallback(
    (tab: ResponseTab) => {
      const source = tab.key === "A" ? modelA : modelB;
      resolveMultiResponse(messageId, source.text, {
        model: source.model,
        modelLabel: source.modelLabel,
        tokens: source.total_tokens,
        latency_ms: source.latency_ms,
        generation_summary: {
          duration_ms: source.latency_ms,
          first_token_ms: source.latency_ms,
          estimated_tokens: source.total_tokens,
          model_label: source.modelLabel,
        },
      });
    },
    [messageId, modelA, modelB, resolveMultiResponse],
  );

  return (
    <MultiResponseCard
      mode="compare"
      messageId={messageId}
      tabs={tabs}
      onSelectBest={handleSelectBest}
    />
  );
}
