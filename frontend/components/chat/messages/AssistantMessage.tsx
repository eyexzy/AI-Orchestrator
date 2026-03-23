"use client";

import { useChatStore } from "@/lib/store/chatStore";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { useTranslation } from "@/lib/store/i18nStore";
import { trackEvent } from "@/lib/eventTracker";
import { CodeSurface, MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { Note } from "@/components/ui/note";
import { AssistantActionBar } from "./MessageUI";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

/* Normal assistant message */
export function AssistantMessage({
  content,
  metadata,
  showRaw,
  isError = false,
}: {
  content: string;
  metadata?: Record<string, unknown>;
  showRaw: boolean;
  isError?: boolean;
}) {
  const { regenerateLastResponse: _regenerate } = useChatStore();
  const level = useUserLevelStore((s) => s.level);
  const { t } = useTranslation();

  const regenerateLastResponse = () => {
    trackEvent("backtracking_detected", { trigger: "regenerate" });
    _regenerate();
  };

  return (
    <div className="group min-w-0 max-w-[min(85%,680px)]">
      {isError ? (
        <Note variant="error" size="sm" className="rounded-2xl">
          <MarkdownRenderer content={content} />
        </Note>
      ) : (
        <MarkdownRenderer content={content} />
      )}

      {isError && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          leftIcon={<RotateCcw size={14} strokeWidth={2} />}
          onClick={regenerateLastResponse}
        >
          {t("chat.retrySend")}
        </Button>
      )}

      {level >= 2 && metadata && (
        <div className="mt-2.5 flex flex-wrap gap-2.5 font-mono text-[12px] text-ds-text-tertiary">
          {metadata.model != null && <span>{String(metadata.model)}</span>}
          {metadata.tokens != null && <><span>·</span><span>{String(metadata.tokens)} tok</span></>}
          {metadata.latency_ms != null && <><span>·</span><span>{String(metadata.latency_ms)} ms</span></>}
        </div>
      )}

      {showRaw && metadata && (
        <details className="mt-2.5">
          <summary className="cursor-pointer font-mono text-[13px] transition-opacity hover:opacity-80 select-none text-ds-text-tertiary pb-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-alpha-400 rounded-md">
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

      {/* Action bar */}
      <AssistantActionBar
        content={content}
        onRegenerate={regenerateLastResponse}
      />
    </div>
  );
}