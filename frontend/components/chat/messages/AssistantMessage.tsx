"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useChatStore } from "@/lib/store/chatStore";
import { useTranslation } from "@/lib/store/i18nStore";
import { trackEvent } from "@/lib/eventTracker";
import { CodeSurface, MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { Note } from "@/components/ui/note";
import { AssistantActionBar } from "./MessageUI";
import { Button } from "@/components/ui/button";
import {
  AssistantGenerationBottom,
  AssistantGenerationTop,
} from "./GenerationTrace";

export function AssistantMessage({
  messageId,
  content,
  metadata,
  showRaw,
  isError = false,
  isStreaming = false,
  canContinue = false,
}: {
  messageId: string | number;
  content: string;
  metadata?: Record<string, unknown>;
  showRaw: boolean;
  isError?: boolean;
  isStreaming?: boolean;
  canContinue?: boolean;
}) {
  const { regenerateLastResponse: regenerate } = useChatStore();
  const continueAssistantMessage = useChatStore((s) => s.continueAssistantMessage);
  const { t } = useTranslation();
  const [displayedContent, setDisplayedContent] = useState(content);
  const targetContentRef = useRef(content);
  const displayedContentRef = useRef(content);
  const streamFrameRef = useRef<number | null>(null);

  const regenerateLastResponse = () => {
    trackEvent("backtracking_detected", { trigger: "regenerate" });
    regenerate();
  };

  const continueGeneration = () => {
    trackEvent("backtracking_detected", { trigger: "continue_generation" });
    void continueAssistantMessage(messageId);
  };

  useEffect(() => {
    targetContentRef.current = content;
    if (!isStreaming) {
      if (streamFrameRef.current !== null) {
        window.cancelAnimationFrame(streamFrameRef.current);
        streamFrameRef.current = null;
      }
      displayedContentRef.current = content;
      setDisplayedContent(content);
      return;
    }

    const animate = () => {
      const target = targetContentRef.current;
      const current = displayedContentRef.current;

      if (current === target) {
        streamFrameRef.current = null;
        return;
      }

      const backlog = target.length - current.length;
      const step =
        backlog > 2400 ? 72 :
        backlog > 1400 ? 44 :
        backlog > 700 ? 26 :
        backlog > 260 ? 14 :
        backlog > 90 ? 8 : 4;

      const next = target.slice(0, Math.min(target.length, current.length + step));
      displayedContentRef.current = next;
      setDisplayedContent(next);
      streamFrameRef.current = window.requestAnimationFrame(animate);
    };

    if (streamFrameRef.current === null) {
      streamFrameRef.current = window.requestAnimationFrame(animate);
    }

    return () => {
      if (streamFrameRef.current !== null) {
        window.cancelAnimationFrame(streamFrameRef.current);
        streamFrameRef.current = null;
      }
    };
  }, [content, isStreaming]);

  useEffect(() => {
    return () => {
      if (streamFrameRef.current !== null) {
        window.cancelAnimationFrame(streamFrameRef.current);
      }
    };
  }, []);

  const visibleContent = isStreaming ? displayedContent : content;

  return (
    <div className="group w-full min-w-0">
      {!isError && (
        <AssistantGenerationTop
          metadata={metadata}
          isStreaming={isStreaming}
          className="mb-3"
        />
      )}

      {isError ? (
        <Note
          variant="error"
          action={
            <Button
              type="button"
              variant="default"
              size="sm"
              leftIcon={<RotateCcw size={14} strokeWidth={2} />}
              onClick={regenerateLastResponse}
            >
              {t("chat.retrySend")}
            </Button>
          }
        >
          <MarkdownRenderer content={visibleContent} />
        </Note>
      ) : (
        <MarkdownRenderer content={visibleContent} />
      )}

      {!isError && !isStreaming && (
        <AssistantGenerationBottom metadata={metadata} className="mt-4" />
      )}

      {showRaw && metadata && (
        <details className="mt-2.5">
          <summary className="cursor-pointer select-none rounded-md pb-1.5 font-mono text-[13px] text-ds-text-tertiary transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-alpha-400">
            json
          </summary>
          <div className="overflow-hidden rounded-md border border-gray-alpha-400 bg-background-100">
            <CodeSurface
              language="json"
              code={JSON.stringify(metadata, null, 2)}
              showLineNumbers={false}
              selectableLines={false}
              padding="16px 20px"
            />
          </div>
        </details>
      )}

      <AssistantActionBar
        content={content}
        onRegenerate={regenerateLastResponse}
        onContinue={continueGeneration}
        canContinue={canContinue && !isStreaming && !isError}
      />
    </div>
  );
}
