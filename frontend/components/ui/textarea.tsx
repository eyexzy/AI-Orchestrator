import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const textareaWrapperVariants = cva(
  "relative flex w-full rounded-[6px] overflow-hidden transition-[box-shadow,background-color,opacity] duration-150",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--ds-background-100)] shadow-[0_0_0_1px_var(--ds-gray-alpha-400)] [&:not(:focus-within):hover]:shadow-[0_0_0_1px_var(--ds-gray-alpha-500)] focus-within:shadow-[0_0_0_1px_var(--ds-gray-alpha-600),0_0_0_4px_var(--ds-gray-alpha-200)] focus-visible:shadow-[0_0_0_1px_var(--ds-gray-alpha-600),0_0_0_4px_var(--ds-gray-alpha-200)] dark:focus-within:shadow-[0_0_0_1px_var(--ds-gray-alpha-600),0_0_0_4px_#ffffff3d] dark:focus-visible:shadow-[0_0_0_1px_var(--ds-gray-alpha-600),0_0_0_4px_#ffffff3d]",
        ghost: "bg-transparent shadow-none focus-within:shadow-none focus-visible:shadow-none",
        chat: "bg-transparent shadow-none focus-within:shadow-none focus-visible:shadow-none",
      },
      size: {
        sm: "min-h-20",
        md: "min-h-24",
        lg: "min-h-28",
      },
      error: {
        true:
          "shadow-[0_0_0_1px_var(--ds-red-900),0_0_0_4px_var(--ds-red-300)] focus-within:shadow-[0_0_0_1px_var(--ds-red-900),0_0_0_4px_var(--ds-red-300)] focus-visible:shadow-[0_0_0_1px_var(--ds-red-900),0_0_0_4px_var(--ds-red-300)] dark:focus-within:shadow-[0_0_0_1px_var(--ds-red-900),0_0_0_4px_var(--ds-red-300)] dark:focus-visible:shadow-[0_0_0_1px_var(--ds-red-900),0_0_0_4px_var(--ds-red-300)]",
        false: "",
      },
    },
    compoundVariants: [
      { variant: "ghost", className: "min-h-0" },
      { variant: "chat", className: "min-h-0" },
      { variant: "ghost", error: true, className: "shadow-none focus-within:shadow-none focus-visible:shadow-none" },
      { variant: "chat", error: true, className: "shadow-none focus-within:shadow-none focus-visible:shadow-none" },
    ],
    defaultVariants: { variant: "default", size: "md", error: false },
  },
);

const textareaFieldVariants = cva(
  "w-full resize-none border-none bg-transparent px-3 py-2 text-[14px] text-ds-text outline-none placeholder:text-[var(--ds-gray-700)] placeholder:opacity-100",
  {
    variants: {
      variant: {
        default: "",
        ghost: "",
        chat: "",
      },
      size: {
        sm: "min-h-20 text-[14px]",
        md: "min-h-24 text-[15px]",
        lg: "min-h-28 text-[16px]",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "size">,
    VariantProps<typeof textareaWrapperVariants> {
  wrapperClassName?: string;
  textareaClassName?: string;
  error?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      wrapperClassName,
      textareaClassName,
      variant = "default",
      size = "md",
      disabled,
      error = false,
      ...props
    },
    ref,
  ) => {
    const isDisabled = !!disabled;

    return (
      <div
        className={cn(
          textareaWrapperVariants({
            variant,
            size,
            error,
          }),
          isDisabled && "cursor-not-allowed opacity-50",
          wrapperClassName,
        )}
      >
        <textarea
          ref={ref}
          disabled={isDisabled}
          className={cn(
            textareaFieldVariants({ variant, size }),
            (variant === "ghost" || variant === "chat") && "p-0",
            className,
            textareaClassName,
          )}
          {...props}
        />
      </div>
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea, textareaWrapperVariants, textareaFieldVariants };
