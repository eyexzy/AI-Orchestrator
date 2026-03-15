"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* Exact Vercel Geist Chevron */
const GeistChevron = ({ className, open }: { className?: string; open?: boolean }) => (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    data-testid="geist-icon"
    strokeLinejoin="round"
    className={cn(
      "shrink-0 text-[var(--ds-gray-1000)] transition-transform duration-200 ease-in-out",
      open && "rotate-90",
      className
    )}
    style={{ color: "currentColor" }}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M5.5 1.93933L6.03034 2.46966L10.8536 7.29288C11.2441 7.68341 11.2441 8.31657 10.8536 8.7071L6.03034 13.5303L5.5 14.0607L4.43934 13L4.96967 12.4697L9.43934 7.99999L4.96967 3.53032L4.43934 2.99999L5.5 1.93933Z"
      fill="currentColor"
    />
  </svg>
);

/* CollapseGroup Context */
interface CollapseGroupContextType {
  activeValues: string[];
  toggleValue: (value: string) => void;
}
const CollapseGroupContext = React.createContext<CollapseGroupContextType | null>(null);

export interface CollapseGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  accordion?: boolean;
  defaultValues?: string[];
}

export function CollapseGroup({ accordion = true, defaultValues = [], className, children, ...props }: CollapseGroupProps) {
  const [activeValues, setActiveValues] = React.useState<string[]>(defaultValues);

  const toggleValue = React.useCallback(
    (value: string) => {
      setActiveValues((prev) => {
        if (prev.includes(value)) {
          return prev.filter((v) => v !== value);
        }
        return accordion ? [value] : [...prev, value];
      });
    },
    [accordion]
  );

  return (
    <CollapseGroupContext.Provider value={{ activeValues, toggleValue }}>
      <div className={cn("border-t border-gray-alpha-200", className)} {...props}>
        {React.Children.map(children, (child, index) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child as React.ReactElement<any>, {
              _isFirst: index === 0,
            });
          }
          return child;
        })}
      </div>
    </CollapseGroupContext.Provider>
  );
}

/* Collapse Component */
export interface CollapseProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  value?: string;
  defaultOpen?: boolean;
  size?: "default" | "small" | "xs";
  variant?: "default" | "card";
  alignChevronLeft?: boolean;
  leftIcon?: React.ElementType;
  headerRight?: React.ReactNode;
  _isFirst?: boolean;
}

export function Collapse({
  title,
  subtitle,
  children,
  value,
  defaultOpen = false,
  size = "default",
  variant = "default",
  alignChevronLeft = false,
  leftIcon: LeftIcon,
  headerRight,
  className,
  _isFirst,
  ...props
}: CollapseProps) {
  const groupContext = React.useContext(CollapseGroupContext);
  const [localOpen, setLocalOpen] = React.useState(defaultOpen);
  const isOpen = groupContext && value ? groupContext.activeValues.includes(value) : localOpen;

  const contentId = React.useId();
  const buttonId = React.useId();

  const handleToggle = () => {
    if (groupContext && value) {
      groupContext.toggleValue(value);
    } else {
      setLocalOpen((prev) => !prev);
    }
  };

  const isCard = variant === "card";

  return (
    <div
      className={cn(
        "text-left",
        isCard
          ? "p-6 shadow-[0_5px_10px_rgba(0,0,0,0.12)] dark:shadow-[0_0_0_1px_#333] rounded-[6px]"
          : "border-b border-gray-alpha-200",
        !isCard && !_isFirst && "border-t border-gray-alpha-200 -mt-[1px]",
        className
      )}
      {...props}
    >
      <h3 className="m-0 p-0 font-inherit text-inherit">
        <button
          type="button"
          id={buttonId}
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={handleToggle}
          className={cn(
            "flex w-full cursor-pointer items-center justify-between outline-none transition-shadow",
            "focus-visible:rounded-[6px] focus-visible:shadow-[0_0_0_2px_var(--geist-background),0_0_0_4px_var(--ds-blue-700)]",
            "bg-transparent border-none p-0 m-0 text-left font-inherit appearance-none",
            size === "default" && "min-h-[80px]",
            (size === "small" || size === "xs") && "min-h-[48px]",
            alignChevronLeft && "flex-row-reverse justify-end gap-1"
          )}
        >
          <span
            className={cn(
              "flex w-full items-center justify-between",
              size === "default" && "py-6",
              (size === "small" || size === "xs") && "py-3",
              alignChevronLeft && "w-auto justify-start"
            )}
          >
            <div className="flex items-center gap-2">
              {LeftIcon && <LeftIcon size={18} strokeWidth={1.5} className="shrink-0 text-ds-text-secondary" />}
              <div className="flex flex-col">
                <span
                  className={cn(
                    "text-[var(--ds-gray-1000)]",
                    size === "default" && "text-[24px] font-semibold leading-[32px] tracking-[-0.47px]",
                    (size === "small" || size === "xs") && "text-[16px] font-medium leading-[24px]"
                  )}
                >
                  {title}
                </span>
                {subtitle && (
                  <span className="text-[16px] font-normal text-ds-text-secondary mt-1 block">
                    {subtitle}
                  </span>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {headerRight}
              <GeistChevron
                open={isOpen}
                className={cn((size === "small" || size === "xs") && "w-[9px] h-[9px]")}
              />
            </div>
          </span>
        </button>
      </h3>

      <div
        id={contentId}
        role="region"
        aria-labelledby={buttonId}
        inert={!isOpen ? true : undefined}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-in-out text-[16px] leading-[26px]",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto pb-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}