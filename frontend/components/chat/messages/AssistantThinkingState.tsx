"use client";

import { memo } from "react";
import { AssistantGenerationTop } from "./GenerationTrace";

function AssistantThinkingStateComponent({
  metadata,
}: {
  metadata?: Record<string, unknown>;
}) {
  return (
    <AssistantGenerationTop
      metadata={metadata}
      isStreaming
      className="assistant-thinking"
    />
  );
}

export const AssistantThinkingState = memo(AssistantThinkingStateComponent);
AssistantThinkingState.displayName = "AssistantThinkingState";
