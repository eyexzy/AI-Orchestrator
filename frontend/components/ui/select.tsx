"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { ChevronDown, Check } from "lucide-react";
import { inputWrapperVariants } from "@/components/ui/input";

export interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  align?: "start" | "end";
  dropdownMinWidth?: number | string;
  dropdownWidthMode?: "trigger" | "content";
  triggerWidthMode?: "full" | "content";
}

type MenuPlacement = "top" | "bottom";

type MenuState = {
  placement: MenuPlacement;
  top: number;
  left: number;
  maxHeight: number;
  triggerWidth: number;
};

const OFFSET = 6;
const EDGE_PADDING = 8;

const Select = React.forwardRef<HTMLDivElement, SelectProps>(
  (
    {
      className,
      value,
      onValueChange,
      options,
      placeholder,
      disabled,
      size = "md",
      align = "start",
      dropdownMinWidth,
      dropdownWidthMode,
      triggerWidthMode = "full",
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false);
    const [mounted, setMounted] = React.useState(false);
    const [menu, setMenu] = React.useState<MenuState | null>(null);

    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const menuRef = React.useRef<HTMLDivElement | null>(null);
    const rafRef = React.useRef<number | null>(null);

    const setContainerRef = React.useCallback((node: HTMLDivElement | null) => {
      containerRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    }, [ref]);

    const updateMenuLayout = React.useCallback(() => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - OFFSET - EDGE_PADDING;
      const spaceAbove = rect.top - OFFSET - EDGE_PADDING;
      const placement: MenuPlacement =
        spaceBelow >= 180 || spaceBelow >= spaceAbove ? "bottom" : "top";
      const maxHeight = Math.min(320, Math.max(96, Math.floor(
        placement === "bottom" ? spaceBelow : spaceAbove,
      )));
      const anchorLeft = align === "end" ? rect.right : rect.left;
      const top = placement === "bottom" ? rect.bottom + OFFSET : rect.top - OFFSET;

      setMenu((prev) => {
        if (
          prev &&
          prev.placement === placement &&
          prev.top === top &&
          prev.left === anchorLeft &&
          prev.maxHeight === maxHeight &&
          prev.triggerWidth === rect.width
        ) {
          return prev;
        }

        return {
          placement,
          top,
          left: anchorLeft,
          maxHeight,
          triggerWidth: rect.width,
        };
      });
    }, [align]);

    const scheduleLayoutUpdate = React.useCallback(() => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        updateMenuLayout();
      });
    }, [updateMenuLayout]);

    React.useEffect(() => {
      setMounted(true);
    }, []);

    React.useLayoutEffect(() => {
      if (!open || !mounted) return;
      updateMenuLayout();
    }, [mounted, open, updateMenuLayout]);

    React.useEffect(() => {
      if (!open) return;

      const shouldIgnoreTarget = (target: EventTarget | null) => {
        if (!(target instanceof Node)) return false;
        return Boolean(
          containerRef.current?.contains(target) ||
          menuRef.current?.contains(target),
        );
      };
      const onDocumentMouseDown = (event: MouseEvent) => {
        const target = event.target as Node;
        if (shouldIgnoreTarget(target)) return;
        setOpen(false);
      };
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") setOpen(false);
      };
      const closeOnViewportScroll = (event: Event) => {
        if (shouldIgnoreTarget(event.target)) return;
        setOpen(false);
      };
      const closeOnPointerScroll = (event: Event) => {
        if (shouldIgnoreTarget(event.target)) return;
        setOpen(false);
      };

      document.addEventListener("mousedown", onDocumentMouseDown);
      window.addEventListener("resize", scheduleLayoutUpdate);
      window.addEventListener("scroll", closeOnViewportScroll, true);
      window.addEventListener("wheel", closeOnPointerScroll, { passive: true });
      window.addEventListener("touchmove", closeOnPointerScroll, { passive: true });
      window.addEventListener("keydown", onKeyDown);

      return () => {
        document.removeEventListener("mousedown", onDocumentMouseDown);
        window.removeEventListener("resize", scheduleLayoutUpdate);
        window.removeEventListener("scroll", closeOnViewportScroll, true);
        window.removeEventListener("wheel", closeOnPointerScroll);
        window.removeEventListener("touchmove", closeOnPointerScroll);
        window.removeEventListener("keydown", onKeyDown);
        if (rafRef.current !== null) {
          window.cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      };
    }, [open, scheduleLayoutUpdate]);

    const selectedOption = options.find((option) => option.value === value);
    const isContentTrigger = triggerWidthMode === "content";
    const resolvedDropdownWidthMode = dropdownWidthMode
      ?? (isContentTrigger ? "content" : "trigger");
    const isContentDropdown = resolvedDropdownWidthMode === "content";

    const menuPortal = open && !disabled && mounted && menu && createPortal(
      <div
        ref={menuRef}
        data-select-portal="true"
        className="fixed z-[9999]"
        style={{
          top: menu.top,
          left: menu.left,
          transform: `translate(${align === "end" ? "-100%" : "0"}, ${menu.placement === "top" ? "-100%" : "0"})`,
        }}
      >
        <div
          className="animate-in fade-in rounded-xl bg-background p-1.5 shadow-geist-lg duration-150"
          style={{
            width: isContentDropdown ? "max-content" : menu.triggerWidth,
            minWidth: isContentDropdown ? dropdownMinWidth ?? menu.triggerWidth : dropdownMinWidth,
            maxWidth: `calc(100vw - ${EDGE_PADDING * 2}px)`,
          }}
        >
          <div
            className={cn(
              isContentDropdown
                ? "grid min-w-full w-max grid-cols-1 gap-0.5 overflow-x-visible"
                : "space-y-0.5 overflow-x-hidden",
              "overflow-y-auto",
            )}
            style={{ maxHeight: menu.maxHeight }}
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "group cursor-pointer whitespace-nowrap rounded-md border-none bg-transparent py-1.5 text-left text-[14px] transition-colors",
                    isSelected
                      ? "text-blue-700 hover:bg-blue-100 hover:text-blue-700"
                      : "text-ds-text hover:bg-gray-alpha-200 hover:text-ds-text",
                    isContentDropdown
                      ? "grid w-full grid-cols-[14px_auto] items-center gap-2 px-3"
                      : "flex w-full items-center gap-2 px-2",
                  )}
                >
                  <div className={cn(
                    "shrink-0",
                    isContentDropdown
                      ? "flex w-[14px] items-center justify-start"
                      : "flex w-4 items-center justify-center",
                  )}>
                    {isSelected && <Check size={14} strokeWidth={2.5} className="text-blue-700" />}
                  </div>
                  <span
                    className={cn(
                      isSelected
                        ? "font-medium text-blue-700"
                        : "text-ds-text",
                    )}
                  >
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>,
      document.body,
    );

    return (
      <div
        ref={setContainerRef}
        className={cn(
          "relative max-w-full",
          isContentTrigger ? "inline-block w-fit" : "block w-full",
        )}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            if (!open) {
              updateMenuLayout();
            }
            setOpen((prev) => !prev);
          }}
          className={cn(
            inputWrapperVariants({
              variant: "default",
              size: size === "sm" ? "sm" : "md",
            }),
            "group min-w-0 max-w-full items-center bg-[var(--ds-background-100)] text-ds-text outline-none",
            isContentTrigger
              ? "inline-flex"
              : "flex w-full justify-between",
            disabled && "cursor-not-allowed opacity-50",
            size === "sm" ? "gap-1 px-2 text-[14px]" : "gap-1.5 px-2.5 text-[15px]",
            className,
          )}
        >
          <span
            className={cn(
              "min-w-0 truncate transition-colors group-hover:text-ds-text",
              !selectedOption && "text-gray-500 group-hover:text-ds-text-secondary",
            )}
          >
            {selectedOption ? selectedOption.label : placeholder || "Select..."}
          </span>
          <ChevronDown
            size={14}
            strokeWidth={1.5}
            className="shrink-0 text-ds-text-tertiary transition-colors group-hover:text-ds-text"
          />
        </button>
        {menuPortal}
      </div>
    );
  },
);

Select.displayName = "Select";

export { Select };
