"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, GitFork } from "lucide-react";
import { useChatStore } from "@/lib/store/chatStore";
import { useTranslation } from "@/lib/store/i18nStore";
import { UserMessageBubble } from "@/components/chat/messages/UserMessage";
import { AssistantMessage } from "@/components/chat/messages/AssistantMessage";
import { AssistantThinkingState } from "@/components/chat/messages/AssistantThinkingState";
import { CompareTabs } from "@/components/chat/messages/CompareTabs";
import { SelfConsistencyTabs } from "@/components/chat/messages/SelfConsistencyTabs";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { PROJECT_COLOR_ICON_CLASSES } from "@/components/projects/projectTheme";
import { Skeleton } from "@/components/ui/skeleton";

interface MessageListProps {
  showRaw?: boolean;
  loading?: boolean;
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
  loading = false,
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
  const chats = useChatStore((s) => s.chats);
  const isSending = useChatStore((s) => s.isSending);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const messagesError = useChatStore((s) => s.messagesError);
  const pendingFocusMessageId = useChatStore((s) => s.pendingFocusMessageId);
  const clearPendingFocusMessageId = useChatStore((s) => s.clearPendingFocusMessageId);
  const selectChat = useChatStore((s) => s.selectChat);
  const { t } = useTranslation();
  const latestAssistantId =
    [...messages].reverse().find((message) => message.role === "assistant")?.id ?? null;
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;
  const parentChat = activeChat?.parent_chat_id
    ? chats.find((chat) => chat.id === activeChat.parent_chat_id) ?? null
    : null;
  const parentChatTitle =
    activeChat?.parent_chat_title ??
    parentChat?.title ??
    t("chat.originalChatFallback");
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
          {loading && (
            <ChatAreaSkeleton />
          )}

          {/* Empty hint */}
          {!loading && activeChat?.parent_chat_id && (
            <div className="flex items-center gap-2 border-l border-ds-border-subtle pl-3 text-[14px] leading-5 text-ds-text-secondary">
              <GitFork
                size={18}
                strokeWidth={2}
                className={`shrink-0 ${PROJECT_COLOR_ICON_CLASSES.green}`}
                aria-hidden="true"
              />
              <span>{t("chat.forkedFrom")}</span>
              <button
                type="button"
                className="min-w-0 truncate font-medium text-ds-text-secondary underline-offset-4 hover:text-ds-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-ring"
                onClick={() => void selectChat(activeChat.parent_chat_id as string)}
              >
                {parentChatTitle}
              </button>
            </div>
          )}

          {!loading && messages.length === 0 && !isSending && emptyHint && !messagesError && (
            <div className="flex h-40 items-center justify-center">
              <div className="text-center text-[15px] text-ds-text-tertiary">
                {emptyHint.split("\n").map((line, index) => (
                  <p
                    key={`${line}-${index}`}
                    className={index === 0 ? undefined : "mt-1 opacity-60"}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>
          )}

          {!loading && messagesError && (
            <ErrorState
              centered
              title={t("chat.loadErrorTitle")}
              description={messagesError}
              actionLabel={activeChatId ? t("common.retry") : undefined}
              onAction={activeChatId ? () => void selectChat(activeChatId) : undefined}
              className="rounded-2xl"
            />
          )}

          {!loading && messages.map((m, idx) => {
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
            aria-label={t("chat.scrollToBottom")}
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

function ChatAreaSkeleton() {
  const rows = [
    { align: "end", bubbleW: 312, bubbleH: 48 },
    { align: "start", bubbleW: 530, bubbleH: 72 },
    { align: "end", bubbleW: 256, bubbleH: 48 },
    { align: "start", bubbleW: 468, bubbleH: 88 },
  ] as const;

  return (
    <div className="space-y-6">
      {rows.map((row, index) => (
        <div
          key={index}
          className={row.align === "end" ? "flex justify-end" : "flex justify-start"}
        >
          <Skeleton
            height={row.bubbleH}
            width={row.bubbleW}
            className="max-w-full rounded-2xl"
          />
        </div>
      ))}
    </div>
  );
}

export const MessageList = memo(MessageListComponent);
MessageList.displayName = "MessageList";
