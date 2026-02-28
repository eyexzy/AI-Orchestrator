"use client";

import { useChatStore } from "@/lib/store/chatStore";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { AssistantActionBar } from "./MessageUI";

/* ─────────────────────────────────────────────────────────────────
 *  Normal assistant message
 * ────────────────────────────────────────────────────────────── */
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

  return (
    <div className="group min-w-0" style={{ maxWidth: "min(85%, 680px)" }}>
      <MarkdownRenderer content={content} />

      {metadata && (
        <div
          className="mt-1.5 flex flex-wrap gap-2 font-mono text-[10px]"
          style={{ color: "rgb(var(--text-3))" }}
        >
          {metadata.model      != null && <span>{String(metadata.model)}</span>}
          {metadata.tokens     != null && <><span>·</span><span>{String(metadata.tokens)} tok</span></>}
          {metadata.latency_ms != null && <><span>·</span><span>{String(metadata.latency_ms)} ms</span></>}
        </div>
      )}

      {showRaw && metadata && (
        <details className="mt-2">
          <summary
            className="cursor-pointer font-mono text-[10px] transition-opacity hover:opacity-80 select-none"
            style={{ color: "rgb(var(--text-3))" }}
          >
            json
          </summary>
          <pre
            className="mt-1 max-h-[240px] overflow-auto rounded-xl px-4 py-3 font-mono text-[10px] leading-relaxed"
            style={{
              background: "rgba(255,255,255,0.03)",
              color: "rgb(var(--text-2))",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {JSON.stringify(metadata, null, 2)}
          </pre>
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
