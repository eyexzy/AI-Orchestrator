"use client";

import { memo, useRef, useEffect } from "react";
import { useChatStore } from "@/lib/store/chatStore";
import { UserMessageBubble } from "@/components/chat/messages/UserMessage";
import { AssistantMessage } from "@/components/chat/messages/AssistantMessage";
import { CompareTabs } from "@/components/chat/messages/CompareTabs";
import { SelfConsistencyTabs } from "@/components/chat/messages/SelfConsistencyTabs";

interface MessageListProps {
  showRaw?: boolean;
  emptyHint?: string;
  floatingInputOffset?: number;
}

/* Main MessageList */
const MessageListComponent = ({
  showRaw = false,
  emptyHint,
  floatingInputOffset = 0,
}: MessageListProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = useChatStore((s) => s.messages);
  const isSending = useChatStore((s) => s.isSending);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isSending]);

  return (
    <div ref={scrollRef} className="message-scroll">
      <div
        className="mx-auto w-full max-w-3xl px-6 py-6 space-y-6"
        style={floatingInputOffset > 0 ? { paddingBottom: floatingInputOffset } : undefined}
      >
        {/* Empty hint */}
        {messages.length === 0 && !isSending && emptyHint && (
          <div className="flex h-40 items-center justify-center">
            <p
              className="text-center text-[15px] text-ds-text-tertiary"
              dangerouslySetInnerHTML={{ __html: emptyHint }}
            />
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            id={`msg-${m.id}`}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-in`}
          >
            {m.role === "user" ? (
              /* User message */
              <UserMessageBubble
                id={m.id}
                content={m.content}
                isOptimistic={m.isOptimistic}
              />

            ) : m.isSelfConsistency && m.selfConsistency ? (
              /* Self-Consistency block */
              <div className="w-full">
                <SelfConsistencyTabs
                  messageId={m.id}
                  modelLabel={m.selfConsistency.modelLabel}
                  runs={m.selfConsistency.runs}
                />
              </div>

            ) : m.comparison ? (
              /* Compare block */
              <div className="w-full">
                <CompareTabs
                  messageId={m.id}
                  modelA={m.comparison.modelA}
                  modelB={m.comparison.modelB}
                />
              </div>

            ) : (
              /* Normal assistant message */
              <AssistantMessage
                content={m.content}
                metadata={m.metadata}
                showRaw={showRaw}
              />
            )}
          </div>
        ))}

        {/* Typing indicator */}
        {isSending && (
          <div className="flex justify-start animate-in">
            <div className="flex items-center gap-1.5 px-1 py-3">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="h-1.5 w-1.5 rounded-full bg-gray-alpha-400"
                  style={{
                    animation: `pulse-dot 1.2s ${d}ms infinite`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const MessageList = memo(MessageListComponent);
MessageList.displayName = "MessageList";