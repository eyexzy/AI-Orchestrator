import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/* Spinner for loading state */
function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("animate-spin", className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      width="16"
      height="16"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/* CVA variants */
const buttonVariants = cva(
  "relative inline-flex max-w-full select-none touch-manipulation items-center justify-center whitespace-nowrap border-0 font-medium antialiased [font-feature-settings:'liga'] transition-[background-color,color,transform] duration-150 ease-in-out transform-gpu focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--geist-background)] disabled:cursor-not-allowed disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--ds-gray-1000)] text-[var(--geist-background)] shadow-none hover:bg-[color-mix(in_oklab,var(--ds-gray-1000),var(--geist-background)_12%)] disabled:bg-[var(--ds-gray-100)] disabled:text-[var(--ds-gray-700)]",
        secondary:
          "bg-[var(--geist-background)] text-[var(--ds-gray-1000)] shadow-[0_0_0_1px_var(--ds-gray-300)] hover:bg-[var(--ds-gray-100)] disabled:bg-[var(--geist-background)] disabled:text-[var(--ds-gray-700)] disabled:shadow-[0_0_0_1px_var(--ds-gray-200)]",
        chip:
          "bg-[var(--ds-background-200)] text-[var(--ds-gray-900)] shadow-[0_0_0_1px_var(--ds-gray-300)] hover:bg-[var(--ds-gray-100)] hover:text-[var(--ds-gray-1000)] disabled:bg-[var(--ds-gray-100)] disabled:text-[var(--ds-gray-700)] disabled:shadow-[0_0_0_1px_var(--ds-gray-200)]",
        tertiary:
          "bg-transparent text-[var(--ds-gray-1000)] shadow-none hover:bg-[var(--ds-gray-100)] disabled:bg-transparent disabled:text-[var(--ds-gray-700)]",
        error:
          "bg-[var(--ds-red-800)] text-[var(--geist-background)] shadow-none hover:bg-[var(--ds-red-900)] disabled:bg-[var(--ds-gray-100)] disabled:text-[var(--ds-gray-700)]",
        warning:
          "bg-[var(--ds-amber-800)] text-[var(--geist-background)] shadow-none hover:bg-[var(--ds-amber-900)] disabled:bg-[var(--ds-gray-100)] disabled:text-[var(--ds-gray-700)]",
        link:
          "bg-transparent text-[var(--ds-gray-1000)] shadow-none hover:underline underline-offset-4 disabled:bg-transparent disabled:text-[var(--ds-gray-700)] disabled:no-underline",
      },
      size: {
        tiny: "h-6 px-1.5 text-[12px] gap-1",
        sm: "h-8 px-2 text-[14px] gap-1.5",
        md: "h-10 px-2.5 text-[14px] gap-2",
        lg: "h-12 px-3.5 text-[16px] gap-2.5",
      },
      shape: {
        square: "",
        rounded: "rounded-full",
      },
      iconOnly: {
        true: "px-0",
        false: "",
      },
    },
    compoundVariants: [
      { shape: "square", size: "tiny", className: "rounded-[4px]" },
      { shape: "square", size: "sm", className: "rounded-[6px]" },
      { shape: "square", size: "md", className: "rounded-[6px]" },
      { shape: "square", size: "lg", className: "rounded-[8px]" },
      { iconOnly: true, size: "tiny", className: "w-6 h-6" },
      { iconOnly: true, size: "sm", className: "w-8 h-8" },
      { iconOnly: true, size: "md", className: "w-10 h-10" },
      { iconOnly: true, size: "lg", className: "w-12 h-12" },
      { variant: "secondary", shape: "rounded", className: "shadow-[0_0_0_1px_var(--ds-gray-300),0_1px_2px_0_rgba(0,0,0,0.16)] dark:shadow-[0_0_0_1px_var(--ds-gray-300),0_1px_2px_0_rgba(0,0,0,0.4)]" }
    ],
    defaultVariants: { variant: "default", size: "md", shape: "square", iconOnly: false },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  isLoading?: boolean;
  as?: React.ElementType<any>;
  href?: string;
  target?: string;
}

const Button = React.forwardRef<HTMLElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      shape,
      iconOnly,
      leftIcon,
      rightIcon,
      isLoading = false,
      disabled,
      children,
      as: Component = "button",
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <Component
        className={cn(buttonVariants({ variant, size, shape, iconOnly, className }), isLoading && "opacity-80")}
        ref={ref}
        disabled={Component === "button" ? isDisabled : undefined}
        {...props}
      >
        {isLoading ? (
          <Spinner />
        ) : leftIcon ? (
          <span className="shrink-0">{leftIcon}</span>
        ) : null}

        {children}

        {rightIcon && !isLoading && (
          <span className="shrink-0">{rightIcon}</span>
        )}
      </Component>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };