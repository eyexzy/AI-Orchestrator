"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type EmptyStateSize = "default" | "compact";

const EMPTY_STATE_METRICS: Record<
  EmptyStateSize,
  {
    paddingX: number;
    paddingY: number;
    contentGap: number;
    actionGap: number;
  }
> = {
  default: {
    paddingX: 70,
    paddingY: 48,
    contentGap: 24,
    actionGap: 12,
  },
  compact: {
    paddingX: 24,
    paddingY: 28,
    contentGap: 20,
    actionGap: 12,
  },
};

export interface EmptyStateIconProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  padding?: number;
}

const EmptyStateIcon = React.forwardRef<HTMLDivElement, EmptyStateIconProps>(
  ({ children, className, padding = 14, style, ...props }, ref) => {
    const iconStyle = {
      "--empty-icon-padding": `${padding}px`,
      ...style,
    } as React.CSSProperties;

    return (
      <div
        ref={ref}
        aria-hidden="true"
        className={cn(
          "flex items-center justify-center rounded-lg border-[0.8px] border-[var(--ds-gray-alpha-400)] bg-background-100 p-[var(--empty-icon-padding)]",
          className,
        )}
        style={iconStyle}
        {...props}
      >
        {children}
      </div>
    );
  },
);
EmptyStateIcon.displayName = "EmptyStateIcon";

export interface EmptyStatePlaceholderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const EmptyStatePlaceholder = React.forwardRef<HTMLDivElement, EmptyStatePlaceholderProps>(
  ({ children, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "mx-2 grid min-h-16 place-items-center rounded-lg border-[0.8px] border-dashed border-[var(--ds-gray-400)] px-8 py-4 text-center text-[14px] leading-5 text-ds-text-secondary",
        className,
      )}
      {...props}
    >
      <div className="mx-auto w-full max-w-full whitespace-normal text-center text-balance">
        {children}
      </div>
    </div>
  ),
);
EmptyStatePlaceholder.displayName = "EmptyStatePlaceholder";

export interface EmptyStatePanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
}

const EmptyStatePanel = React.forwardRef<HTMLDivElement, EmptyStatePanelProps>(
  ({ title, description, children, className, ...props }, ref) => {
    const hasActions = React.Children.count(children) > 0;

    return (
      <div
        ref={ref}
        className={cn(
          "flex w-full flex-1 items-center justify-center rounded-lg border-[0.8px] border-dashed border-[var(--ds-gray-400)] px-8 py-10 text-center",
          className,
        )}
        {...props}
      >
        <div className="mx-auto flex w-full max-w-[440px] flex-col items-center gap-2 text-center">
          <div className="w-full text-balance text-[16px] font-medium leading-6 text-ds-text">
            {title}
          </div>
          {description && (
            <div className="w-full text-balance text-sm leading-5 text-ds-text-secondary">
              {description}
            </div>
          )}
          {hasActions && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              {children}
            </div>
          )}
        </div>
      </div>
    );
  },
);
EmptyStatePanel.displayName = "EmptyStatePanel";

export interface EmptyStateRootProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description: React.ReactNode;
  icon?: React.ReactNode;
  size?: EmptyStateSize;
}

const EmptyStateRoot = React.forwardRef<HTMLDivElement, EmptyStateRootProps>(
  (
    {
      title,
      description,
      icon,
      children,
      className,
      size = "default",
      style,
      ...props
    },
    ref,
  ) => {
    const metrics = EMPTY_STATE_METRICS[size];
    const hasActions = React.Children.count(children) > 0;
    const rootStyle = {
      "--empty-root-padding-x": `${metrics.paddingX}px`,
      "--empty-root-padding-y": `${metrics.paddingY}px`,
      "--empty-content-gap": `${metrics.contentGap}px`,
      "--empty-action-gap": `${metrics.actionGap}px`,
      ...style,
    } as React.CSSProperties;

    return (
      <div
        ref={ref}
        className={cn(
          "w-full rounded-lg border-[0.8px] border-border bg-background-100 px-[var(--empty-root-padding-x)] py-[var(--empty-root-padding-y)] text-ds-text",
          className,
        )}
        style={rootStyle}
        {...props}
      >
        <div className="flex flex-col items-center justify-start gap-[var(--empty-content-gap)] text-center">
          {icon}

          <div className="mx-auto flex w-full flex-col gap-2 text-center">
            <div className="w-full text-balance text-center text-[16px] font-medium leading-6 text-ds-text">
              {title}
            </div>
            <div className="w-full text-balance text-center text-[14px] leading-5 text-ds-text-secondary">
              {description}
            </div>
          </div>

          {hasActions && (
            <div className="flex flex-wrap items-center justify-center gap-[var(--empty-action-gap)]">
              {children}
            </div>
          )}
        </div>
      </div>
    );
  },
);
EmptyStateRoot.displayName = "EmptyStateRoot";

export const EmptyState = {
  Root: EmptyStateRoot,
  Icon: EmptyStateIcon,
  Placeholder: EmptyStatePlaceholder,
  Panel: EmptyStatePanel,
} as const;
