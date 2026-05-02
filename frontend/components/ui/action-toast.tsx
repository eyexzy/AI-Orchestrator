"use client";

import * as React from "react";
import { cva } from "class-variance-authority";
import {
  CheckCircle2,
  CircleDot,
  CircleX,
  Info,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast, type ExternalToast, type ToastClassnames } from "sonner";
import { cn } from "@/lib/utils";

export type ActionToastTone = "neutral" | "success" | "info" | "warning" | "danger";
export type ActionToastKind =
  | "neutral"
  | "success"
  | "saved"
  | "deleted"
  | "restored"
  | "info"
  | "warning"
  | "error";

const actionToastVariants = cva(
  "pointer-events-none flex w-fit min-w-0 max-w-[calc(100vw-1.5rem)] select-none items-start gap-2.5 rounded-xl border px-3 py-2.5 shadow-geist-lg sm:max-w-[42rem]",
  {
    variants: {
      tone: {
        neutral: "border-gray-alpha-200 bg-background-100",
        success: "border-[color:var(--ds-green-400)] bg-[color:var(--ds-green-100)]",
        info: "border-[color:var(--ds-blue-400)] bg-[color:var(--ds-blue-100)]",
        warning: "border-[color:var(--ds-amber-400)] bg-[color:var(--ds-amber-100)]",
        danger: "border-[color:var(--ds-red-400)] bg-[color:var(--ds-red-100)]",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

const actionToastIconVariants = cva("flex h-5 w-5 shrink-0 items-center justify-center", {
  variants: {
    tone: {
      neutral: "text-ds-text-secondary",
      success: "text-[color:var(--ds-green-900)]",
      info: "text-[color:var(--ds-blue-900)]",
      warning: "text-[color:var(--ds-amber-900)]",
      danger: "text-[color:var(--ds-red-900)]",
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

const actionToastTitleVariants = cva("min-w-0 whitespace-normal break-words text-[13px] font-medium leading-5", {
  variants: {
    tone: {
      neutral: "text-ds-text",
      success: "text-[color:var(--ds-green-900)]",
      info: "text-[color:var(--ds-blue-900)]",
      warning: "text-[color:var(--ds-amber-900)]",
      danger: "text-[color:var(--ds-red-900)]",
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

const actionToastDescriptionVariants = cva(
  "min-w-0 whitespace-normal break-words text-[13px] leading-5 before:mr-1.5 before:inline-block before:h-1 before:w-1 before:rounded-full before:bg-current before:align-middle before:opacity-35 before:content-['']",
  {
    variants: {
      tone: {
        neutral: "text-ds-text-secondary",
        success: "text-[color:var(--ds-green-900)]/80",
        info: "text-[color:var(--ds-blue-900)]/80",
        warning: "text-[color:var(--ds-amber-900)]/80",
        danger: "text-[color:var(--ds-red-900)]/80",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

const actionToastInlineTextVariants = cva("min-w-0 flex flex-1 flex-wrap items-center gap-x-1.5", {
  variants: {
    tone: {
      neutral: "",
      success: "",
      info: "",
      warning: "",
      danger: "",
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

const ACTION_TOAST_META: Record<ActionToastKind, { tone: ActionToastTone; Icon: LucideIcon }> = {
  neutral: { tone: "neutral", Icon: CircleDot },
  success: { tone: "success", Icon: CheckCircle2 },
  saved: { tone: "success", Icon: CheckCircle2 },
  deleted: { tone: "success", Icon: CheckCircle2 },
  restored: { tone: "success", Icon: CheckCircle2 },
  info: { tone: "info", Icon: Info },
  warning: { tone: "warning", Icon: TriangleAlert },
  error: { tone: "danger", Icon: CircleX },
};

const actionToastCloseVariants = cva(
  "pointer-events-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors",
  {
    variants: {
      tone: {
        neutral: "text-ds-text-tertiary hover:bg-gray-alpha-200 hover:text-ds-text",
        success: "text-[color:var(--ds-green-800)] hover:bg-[color:var(--ds-green-200)] hover:text-[color:var(--ds-green-900)]",
        info: "text-[color:var(--ds-blue-800)] hover:bg-[color:var(--ds-blue-200)] hover:text-[color:var(--ds-blue-900)]",
        warning: "text-[color:var(--ds-amber-800)] hover:bg-[color:var(--ds-amber-200)] hover:text-[color:var(--ds-amber-900)]",
        danger: "text-[color:var(--ds-red-800)] hover:bg-[color:var(--ds-red-200)] hover:text-[color:var(--ds-red-900)]",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

export interface ActionToastProps extends React.HTMLAttributes<HTMLDivElement> {
  message: React.ReactNode;
  description?: React.ReactNode;
  kind?: ActionToastKind;
  tone?: ActionToastTone;
  icon?: React.ReactNode;
}

export function ActionToast({
  message,
  description,
  kind = "success",
  tone,
  icon,
  className,
  ...props
}: ActionToastProps) {
  const meta = ACTION_TOAST_META[kind];
  const resolvedTone = tone ?? meta.tone;
  const Icon = meta.Icon;

  return (
    <div
      role="status"
      className={cn(actionToastVariants({ tone: resolvedTone }), className)}
      {...props}
    >
      <div className={cn(actionToastIconVariants({ tone: resolvedTone }))}>
        {icon ?? <Icon size={16} strokeWidth={2.1} />}
      </div>

      <div className={cn(actionToastInlineTextVariants({ tone: resolvedTone }))}>
        <span className={cn(actionToastTitleVariants({ tone: resolvedTone }))}>
          {message}
        </span>
        {description ? (
          <span className={cn(actionToastDescriptionVariants({ tone: resolvedTone }))}>
            {description}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function getActionToastClassNames(tone: ActionToastTone): ToastClassnames {
  return {
    toast: actionToastVariants({ tone }),
    icon: actionToastIconVariants({ tone }),
    content: actionToastInlineTextVariants({ tone }),
    title: actionToastTitleVariants({ tone }),
    description: actionToastDescriptionVariants({ tone }),
    cancelButton: actionToastCloseVariants({ tone }),
  };
}

interface ActionToastTriggerOptions extends Omit<ExternalToast, "description" | "unstyled"> {
  description?: React.ReactNode;
  kind?: ActionToastKind;
  tone?: ActionToastTone;
  icon?: React.ReactNode;
}

function showActionToast(
  message: React.ReactNode,
  {
    description,
    kind = "success",
    tone,
    icon,
    duration,
    cancel,
    classNames,
    ...toastOptions
  }: ActionToastTriggerOptions = {},
) {
  const meta = ACTION_TOAST_META[kind];
  const resolvedTone = tone ?? meta.tone;
  const Icon = meta.Icon;
  const iconNode = icon ?? <Icon size={16} strokeWidth={2.1} />;
  const sharedOptions: ExternalToast = {
    ...toastOptions,
    description,
    duration: duration ?? 3000,
    unstyled: true,
    icon: iconNode,
    cancel: cancel ?? {
      label: <X size={13} strokeWidth={2.2} />,
      onClick: () => {},
    },
    classNames: {
      ...getActionToastClassNames(resolvedTone),
      ...classNames,
    },
  };

  switch (kind) {
    case "neutral":
      return toast.message(message, sharedOptions);
    case "warning":
      return toast.warning(message, sharedOptions);
    case "error":
      return toast.error(message, sharedOptions);
    case "info":
      return toast.info(message, sharedOptions);
    default:
      return toast.success(message, sharedOptions);
  }
}

export const actionToast = {
  show: showActionToast,
  neutral: (message: React.ReactNode, options?: Omit<ActionToastTriggerOptions, "kind">) =>
    showActionToast(message, { ...options, kind: "neutral" }),
  success: (message: React.ReactNode, options?: Omit<ActionToastTriggerOptions, "kind">) =>
    showActionToast(message, { ...options, kind: "success" }),
  saved: (message: React.ReactNode, options?: Omit<ActionToastTriggerOptions, "kind">) =>
    showActionToast(message, { ...options, kind: "saved" }),
  deleted: (message: React.ReactNode, options?: Omit<ActionToastTriggerOptions, "kind">) =>
    showActionToast(message, { ...options, kind: "deleted" }),
  restored: (message: React.ReactNode, options?: Omit<ActionToastTriggerOptions, "kind">) =>
    showActionToast(message, { ...options, kind: "restored" }),
  info: (message: React.ReactNode, options?: Omit<ActionToastTriggerOptions, "kind">) =>
    showActionToast(message, { ...options, kind: "info" }),
  warning: (message: React.ReactNode, options?: Omit<ActionToastTriggerOptions, "kind">) =>
    showActionToast(message, { ...options, kind: "warning" }),
  error: (message: React.ReactNode, options?: Omit<ActionToastTriggerOptions, "kind">) =>
    showActionToast(message, { ...options, kind: "error" }),
};
