"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

interface DialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onCancel?: () => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, onCancel, children }: DialogProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel?.();
        onOpenChange?.(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange, onCancel]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden p-4">
      <div
        className="absolute -inset-4 bg-gray-alpha-900 dark:bg-black/70 transition-opacity duration-150 animate-fade-in [will-change:opacity]"
        onClick={() => {
          onCancel?.();
          onOpenChange?.(false);
        }}
      />
      {children}
    </div>,
    document.body
  );
}

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function DialogContent({ className, children, ...props }: DialogContentProps) {
  return (
    <div
      className={cn(
        "relative z-[101] w-full max-w-lg overflow-hidden rounded-2xl border border-gray-alpha-200 bg-background shadow-geist-lg animate-in fade-in zoom-in-95 duration-200",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface DialogSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  withSeparator?: boolean;
}

export function DialogHeader({
  className,
  children,
  withSeparator = true,
  ...props
}: DialogSectionProps) {
  return (
    <>
      <div
        className={cn("px-6 py-5", className)}
        {...props}
      >
        {children}
      </div>
      {withSeparator && <Separator />}
    </>
  );
}

export function DialogFooter({
  className,
  children,
  withSeparator = true,
  ...props
}: DialogSectionProps) {
  return (
    <>
      {withSeparator && <Separator />}
      <div
        className={cn("px-6 py-4", className)}
        {...props}
      >
        {children}
      </div>
    </>
  );
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("text-[18px] font-semibold leading-6 tracking-[-0.02em] text-ds-text", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("mt-1 text-[14px] leading-6 text-ds-text-secondary", className)}
      {...props}
    />
  );
}
