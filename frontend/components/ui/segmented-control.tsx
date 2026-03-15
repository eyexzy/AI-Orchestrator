"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedControlProps {
  options: { value: string; label: React.ReactNode }[];
  value: string | undefined;
  onValueChange: (value: string) => void;
  className?: string;
}

export function SegmentedControl({ options, value, onValueChange, className }: SegmentedControlProps) {
  return (
    <div
      className={cn(
        "inline-flex w-full h-10 p-1 rounded-[6px] transform-gpu",
        "bg-[var(--segmented-control-bg)]",
        "shadow-[inset_0_0_0_1px_var(--segmented-control-border)]",
        className,
      )}
    >
      {options.map((opt) => {
        const isActive = value === opt.value;
        const plainLabel = typeof opt.label === "string" ? opt.label : undefined;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onValueChange(opt.value)}
            title={plainLabel}
            aria-label={plainLabel}
            className={cn(
              "flex-1 min-w-0 h-full flex items-center justify-center px-2 text-[13px] font-medium rounded-[5px] transition-colors duration-150 ease-in-out select-none outline-none overflow-hidden",
              isActive
                ? "bg-[var(--segmented-control-pill-bg)] text-[var(--segmented-control-active-text)]"
                : "bg-transparent text-[var(--segmented-control-inactive-text)] hover:text-[var(--segmented-control-active-text)] cursor-pointer"
            )}
          >
            <span className="block w-full truncate text-center">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}