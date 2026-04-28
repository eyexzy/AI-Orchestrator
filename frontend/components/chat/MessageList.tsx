"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { useChatStore } from "@/lib/store/chatStore";
import { useTranslation } from "@/lib/store/i18nStore";
import { UserMessageBubble } from "@/components/chat/messages/UserMessage";
import { AssistantMessage } from "@/components/chat/messages/AssistantMessage";
import { AssistantThinkingState } from "@/components/chat/messages/AssistantThinkingState";
import { CompareTabs } from "@/components/chat/messages/CompareTabs";
import { SelfConsistencyTabs } from "@/components/chat/messages/SelfConsistencyTabs";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";

interface MessageListProps {
  showRaw?: boolean;
  emptyHint?: string;
  floatingInputOffset?: number;
  topOverlayOffset?: number;
}

const BOTTOM_STICK_THRESHOLD = 24;
const SHOW_SCROLL_TO_BOTTOM_THRESHOLD = 120;
const SCROLL_TO_BOTTOM_INPUT_GAP = 12;
const SCROLL_TO_BOTTOM_OFFSET_ADJUSTMENT = 16;

/* Main MessageList */
const MessageListComponent = ({
  showRaw = false,
  emptyHint,
  floatingInputOffset = 0,
  topOverlayOffset = 0,
}: MessageListProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const releaseProgrammaticScrollRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef(0);
  const programmaticScrollRef = useRef(false);
  const messages = useChatStore((s) => s.messages);
  const isSending = useChatStore((s) => s.isSending);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const messagesError = useChatStore((s) => s.messagesError);
  const pendingFocusMessageId = useChatStore((s) => s.pendingFocusMessageId);
  const clearPendingFocusMessageId = useChatStore((s) => s.clearPendingFocusMessageId);
  const selectChat = useChatStore((s) => s.selectChat);
  const { t } = useTranslation();
  const latestAssistantId =
    [...messages].reverse().find((message) => message.role === "assistant")?.id ?? null;
  const messageRefs = useRef(new Map<string | number, HTMLDivElement>());
  const stickToBottomRef = useRef(true);
  const prevIsSendingRef = useRef(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const syncScrollState = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const currentScrollTop = Math.min(Math.max(0, container.scrollTop), maxScrollTop);
    const distanceFromBottom = maxScrollTop - currentScrollTop;
    const userScrolledUp = currentScrollTop < lastScrollTopRef.current - 1;
    let shouldStick = stickToBottomRef.current;

    if (distanceFromBottom <= BOTTOM_STICK_THRESHOLD) {
      shouldStick = true;
    } else if (programmaticScrollRef.current) {
      shouldStick = stickToBottomRef.current;
    } else if (userScrolledUp) {
      shouldStick = false;
    }

    lastScrollTopRef.current = currentScrollTop;
    stickToBottomRef.current = shouldStick;
    setShowScrollToBottom(
      !shouldStick &&
        distanceFromBottom > SHOW_SCROLL_TO_BOTTOM_THRESHOLD &&
        messages.length > 0,
    );
  }, [messages.length]);

  const scheduleScrollToBottom = useCallback(
    (force = false) => {
      const container = scrollRef.current;
      if (!container) return;
      if (!force && !stickToBottomRef.current) return;

      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }

      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        programmaticScrollRef.current = true;
        const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
        container.scrollTop = maxScrollTop;
        lastScrollTopRef.current = maxScrollTop;

        if (releaseProgrammaticScrollRef.current !== null) {
          window.cancelAnimationFrame(releaseProgrammaticScrollRef.current);
        }
        releaseProgrammaticScrollRef.current = window.requestAnimationFrame(() => {
          releaseProgrammaticScrollRef.current = null;
          programmaticScrollRef.current = false;
          syncScrollState();
        });

        syncScrollState();
      });
    },
    [syncScrollState],
  );

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    syncScrollState();
    container.addEventListener("scroll", syncScrollState, { passive: true });
    return () => container.removeEventListener("scroll", syncScrollState);
  }, [syncScrollState]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      scheduleScrollToBottom();
    });

    observer.observe(content);
    return () => observer.disconnect();
  }, [scheduleScrollToBottom]);

  useEffect(() => {
    const startedSending = isSending && !prevIsSendingRef.current;
    prevIsSendingRef.current = isSending;

    if (!startedSending) return;

    stickToBottomRef.current = true;
    setShowScrollToBottom(false);
    scheduleScrollToBottom(true);
  }, [isSending, scheduleScrollToBottom]);

  useEffect(() => {
    scheduleScrollToBottom();
  }, [messages, scheduleScrollToBottom]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
      if (releaseProgrammaticScrollRef.current !== null) {
        window.cancelAnimationFrame(releaseProgrammaticScrollRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (pendingFocusMessageId == null) {
      return;
    }

    const target = messageRefs.current.get(pendingFocusMessageId);
    if (!target) {
      clearPendingFocusMessageId();
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    clearPendingFocusMessageId();
  }, [pendingFocusMessageId, messages, clearPendingFocusMessageId]);

  const scrollToBottom = () => {
    stickToBottomRef.current = true;
    setShowScrollToBottom(false);
    scheduleScrollToBottom(true);
  };
  const scrollToBottomBottomOffset =
    floatingInputOffset > 0
      ? Math.max(
          floatingInputOffset - SCROLL_TO_BOTTOM_OFFSET_ADJUSTMENT,
          SCROLL_TO_BOTTOM_INPUT_GAP,
        )
      : SCROLL_TO_BOTTOM_INPUT_GAP;

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={scrollRef}
        className="message-scroll h-full"
        style={{
          ...(topOverlayOffset > 0 ? { scrollPaddingTop: `calc(1.5rem + ${topOverlayOffset}px)` } : null),
          ...(floatingInputOffset > 0
            ? { scrollPaddingBottom: `calc(1.5rem + ${floatingInputOffset}px)` }
            : null),
        }}
      >
        <div
          ref={contentRef}
          className="mx-auto w-full max-w-[42rem] px-6 py-6 space-y-6"
          style={{
            ...(topOverlayOffset > 0 ? { paddingTop: `calc(1.5rem + ${topOverlayOffset}px)` } : null),
            ...(floatingInputOffset > 0
              ? { paddingBottom: `calc(1.5rem + ${floatingInputOffset}px)` }
              : null),
          }}
        >
          {/* Empty hint */}
          {messages.length === 0 && !isSending && emptyHint && !messagesError && (
            <div className="flex h-40 items-center justify-center">
              <p
                className="text-center text-[15px] text-ds-text-tertiary"
                dangerouslySetInnerHTML={{ __html: emptyHint }}
              />
            </div>
          )}

          {messagesError && (
            <ErrorState
              centered
              title={t("chat.loadErrorTitle")}
              description={messagesError}
              actionLabel={activeChatId ? t("common.retry") : undefined}
              onAction={activeChatId ? () => void selectChat(activeChatId) : undefined}
              className="rounded-2xl"
            />
          )}

          {messages.map((m, idx) => {
            const isAssistant = m.role === "assistant";
            const isThinking =
              isAssistant &&
              m.isOptimistic === true &&
              !m.isError &&
              !m.content?.trim();
            const isLast = idx === messages.length - 1;
            const isGenerating = isAssistant && isSending && isLast;
            const generationSummary =
              m.metadata &&
              typeof m.metadata === "object" &&
              m.metadata !== null &&
              typeof (m.metadata as Record<string, unknown>).generation_summary === "object" &&
              (m.metadata as Record<string, unknown>).generation_summary !== null
                ? ((m.metadata as Record<string, unknown>).generation_summary as Record<string, unknown>)
                : null;
            const canContinue =
              Boolean(generationSummary?.can_continue) ||
              Boolean(generationSummary?.truncated) ||
              Boolean(m.metadata?.generation_stopped);

            return (
              <div
                key={m.id}
                ref={(node) => {
                  if (node) {
                    messageRefs.current.set(m.id, node);
                    return;
                  }
                  messageRefs.current.delete(m.id);
                }}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-in`}
                style={isThinking ? { marginTop: "0.875rem" } : undefined}
              >
                {m.role === "user" ? (
                  <UserMessageBubble
                    id={m.id}
                    content={m.content}
                    isOptimistic={m.isOptimistic}
                    attachments={m.attachments}
                  />
                ) : (
                  <div className="w-full min-w-0">
                    {isThinking ? (
                      <AssistantThinkingState metadata={m.metadata} />
                    ) : m.isSelfConsistency && m.selfConsistency ? (
                      <SelfConsistencyTabs
                        messageId={m.id}
                        modelLabel={m.selfConsistency.modelLabel}
                        runs={m.selfConsistency.runs}
                      />
                    ) : m.comparison ? (
                      <CompareTabs
                        messageId={m.id}
                        modelA={m.comparison.modelA}
                        modelB={m.comparison.modelB}
                      />
                    ) : (
                      <AssistantMessage
                        messageId={m.id}
                        content={m.content}
                        metadata={m.metadata}
                        showRaw={showRaw}
                        isError={m.isError}
                        isStreaming={isGenerating}
                        canContinue={canContinue && latestAssistantId === m.id}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div
        className={`pointer-events-none absolute bottom-0 left-0 z-30 flex w-full justify-center transition-all duration-300 ease-out ${
          showScrollToBottom ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
        }`}
        style={{ bottom: scrollToBottomBottomOffset }}
      >
        <div className="scroll-to-bottom-float">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            shape="rounded"
            iconOnly
            aria-label="Scroll to bottom"
            className={`transition-[border-color,background,color,transform,opacity] duration-200 ${
              showScrollToBottom ? "pointer-events-auto" : "pointer-events-none"
            }`}
            onClick={scrollToBottom}
          >
            <ArrowDown size={16} strokeWidth={2} />
          </Button>
        </div>
      </div>
    </div>
  );
};

export const MessageList = memo(MessageListComponent);
MessageList.displayName = "MessageList";
