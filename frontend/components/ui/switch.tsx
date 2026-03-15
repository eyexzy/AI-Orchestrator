"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const switchVariants = cva(
  "peer relative inline-flex shrink-0 cursor-pointer items-center overflow-hidden rounded-full transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--geist-background)] disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        md: "h-[14px] w-[28px]",
        lg: "h-[24px] w-[40px]",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
);

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value" | "onChange">,
  VariantProps<typeof switchVariants> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

const KNOB = {
  // Pixel-perfect positions inside a 1px bordered track.
  md: { cls: "h-[12px] w-[12px]", on: "translate-x-[14px]", off: "translate-x-0" },
  lg: { cls: "h-[22px] w-[22px]", on: "translate-x-[16px]", off: "translate-x-0" },
} as const;

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, size, checked, onCheckedChange, disabled, id, ...props }, ref) => {
    const k = KNOB[size || "md"];

    const trackColor = checked
      ? "bg-[var(--ds-blue-600)]"
      : "bg-[var(--ds-gray-alpha-400)]";

    const knobColor = "bg-white";

    return (
      <button
        id={id}
        ref={ref}
        role="switch"
        type="button"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          switchVariants({ size }),
          trackColor,
          "border border-gray-alpha-400",
          className
        )}
        {...props}
      >
        <span
          className={cn(
            "pointer-events-none absolute left-0 top-0 block rounded-full transition-transform duration-150 ease-out will-change-transform",
            k.cls,
            checked ? k.on : k.off,
            knobColor,
            "shadow-none"
          )}
        />
      </button>
    );
  }
);
Switch.displayName = "Switch";

export { Switch };