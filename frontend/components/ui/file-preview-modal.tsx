"use client";

import * as React from "react";
import { FileText, X } from "lucide-react";
import { createPortal } from "react-dom";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { AttachmentChipData } from "@/components/ui/attachment-chip";

interface FilePreviewModalProps {
  chip: AttachmentChipData | null;
  onClose: () => void;
}

export function FilePreviewModal({ chip, onClose }: FilePreviewModalProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!chip) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [chip, onClose]);

  if (!chip || !mounted) return null;

  const isImage = chip.mimeType?.startsWith("image/") || Boolean(chip.previewUrl);

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-gray-alpha-900 dark:bg-black/70 animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={cn(
          "relative z-[201] w-full overflow-hidden rounded-2xl border border-gray-alpha-200 bg-background shadow-geist-lg animate-in fade-in zoom-in-95 duration-200",
          isImage ? "max-w-2xl" : "max-w-sm",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5">
          <h2 className="min-w-0 flex-1 truncate text-[18px] font-semibold leading-6 tracking-[-0.02em] text-ds-text pr-4">
            {chip.filename}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ds-text-tertiary transition-colors hover:bg-gray-alpha-200 hover:text-ds-text"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <Separator />

        {/* Content */}
        {isImage && chip.previewUrl ? (
          <div className="max-h-[70vh] overflow-auto bg-gray-alpha-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={chip.previewUrl}
              alt={chip.filename}
              className="mx-auto block max-w-full object-contain"
            />
          </div>
        ) : (
          /* Non-image: info card */
          <div className="flex items-center gap-3 px-6 py-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-alpha-200 bg-gray-alpha-100">
              <FileText size={22} strokeWidth={1.5} className="text-ds-text-tertiary" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium text-ds-text">
                {chip.filename}
              </p>
              <p className="mt-0.5 text-[13px] text-ds-text-secondary">
                {chip.mimeType ?? "File"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
