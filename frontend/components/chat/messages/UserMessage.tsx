"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Pencil,
  Copy,
  Check,
  X,
  Send,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useChatStore } from "@/lib/store/chatStore";
import { useTranslation } from "@/lib/store/i18nStore";
import { trackEvent } from "@/lib/eventTracker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ActionBtn } from "./MessageUI";

const COLLAPSE_HEIGHT = 300;

export function UserMessageBubble({
  id,
  content,
  isOptimistic,
}: {
  id: string | number;
  content: string;
  isOptimistic?: boolean;
}) {
  const { t } = useTranslation();
  const { editAndResend, isSending } = useChatStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflow, setIsOverflow] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (el) setIsOverflow(el.scrollHeight > COLLAPSE_HEIGHT);
  }, [content]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editing]);

  const handleAutoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const handleSave = () => {
    const trimmed = draft.trim();
    if (!trimmed || isSending) return;
    setEditing(false);
    trackEvent("backtracking_detected", { trigger: "edit_and_resend" });
    editAndResend(id, trimmed);
  };

  const handleCancel = () => {
    setDraft(content);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSave(); }
    if (e.key === "Escape") handleCancel();
  };

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silent */ }
  }, [content]);

  if (editing) {
    return (
      <div className="w-full max-w-3xl">
        <Textarea
          ref={textareaRef}
          variant="default"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); handleAutoResize(); }}
          onKeyDown={handleKeyDown}
          rows={1}
          wrapperClassName="rounded-xl"
          textareaClassName="chat-input-textarea w-full resize-none rounded-xl px-6 py-4 text-base leading-relaxed overflow-hidden"
        />
        <div className="mt-2.5 flex items-center justify-end gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCancel}
            leftIcon={<X size={14} strokeWidth={2} />}
          >
            {t("msg.cancel")}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={!draft.trim() || isSending}
            leftIcon={<Send size={14} strokeWidth={2} />}
          >
            {t("msg.update")}
          </Button>
        </div>
      </div>
    );
  }

  const collapsed = isOverflow && !expanded;

  return (
    <div className="group flex flex-col items-end w-full">
      <div
        className={`relative max-w-[85%] sm:max-w-[600px] rounded-2xl bg-gray-200 px-5 py-3 text-[15px] leading-relaxed text-foreground ${isOptimistic ? "opacity-60" : ""}`}
      >
        <div
          ref={contentRef}
          className={cn(
            "whitespace-pre-wrap [word-break:break-word]",
            collapsed && "line-clamp-[12] overflow-hidden"
          )}
          style={collapsed ? { display: '-webkit-box', WebkitBoxOrient: 'vertical' } : {}}
        >
          {content}
        </div>

        {isOverflow && (
          <div className="mt-4 flex justify-center w-full">
            <Button
              variant="secondary"
              size="sm"
              shape="rounded"
              onClick={() => setExpanded(!expanded)}
              leftIcon={expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              className="bg-background-100 border-gray-alpha-400 text-ds-text font-medium"
            >
              {expanded ? t("msg.showLess") : t("msg.showMore")}
            </Button>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <ActionBtn onClick={handleCopy} label={copied ? t("msg.copied") : t("msg.copy")}>
          {copied
            ? <Check size={14} strokeWidth={2} />
            : <Copy size={14} strokeWidth={2} />
          }
        </ActionBtn>
        <ActionBtn onClick={() => { setDraft(content); setEditing(true); }} label={t("msg.edit")}>
          <Pencil size={14} strokeWidth={2} />
        </ActionBtn>
      </div>
    </div>
  );
}
