import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const inputWrapperVariants = cva(
  "relative flex w-full items-stretch rounded-[6px] overflow-hidden transition-[box-shadow,background-color,opacity] duration-150",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--ds-background-100)] shadow-[0_0_0_1px_var(--ds-gray-alpha-400)] [&:not(:focus-within):hover]:shadow-[0_0_0_1px_var(--ds-gray-alpha-500)] focus-within:shadow-[0_0_0_1px_var(--ds-gray-alpha-600),0_0_0_4px_var(--ds-gray-alpha-200)] focus-visible:shadow-[0_0_0_1px_var(--ds-gray-alpha-600),0_0_0_4px_var(--ds-gray-alpha-200)] dark:focus-within:shadow-[0_0_0_1px_var(--ds-gray-alpha-600),0_0_0_4px_#ffffff3d] dark:focus-visible:shadow-[0_0_0_1px_var(--ds-gray-alpha-600),0_0_0_4px_#ffffff3d]",
        affix:
          "bg-[var(--ds-background-100)] shadow-[0_0_0_1px_var(--ds-gray-alpha-400)] [&:not(:focus-within):hover]:shadow-[0_0_0_1px_var(--ds-gray-alpha-500)] focus-within:shadow-[0_0_0_1px_var(--ds-gray-alpha-600),0_0_0_4px_var(--ds-gray-alpha-200)] focus-visible:shadow-[0_0_0_1px_var(--ds-gray-alpha-600),0_0_0_4px_var(--ds-gray-alpha-200)] dark:focus-within:shadow-[0_0_0_1px_var(--ds-gray-alpha-600),0_0_0_4px_#ffffff3d] dark:focus-visible:shadow-[0_0_0_1px_var(--ds-gray-alpha-600),0_0_0_4px_#ffffff3d]",
        ghost: "bg-transparent shadow-none focus-within:shadow-none focus-visible:shadow-none",
        chat: "bg-transparent shadow-none focus-within:shadow-none focus-visible:shadow-none",
      },
      size: {
        sm: "h-8",
        md: "h-10",
        lg: "h-12",
      },
      error: {
        true:
          "shadow-[0_0_0_1px_var(--ds-red-900),0_0_0_4px_var(--ds-red-300)] focus-within:shadow-[0_0_0_1px_var(--ds-red-900),0_0_0_4px_var(--ds-red-300)] focus-visible:shadow-[0_0_0_1px_var(--ds-red-900),0_0_0_4px_var(--ds-red-300)] dark:focus-within:shadow-[0_0_0_1px_var(--ds-red-900),0_0_0_4px_var(--ds-red-300)] dark:focus-visible:shadow-[0_0_0_1px_var(--ds-red-900),0_0_0_4px_var(--ds-red-300)]",
        false: "",
      },
    },
    compoundVariants: [
      {
        variant: "ghost",
        error: true,
        className: "shadow-none focus-within:shadow-none focus-visible:shadow-none",
      },
      {
        variant: "chat",
        error: true,
        className: "shadow-none focus-within:shadow-none focus-visible:shadow-none",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "md",
      error: false,
    },
  },
);

const inputFieldVariants = cva(
  "h-full w-full border-none bg-transparent text-ds-text outline-none placeholder:text-[var(--ds-gray-700)] placeholder:opacity-100",
  {
    variants: {
      variant: {
        default: "",
        affix: "",
        ghost: "",
        chat: "",
      },
      size: {
        sm: "text-[13px]",
        md: "text-[14px]",
        lg: "text-[15px]",
      },
      hasLeftIcon: { true: "pl-2", false: "pl-3" },
      hasRightIcon: { true: "pr-2", false: "pr-3" },
    },
    defaultVariants: { variant: "default", size: "md", hasLeftIcon: false, hasRightIcon: false },
  },
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "prefix">,
    VariantProps<typeof inputWrapperVariants> {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  inputClassName?: string;
  error?: boolean;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  prefixStyling?: boolean;
  suffixStyling?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      inputClassName,
      variant = "default",
      size = "md",
      leftIcon,
      rightIcon,
      disabled,
      error = false,
      prefix,
      suffix,
      prefixStyling = true,
      suffixStyling = true,
      ...props
    },
    ref,
  ) => {
    const isDisabled = !!disabled;
    const hasPrefix = !!prefix;
    const hasSuffix = !!suffix;

    return (
      <div
        className={cn(
          inputWrapperVariants({ variant, size, error }),
          isDisabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        {hasPrefix ? (
          <label
            aria-hidden="true"
            className={cn(
              "order-0 flex h-full shrink-0 items-center justify-center px-3 text-sm text-[var(--ds-gray-700)] transition-colors duration-150",
              prefixStyling
                ? "rounded-l-[6px] bg-[var(--ds-background-200)]"
                : "-mr-3 bg-transparent",
            )}
          >
            {prefix}
          </label>
        ) : null}
        {!hasPrefix && leftIcon ? (
          <span className="pointer-events-none order-0 flex h-full items-center pl-3 text-ds-text-tertiary">
            {leftIcon}
          </span>
        ) : null}
        {hasPrefix && prefixStyling ? (
          <span
            aria-hidden="true"
            className="pointer-events-none order-[1] h-full w-[1px] shrink-0 bg-[var(--ds-gray-alpha-400)]"
          />
        ) : null}
        <input
          ref={ref}
          disabled={isDisabled}
          className={cn(
            inputFieldVariants({
              variant,
              size,
              hasLeftIcon: !!leftIcon && !hasPrefix,
              hasRightIcon: !!rightIcon && !hasSuffix,
            }),
            "order-1",
            hasPrefix && "rounded-l-none",
            hasSuffix && "rounded-r-none",
            (variant === "ghost" || variant === "chat") && "px-0",
            inputClassName,
          )}
          {...props}
        />
        {hasSuffix && suffixStyling ? (
          <span
            aria-hidden="true"
            className="pointer-events-none order-[1] h-full w-[1px] shrink-0 bg-[var(--ds-gray-alpha-400)]"
          />
        ) : null}
        {!hasSuffix && rightIcon ? (
          <span className="pointer-events-none order-2 flex h-full items-center pr-3 text-ds-text-tertiary">
            {rightIcon}
          </span>
        ) : null}
        {hasSuffix ? (
          <label
            aria-hidden="true"
            className={cn(
              "order-2 flex h-full shrink-0 items-center justify-center px-3 text-sm text-[var(--ds-gray-700)] transition-colors duration-150",
              suffixStyling
                ? "rounded-r-[6px] bg-[var(--ds-background-200)]"
                : "-ml-3 bg-transparent",
            )}
          >
            {suffix}
          </label>
        ) : null}
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input, inputWrapperVariants, inputFieldVariants };