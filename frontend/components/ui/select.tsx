"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, value, onValueChange, options, placeholder, ...props }, ref) => (
    <select
      ref={ref}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className={cn(
        "flex h-8 w-full items-center rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-[12px] text-foreground/80 outline-none transition-all duration-200",
        "focus:border-white/[0.15] focus:ring-1 focus:ring-white/[0.05]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
);
Select.displayName = "Select";

export { Select };
