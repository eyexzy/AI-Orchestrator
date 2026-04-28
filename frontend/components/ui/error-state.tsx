"use client";

import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/note";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  /** Kept for backward compat, ignored */
  centered?: boolean;
  fill?: boolean;
}

export function ErrorState({
  title,
  description,
  actionLabel,
  onAction,
  className,
  centered: _centered,
  fill: _fill,
}: ErrorStateProps) {
  const action = actionLabel && onAction ? (
    <Button type="button" variant="default" size="sm" onClick={onAction}>
      {actionLabel}
    </Button>
  ) : undefined;

  return (
    <Note variant="error" action={action} className={cn(className)}>
      <div className="space-y-0.5">
        {title && <p className="font-semibold text-[13px]">{title}</p>}
        <p className="text-[13px] opacity-90">{description}</p>
      </div>
    </Note>
  );
}
