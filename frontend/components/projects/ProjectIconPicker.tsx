"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { buttonVariants } from "@/components/ui/button";
import { ProjectIcon } from "@/components/projects/ProjectIcon";
import {
  getProjectColor,
  getProjectIconComponent,
  getProjectIconName,
  PROJECT_COLOR_OPTIONS,
  PROJECT_COLOR_RING_CLASSES,
  PROJECT_COLOR_SWATCH_CLASSES,
  PROJECT_ICON_LABELS,
  PROJECT_ICON_OPTIONS,
  type ProjectColor,
  type ProjectIconName,
} from "@/components/projects/projectTheme";
import { cn } from "@/lib/utils";

type PickerPlacement = "top" | "bottom";

type PickerMenuState = {
  placement: PickerPlacement;
  top: number;
  left: number;
};

const OFFSET = 8;
const EDGE_PADDING = 8;
const PICKER_WIDTH = 284;

interface ProjectIconPickerProps {
  iconName?: string | null;
  color?: string | null;
  onIconChange: (iconName: ProjectIconName) => void;
  onColorChange: (color: ProjectColor) => void;
  disabled?: boolean;
  variant?: "field" | "ghost";
  size?: "sm" | "md" | "lg";
  iconSize?: number;
  className?: string;
  align?: "start" | "end";
  ariaLabel?: string;
}

export function ProjectIconPicker({
  iconName,
  color,
  onIconChange,
  onColorChange,
  disabled = false,
  variant = "field",
  size = "md",
  iconSize,
  className,
  align = "start",
  ariaLabel = "Choose project icon and color",
}: ProjectIconPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [menu, setMenu] = React.useState<PickerMenuState | null>(null);

  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const rafRef = React.useRef<number | null>(null);

  const resolvedColor = getProjectColor(color);
  const resolvedIconName = getProjectIconName(iconName);
  const resolvedIconSize = iconSize ?? (size === "lg" ? 20 : size === "sm" ? 15 : 18);

  const updateMenuLayout = React.useCallback(() => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - OFFSET - EDGE_PADDING;
    const spaceAbove = rect.top - OFFSET - EDGE_PADDING;
    const placement: PickerPlacement =
      spaceBelow >= 260 || spaceBelow >= spaceAbove ? "bottom" : "top";

    const unclampedLeft = align === "end" ? rect.right - PICKER_WIDTH : rect.left;
    const left = Math.max(
      EDGE_PADDING,
      Math.min(unclampedLeft, window.innerWidth - PICKER_WIDTH - EDGE_PADDING),
    );
    const top = placement === "bottom" ? rect.bottom + OFFSET : rect.top - OFFSET;

    setMenu((prev) => {
      if (
        prev &&
        prev.placement === placement &&
        prev.top === top &&
        prev.left === left
      ) {
        return prev;
      }

      return { placement, top, left };
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

    const isInsidePicker = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return false;
      return Boolean(
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target),
      );
    };

    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (isInsidePicker(event.target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    const closeOnViewportScroll = (event: Event) => {
      if (isInsidePicker(event.target)) return;
      setOpen(false);
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);
    window.addEventListener("resize", scheduleLayoutUpdate);
    window.addEventListener("scroll", closeOnViewportScroll, true);
    window.addEventListener("wheel", closeOnViewportScroll, { passive: true });
    window.addEventListener("touchmove", closeOnViewportScroll, { passive: true });
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      window.removeEventListener("resize", scheduleLayoutUpdate);
      window.removeEventListener("scroll", closeOnViewportScroll, true);
      window.removeEventListener("wheel", closeOnViewportScroll);
      window.removeEventListener("touchmove", closeOnViewportScroll);
      window.removeEventListener("keydown", handleKeyDown);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [open, scheduleLayoutUpdate]);

  const triggerClassName = cn(
    buttonVariants({
      variant: variant === "field" ? "secondary" : "tertiary",
      size,
      iconOnly: true,
    }),
    variant === "field" ? "rounded-xl bg-background-100" : "rounded-lg",
    className,
  );

  const menuPortal = open && mounted && menu
    ? createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999]"
          style={{
            top: menu.top,
            left: menu.left,
            transform: `translateY(${menu.placement === "top" ? "-100%" : "0"})`,
          }}
        >
          <div
            className="animate-in fade-in rounded-2xl border border-gray-alpha-200 bg-background-100 p-3 shadow-geist-lg duration-150"
            style={{ width: PICKER_WIDTH }}
          >
            <div className="flex flex-wrap items-center gap-2">
              {PROJECT_COLOR_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onColorChange(option);
                  }}
                  className={cn(
                    "h-6 w-6 shrink-0 cursor-pointer rounded-full border-none transition-all",
                    PROJECT_COLOR_SWATCH_CLASSES[option],
                    option === resolvedColor
                      ? cn(
                          "ring-2 ring-offset-2 ring-offset-background",
                          PROJECT_COLOR_RING_CLASSES[option],
                        )
                      : "hover:ring-1 hover:ring-gray-alpha-400 hover:ring-offset-1 hover:ring-offset-background",
                  )}
                  aria-label={option}
                  aria-pressed={option === resolvedColor}
                />
              ))}
            </div>

            <div className="-mx-3 my-3 h-px bg-gray-alpha-200" />

            <div className="grid grid-cols-5 gap-1.5">
              {PROJECT_ICON_OPTIONS.map((option) => {
                const Icon = getProjectIconComponent(option);
                const isSelected = option === resolvedIconName;

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onIconChange(option);
                    }}
                    className={cn(
                      "flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent transition-[background-color,box-shadow,color]",
                      isSelected
                        ? "bg-gray-alpha-200"
                        : "hover:bg-gray-alpha-200",
                    )}
                    aria-label={PROJECT_ICON_LABELS[option]}
                    aria-pressed={isSelected}
                    title={PROJECT_ICON_LABELS[option]}
                  >
                    <Icon
                      size={18}
                      strokeWidth={2}
                      className="text-ds-text"
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          if (!open) {
            updateMenuLayout();
          }
          setOpen((prev) => !prev);
        }}
        className={triggerClassName}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <ProjectIcon
          iconName={resolvedIconName}
          color={resolvedColor}
          size={resolvedIconSize}
          strokeWidth={2}
        />
      </button>
      {menuPortal}
    </>
  );
}
