"use client";

import { useChatStore } from "@/lib/store/chatStore";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { MarkdownRenderer, CODE_THEME } from "@/components/chat/MarkdownRenderer";
import { AssistantActionBar } from "./MessageUI";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";

/* Normal assistant message */
export function AssistantMessage({
  content,
  metadata,
  showRaw,
}: {
  content: string;
  metadata?: Record<string, unknown>;
  showRaw: boolean;
}) {
  const { regenerateLastResponse } = useChatStore();
  const level = useUserLevelStore((s) => s.level);

  return (
    <div className="group min-w-0 max-w-[min(85%,680px)]">
      <MarkdownRenderer content={content} />

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
            <SyntaxHighlighter
              language="json"
              style={CODE_THEME as any}
              PreTag="div"
              showLineNumbers={false}
              wrapLines={false}
              customStyle={{
                margin: 0,
                padding: "16px 20px",
                backgroundColor: "transparent",
              }}
            >
              {JSON.stringify(metadata, null, 2)}
            </SyntaxHighlighter>
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