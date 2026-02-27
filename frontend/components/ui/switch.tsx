"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
}

function Switch({ checked, onCheckedChange, className, disabled, id }: SwitchProps) {
  return (
    <button
      id={id}
      role="switch"
      type="button"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "peer inline-flex h-[18px] w-[32px] shrink-0 cursor-pointer items-center rounded-full transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-white/[0.1]",
        className,
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform duration-200",
          checked ? "translate-x-[16px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}

export { Switch };
