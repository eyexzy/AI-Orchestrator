"use client";

import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/note";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  centered?: boolean;
  className?: string;
}

export function ErrorState({
  title,
  description,
  actionLabel,
  onAction,
  centered = false,
  className,
}: ErrorStateProps) {
  return (
    <Note
      variant="error"
      size="sm"
      className={cn(
        "flex flex-col gap-3",
        centered ? "items-center text-center" : undefined,
        className,
      )}
    >
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        <p className="opacity-85">{description}</p>
      </div>

      {actionLabel && onAction && (
        <Button type="button" variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Note>
  );
}