import * as React from "react";
import { cn } from "@/lib/utils";

/* Indicators */
function RadioIndicator({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
  return (
    <div
      className={cn(
        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2",
        disabled
          ? "border-[var(--ds-gray-400)]"
          : checked
          ? "border-[var(--ds-blue-600)]"
          : "border-[var(--ds-gray-600)]",
      )}
    >
      {checked && !disabled && (
        <div className="h-[8px] w-[8px] rounded-full bg-[var(--ds-blue-600)]" />
      )}
    </div>
  );
}

function CheckboxIndicator({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
  return (
    <div
      className={cn(
        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border-2",
        disabled
          ? "border-[var(--ds-gray-400)]"
          : checked
          ? "border-[var(--ds-blue-600)] bg-[var(--ds-blue-600)]"
          : "border-[var(--ds-gray-600)]",
      )}
    >
      {checked && !disabled && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4L3.5 6.5L9 1" stroke="var(--geist-background)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

/* Choicebox */
export interface ChoiceboxProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  type?: "radio" | "checkbox";
  className?: string;
}

export function Choicebox({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  type = "radio",
  className,
}: ChoiceboxProps) {
  return (
    <button
      type="button"
      role={type === "checkbox" ? "checkbox" : "radio"}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "flex w-full flex-col gap-0 rounded-[6px] border-[0.8px] p-3 text-left",
        "transition-[background,border] duration-150 ease",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-blue-600)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        disabled
          ? "cursor-not-allowed border-[var(--ds-gray-300)] opacity-50"
          : checked
          ? "cursor-pointer border-[var(--ds-blue-600)] bg-blue-100"
          : "cursor-pointer border-[var(--ds-gray-400)] bg-background-100 hover:border-[var(--ds-gray-500)]",
        className,
      )}
    >
      {/* Title row */}
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "text-[14px] font-medium leading-snug",
            disabled
              ? "text-ds-text-tertiary"
              : checked
              ? "text-[var(--ds-blue-700)]"
              : "text-ds-text",
          )}
        >
          {label}
        </span>

        {type === "checkbox" ? (
          <CheckboxIndicator checked={checked} disabled={disabled} />
        ) : (
          <RadioIndicator checked={checked} disabled={disabled} />
        )}
      </div>

      {/* Description */}
      {description && (
        <span
          className={cn(
            "mt-0.5 text-[13px] leading-snug",
            disabled
              ? "text-ds-text-tertiary"
              : checked
              ? "text-[var(--ds-blue-600)] opacity-80"
              : "text-ds-text-secondary",
          )}
        >
          {description}
        </span>
      )}
    </button>
  );
}

/* ChoiceboxGroup */
export interface ChoiceboxGroupProps<T extends string | number> {
  value: T | null;
  onChange: (value: T) => void;
  children: React.ReactNode;
  className?: string;
}

export function ChoiceboxGroup<T extends string | number>({
  value,
  onChange,
  children,
  className,
}: ChoiceboxGroupProps<T>) {
  return (
    <div className={cn("grid gap-2", className)}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement<ChoiceboxProps & { value?: T }>(child)) return child;
        const itemValue = child.props.value as T | undefined;
        if (itemValue === undefined) return child;
        return React.cloneElement(child, {
          checked: value === itemValue,
          onChange: () => onChange(itemValue),
        });
      })}
    </div>
  );
}