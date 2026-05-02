"use client";

import { useState, useCallback } from "react";
import {
  Copy,
  Check,
  RotateCcw,
  ChevronsDown,
  GitFork,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tooltip } from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/store/i18nStore";
import { cn } from "@/lib/utils";
import type { MessageFeedbackVote } from "@/lib/store/chatStore";

export const COMPARE_ACCENTS = ["0,112,243", "57,142,74"] as const;
export const SC_ACCENTS = ["0,112,243", "57,142,74", "245,166,35"] as const;
export const COMPARE_LABELS = ["A", "B"] as const;

/* Small helpers */
export function MetaBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <Badge variant="gray-subtle" size="sm" className="gap-1.5">
      <span className="opacity-65">{label}</span>
      <span>{value}</span>
    </Badge>
  );
}

/* Action bar button with tooltip */
export function ActionBtn({
  onClick,
  label,
  children,
  active = false,
  className,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <Tooltip content={label} className="inline-flex cursor-default">
      <Button
        variant="tertiary"
        size="sm"
        iconOnly
        onClick={onClick}
        aria-label={label}
        className={cn(
          "text-ds-text-tertiary transition-colors hover:text-ds-text",
          active && "bg-gray-alpha-200 text-ds-text",
          className,
        )}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

/* Assistant action bar — Copy + Regenerate */
export function AssistantActionBar({
  content,
  onRegenerate,
  onContinue,
  onFork,
  onRate,
  feedbackVote,
  canRate = false,
  canContinue = false,
}: {
  content: string;
  onRegenerate: () => void;
  onContinue?: () => void;
  onFork?: () => void;
  onRate?: (vote: MessageFeedbackVote) => void;
  feedbackVote?: MessageFeedbackVote | null;
  canRate?: boolean;
  canContinue?: boolean;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silent */ }
  }, [content]);

  return (
    <div
      className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
    >
      <ActionBtn onClick={handleCopy} label={copied ? t("msg.copied") : t("msg.copy")}>
        {copied
          ? <Check size={14} strokeWidth={2} />
          : <Copy size={14} strokeWidth={2} />
        }
      </ActionBtn>
      {canRate && onRate && (
        <>
          <ActionBtn
            onClick={() => onRate("like")}
            label={t("msg.like")}
            active={feedbackVote === "like"}
          >
            <ThumbsUp size={14} strokeWidth={2} />
          </ActionBtn>
          <ActionBtn
            onClick={() => onRate("dislike")}
            label={t("msg.dislike")}
            active={feedbackVote === "dislike"}
          >
            <ThumbsDown size={14} strokeWidth={2} />
          </ActionBtn>
        </>
      )}
      {canContinue && onContinue && (
        <ActionBtn onClick={onContinue} label={t("msg.continueGeneration")}>
          <ChevronsDown size={14} strokeWidth={2} />
        </ActionBtn>
      )}
      <ActionBtn onClick={onRegenerate} label={t("msg.regenerate")}>
        <RotateCcw size={14} strokeWidth={2} />
      </ActionBtn>
      {onFork && (
        <ActionBtn onClick={onFork} label={t("msg.forkFromHere")}>
          <GitFork size={14} strokeWidth={2} />
        </ActionBtn>
      )}
    </div>
  );
}

export interface TabDef {
  key: string;
  label: string;
  accentRgb: string;
}

export function TabStrip({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <SegmentedControl
      options={tabs.map((tab) => ({
        value: tab.key,
        label: <span className="text-[14px]">{tab.label}</span>,
      }))}
      value={active}
      onValueChange={onChange}
      className="w-auto max-w-full"
    />
  );
}

/* "Select as best" button*/
export function SelectBestButton({
  accentRgb: _accentRgb,
  onClick,
}: {
  accentRgb: string;
  onClick: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Button
      type="button"
      variant="default"
      onClick={onClick}
      leftIcon={<Check size={14} strokeWidth={2} />}
    >
      {t("msg.selectResponse")}
    </Button>
  );
}
