"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AttachmentChipData {
  id: string;
  filename: string;
  mimeType?: string;
  previewUrl?: string;
  uploading?: boolean;
  error?: string;
}

interface AttachmentChipProps {
  chip: AttachmentChipData;
  removable?: boolean;
  onRemove?: (id: string) => void;
  onClick?: (chip: AttachmentChipData) => void;
  className?: string;
}

export function AttachmentChip({
  chip,
  removable = true,
  onRemove,
  onClick,
  className,
}: AttachmentChipProps) {
  const hasError = Boolean(chip.error);
  const isImage = chip.mimeType?.startsWith("image/") || Boolean(chip.previewUrl);

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={() => onClick?.(chip)}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) onClick(chip);
      }}
      className={cn(
        // Base: matches v0 exactly — h-6, rounded-[6px], border, overflow-hidden, relative, group
        "group relative inline-flex h-6 w-fit max-w-[200px] cursor-pointer select-none items-center overflow-hidden rounded-[6px] border transition-colors duration-150",
        hasError
          ? "border-[color:var(--ds-red-300)] bg-[color:var(--ds-red-100)] text-[color:var(--ds-red-800)] dark:border-[color:var(--ds-red-400)] dark:bg-[color:var(--ds-red-900)]/20 dark:text-[color:var(--ds-red-300)]"
          : "border-gray-alpha-300 bg-gray-alpha-100 text-ds-text hover:bg-gray-alpha-200",
        className,
      )}
    >
      {/* Inner content row — pl-1, gap-1.5, h-full */}
      <span className="flex h-full items-center gap-1.5 overflow-hidden pl-1 font-normal">

        {/* Icon / thumbnail — 16×16, relative container */}
        <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
          {chip.uploading ? (
            <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent opacity-50" />
          ) : hasError ? (
            <AlertCircle size={12} strokeWidth={2} className="text-current" />
          ) : isImage && chip.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={chip.previewUrl}
              alt={chip.filename}
              width={16}
              height={16}
              className="absolute inset-0 h-4 w-4 overflow-hidden rounded-[4px] border border-gray-alpha-300 object-cover"
            />
          ) : (
            /* Larger file icon — overflow:visible so it doesn't push layout */
            <span className="absolute inset-0 flex items-center justify-center overflow-visible">
              <svg
                width="18" height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-ds-text-tertiary shrink-0"
                style={{ overflow: "visible" }}
              >
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </span>
          )}
        </span>

        {/* Filename — truncate, pr-1.5, gradient mask on hover to make room for × */}
        <span
          className={cn(
            "inline truncate overflow-hidden pr-1.5 text-[13px] leading-none transition-all",
            removable && !chip.uploading && "group-hover:[mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent_calc(100%-20px),transparent_100%)]",
          )}
        >
          {chip.filename}
        </span>
      </span>

      {/* Remove button — absolute right-1, opacity-0 → 100 on hover */}
      {removable && !chip.uploading && (
        <button
          type="button"
          aria-label={`Remove ${chip.filename}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.(chip.id);
          }}
          className={cn(
            "absolute right-1 z-10 flex h-4 w-4 items-center justify-center rounded-sm opacity-0 transition-opacity duration-150 group-hover:opacity-100",
            hasError
              ? "text-[color:var(--ds-red-700)]"
              : "text-ds-text-secondary hover:text-ds-text",
          )}
        >
          {/* v0 × SVG exactly */}
          <svg height="16" viewBox="0 0 16 16" width="16" style={{ color: "currentcolor" }}>
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M9.96966 11.0303L10.5 11.5607L11.5607 10.5L11.0303 9.96966L9.06065 7.99999L11.0303 6.03032L11.5607 5.49999L10.5 4.43933L9.96966 4.96966L7.99999 6.93933L6.03032 4.96966L5.49999 4.43933L4.43933 5.49999L4.96966 6.03032L6.93933 7.99999L4.96966 9.96966L4.43933 10.5L5.49999 11.5607L6.03032 11.0303L7.99999 9.06065L9.96966 11.0303Z"
              fill="currentColor"
            />
          </svg>
        </button>
      )}

      {/* Error tooltip */}
      {hasError && chip.error && (
        <span className="pointer-events-none absolute bottom-full left-0 z-50 mb-1.5 hidden max-w-[220px] whitespace-normal rounded-lg border border-[color:var(--ds-red-300)] bg-[color:var(--ds-red-100)] px-2.5 py-1.5 text-[11.5px] leading-snug text-[color:var(--ds-red-800)] shadow-geist-lg group-hover:block dark:border-[color:var(--ds-red-400)] dark:bg-background dark:text-[color:var(--ds-red-300)]">
          {chip.error}
        </span>
      )}
    </div>
  );
}

/** Grid used in message history — 2 columns, no remove button */
export function AttachmentChipGrid({
  chips,
  onChipClick,
}: {
  chips: AttachmentChipData[];
  onChipClick?: (chip: AttachmentChipData) => void;
}) {
  if (chips.length === 0) return null;

  return (
    <div className={cn(
      "attachment-grid grid gap-1.5",
      chips.length === 1 ? "grid-cols-1" : "grid-cols-2",
    )}>
      {chips.map((chip) => (
        <AttachmentChip
          key={chip.id}
          chip={chip}
          removable={false}
          onClick={onChipClick}
        />
      ))}
    </div>
  );
}
