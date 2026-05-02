"use client";

import type { ReactNode } from "react";
import { AlertOctagon, AlertTriangle, Info } from "@geist-ui/icons";

export type InputNoticeTone = "danger" | "warning" | "neutral" | "feedback";

export interface InputNoticeAction {
  label: string;
  onClick: () => void;
}

export interface InputNotice {
  key: string;
  tone: InputNoticeTone;
  message: string;
  dismissLabel?: string;
  onDismiss?: () => void;
  icon?: ReactNode;
  hideIcon?: boolean;
  actions?: InputNoticeAction[];
}

function defaultIcon(tone: InputNoticeTone, className: string): ReactNode {
  const iconClassName = `h-4 w-4 shrink-0 ${className}`;
  if (tone === "danger") return <AlertOctagon className={iconClassName} />;
  if (tone === "warning") return <AlertTriangle className={iconClassName} />;
  return <Info className={iconClassName} />;
}

function toneClasses(tone: InputNoticeTone) {
  if (tone === "danger") {
    return {
      bridge: "border-[color:var(--ds-red-400)] bg-[color:var(--ds-red-200)]",
      shell: "border-[color:var(--ds-red-400)] bg-[color:var(--ds-red-200)] text-[color:var(--ds-red-900)]",
      action: "text-[color:var(--ds-red-800)] hover:text-[color:var(--ds-red-1000)]",
      icon: "text-[color:var(--ds-red-900)]",
    };
  }
  if (tone === "warning") {
    return {
      bridge: "border-[color:var(--ds-amber-400)] bg-[color:var(--ds-amber-200)]",
      shell: "border-[color:var(--ds-amber-400)] bg-[color:var(--ds-amber-200)] text-[color:var(--ds-amber-900)]",
      action: "text-[color:var(--ds-amber-800)] hover:text-[color:var(--ds-amber-1000)]",
      icon: "text-[color:var(--ds-amber-900)]",
    };
  }
  if (tone === "feedback") {
    return {
      bridge: "border-[color:var(--ds-blue-400)] bg-[color:var(--ds-blue-200)]",
      shell: "border-[color:var(--ds-blue-400)] bg-[color:var(--ds-blue-200)] text-[color:var(--ds-blue-900)]",
      action: "text-[color:var(--ds-blue-800)] hover:bg-[color:var(--ds-blue-300)] hover:text-[color:var(--ds-blue-1000)]",
      icon: "text-[color:var(--ds-blue-900)]",
    };
  }
  return {
    bridge: "border-[color:var(--ds-gray-alpha-400)] bg-[color:var(--ds-gray-200)]",
    shell: "border-[color:var(--ds-gray-alpha-400)] bg-[color:var(--ds-gray-200)] text-[color:var(--ds-gray-900)]",
    action: "text-[color:var(--ds-gray-800)] hover:text-[color:var(--ds-gray-1000)]",
    icon: "text-[color:var(--ds-gray-900)]",
  };
}

export function InputNoticeBar({ notice }: { notice: InputNotice }) {
  const colors = toneClasses(notice.tone);
  const showIcon = !notice.hideIcon;
  const hasActions = !!notice.actions?.length;

  return (
    <div className="absolute inset-x-0 top-[calc(100%-46px)] z-10 h-[46px]">
      <div
        className={`absolute left-0 right-0 top-0 h-3 border-x ${colors.bridge} transition-[background,border-color,color] duration-200 [transition-delay:100ms] [transition-timing-function:cubic-bezier(0.31,0.1,0.08,0.96)]`}
      />
      <div
        className={`absolute inset-x-0 top-3 flex h-[34px] items-center overflow-hidden whitespace-nowrap rounded-b-xl border border-t-0 ${colors.shell} transition-[background,border-color,color] duration-200 [transition-delay:100ms] [transition-timing-function:cubic-bezier(0.31,0.1,0.08,0.96)]`}
      >
        <div className="flex flex-1 items-center justify-between overflow-hidden px-3 [&_svg]:min-w-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 truncate text-[14px] leading-5">
            {showIcon ? notice.icon ?? defaultIcon(notice.tone, colors.icon) : null}
            <span className="truncate">{notice.message}</span>
          </div>
          {hasActions && (
            <div className="ml-3 flex shrink-0 items-center gap-1.5">
              {notice.actions!.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className={`rounded-md px-2 py-1 text-[13px] font-medium leading-4 transition-colors ${colors.action}`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
          {notice.onDismiss && (
            <button
              type="button"
              onClick={notice.onDismiss}
              aria-label={notice.dismissLabel}
              className={`ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${colors.action}`}
            >
              <span aria-hidden="true" className="text-[15px] leading-none">x</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
