"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Pencil, Copy, Check, X, Send,
  ChevronDown, ChevronUp, GitBranchPlus,
} from "lucide-react";
import { useChatStore } from "@/lib/store/chatStore";
import type { MessageAttachment } from "@/lib/store/chatStore";
import { useTranslation } from "@/lib/store/i18nStore";
import { trackEvent } from "@/lib/eventTracker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentChip } from "@/components/ui/attachment-chip";
import { FilePreviewModal } from "@/components/ui/file-preview-modal";
import type { AttachmentChipData } from "@/components/ui/attachment-chip";
import { cn } from "@/lib/utils";
import { ActionBtn } from "./MessageUI";

const COLLAPSE_HEIGHT = 300;
const EDIT_TEXTAREA_MAX_HEIGHT = 240;

function toChipData(att: MessageAttachment): AttachmentChipData {
  return {
    id: att.id,
    filename: att.filename,
    mimeType: att.mimeType,
    previewUrl: att.previewUrl,
  };
}

export function UserMessageBubble({
  id,
  content,
  isOptimistic,
  attachments,
}: {
  id: string | number;
  content: string;
  isOptimistic?: boolean;
  attachments?: MessageAttachment[];
}) {
  const { t } = useTranslation();
  const { editAndResend, forkChatFromMessage, isSending } = useChatStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflow, setIsOverflow] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [previewChip, setPreviewChip] = useState<AttachmentChipData | null>(null);

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
      const nextHeight = Math.min(el.scrollHeight, EDIT_TEXTAREA_MAX_HEIGHT);
      el.style.height = `${nextHeight}px`;
      el.style.overflowY = el.scrollHeight > EDIT_TEXTAREA_MAX_HEIGHT ? "auto" : "hidden";
    }
  }, [editing]);

  const handleAutoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(el.scrollHeight, EDIT_TEXTAREA_MAX_HEIGHT);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > EDIT_TEXTAREA_MAX_HEIGHT ? "auto" : "hidden";
  };

  const handleSave = () => {
    const trimmed = draft.trim();
    if (!trimmed || isSending) return;
    setEditing(false);
    trackEvent("backtracking_detected", { trigger: "edit_and_resend" });
    editAndResend(id, trimmed, attachments);
  };

  const handleCancel = () => { setDraft(content); setEditing(false); };

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

  const chips = attachments?.map(toChipData) ?? [];

  if (editing) {
    return (
      <div className="w-full max-w-[42rem]">
        <Textarea
          ref={textareaRef}
          variant="default"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); handleAutoResize(); }}
          onKeyDown={handleKeyDown}
          rows={1}
          wrapperClassName="rounded-xl"
          textareaClassName="chat-input-textarea w-full resize-none rounded-xl px-6 py-4 text-base leading-relaxed overflow-y-auto"
        />
        <div className="mt-2.5 flex items-center justify-end gap-2.5">
          <Button variant="secondary" size="sm" onClick={handleCancel} leftIcon={<X size={14} strokeWidth={2} />}>
            {t("msg.cancel")}
          </Button>
          <Button variant="default" size="sm" onClick={handleSave} disabled={!draft.trim() || isSending}
            leftIcon={<Send size={14} strokeWidth={2} />}>
            {t("msg.update")}
          </Button>
        </div>
      </div>
    );
  }

  const collapsed = isOverflow && !expanded;

  return (
    <>
      <FilePreviewModal chip={previewChip} onClose={() => setPreviewChip(null)} />

      <div className="group flex flex-col items-end w-full">
        {/* Attachments — directly above the bubble, right-aligned */}
        {chips.length > 0 && (
          <div className="mb-1 flex flex-wrap justify-end gap-1.5 max-w-[85%] sm:max-w-[600px]">
            {chips.map((chip) => (
              <AttachmentChip
                key={chip.id}
                chip={chip}
                removable={false}
                onClick={setPreviewChip}
              />
            ))}
          </div>
        )}

        {/* Text bubble */}
        {content.trim() && (
          <div
            className="relative max-w-[85%] sm:max-w-[600px] rounded-2xl bg-gray-200 dark:bg-gray-alpha-200 px-5 py-3 text-[15px] leading-relaxed text-foreground"
          >
            <div
              ref={contentRef}
              className={cn("whitespace-pre-wrap [word-break:break-word]", collapsed && "line-clamp-[12] overflow-hidden")}
              style={collapsed ? { display: "-webkit-box", WebkitBoxOrient: "vertical" } : {}}
            >
              {content}
            </div>

            {isOverflow && (
              <div className="mt-4 flex justify-center w-full">
                <Button
                  variant="secondary" size="sm" shape="rounded"
                  onClick={() => setExpanded(!expanded)}
                  leftIcon={expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  className="bg-background-100 border-gray-alpha-400 text-ds-text font-medium"
                >
                  {expanded ? t("msg.showLess") : t("msg.showMore")}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <ActionBtn onClick={handleCopy} label={copied ? t("msg.copied") : t("msg.copy")}>
            {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
          </ActionBtn>
          {!isOptimistic && (
            <ActionBtn onClick={() => { void forkChatFromMessage(id); }} label={t("msg.forkFromHere")}>
              <GitBranchPlus size={14} strokeWidth={2} />
            </ActionBtn>
          )}
          <ActionBtn onClick={() => { setDraft(content); setEditing(true); }} label={t("msg.edit")}>
            <Pencil size={14} strokeWidth={2} />
          </ActionBtn>
        </div>
      </div>
    </>
  );
}
