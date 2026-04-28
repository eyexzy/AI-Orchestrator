import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const skeletonVariants = cva(
  "relative block overflow-hidden bg-[linear-gradient(270deg,var(--ds-gray-200)_0%,var(--ds-gray-100)_50%,var(--ds-gray-200)_100%)] bg-[length:200%_100%] animate-skeleton",
  {
    variants: {
      shape: {
        rounded: "rounded-[5px]",
        squared: "rounded-none",
        pill: "rounded-full",
        circle: "rounded-full aspect-square",
      },
      show: {
        true: "",
        false: "bg-transparent animate-none",
      },
    },
    defaultVariants: { shape: "rounded", show: true },
  },
);

type SkeletonSize = number | string;

function toCssSize(value: SkeletonSize | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "number" ? `${value}px` : value;
}

export interface SkeletonProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children">,
    VariantProps<typeof skeletonVariants> {
  width?: SkeletonSize;
  height?: SkeletonSize;
  boxHeight?: SkeletonSize;
  children?: React.ReactNode;
}

const Skeleton = React.forwardRef<HTMLSpanElement, SkeletonProps>(
  (
    { className, shape, show = true, width, height, boxHeight, style, children, ...props },
    ref,
  ) => {
    const resolvedHeight = boxHeight ?? height;
    const mergedStyle: React.CSSProperties = {
      ...style,
      width: toCssSize(width) ?? style?.width,
      height: toCssSize(resolvedHeight) ?? style?.height,
    };

    if (show === false) {
      return (
        <span
          ref={ref}
          className={cn("inline-block", className)}
          style={mergedStyle}
          {...props}
        >
          {children}
        </span>
      );
    }

    return (
      <span
        ref={ref}
        aria-hidden="true"
        className={cn(skeletonVariants({ shape, show }), className)}
        style={mergedStyle}
        {...props}
      />
    );
  },
);
Skeleton.displayName = "Skeleton";

export interface SkeletonTextProps extends Omit<SkeletonProps, "children"> {
  lines?: number;
  lastLineWidth?: SkeletonSize;
  lineHeight?: SkeletonSize;
  gap?: string;
}

const SkeletonText = React.forwardRef<HTMLSpanElement, SkeletonTextProps>(
  ({ lines = 3, lastLineWidth = "60%", lineHeight = 14, gap = "0.5rem", className, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn("flex flex-col", className)}
        style={{ gap }}
      >
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            height={lineHeight}
            width={i === lines - 1 ? lastLineWidth : "100%"}
            {...props}
          />
        ))}
      </span>
    );
  },
);
SkeletonText.displayName = "SkeletonText";

export { Skeleton, SkeletonText, skeletonVariants };