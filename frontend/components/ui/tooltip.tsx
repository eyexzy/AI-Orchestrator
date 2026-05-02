"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/eventTracker";
import { useUserLevelStore } from "@/lib/store/userLevelStore";

function getTooltipTrackingId(content: React.ReactNode): string {
  if (typeof content === "string") return content;
  if (typeof content === "number") return String(content);
  return "custom";
}

export function Tooltip({
  children,
  content,
  className,
  align = "center",
  side = "top",
  disabled = false,
  trackingId,
  onOpen,
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  className?: string;
  align?: "center" | "start" | "end";
  side?: "top" | "bottom";
  disabled?: boolean;
  trackingId?: string;
  onOpen?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const openedForCurrentHoverRef = useRef(false);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    let left = rect.left + rect.width / 2;

    if (align === "start") left = rect.left;
    if (align === "end") left = rect.left + rect.width;

    setPosition({ top: side === "bottom" ? rect.bottom : rect.top, left });
  }, [align, side]);

  useEffect(() => {
    setMounted(true);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!visible || !mounted) return;
    updatePosition();
  }, [visible, mounted, updatePosition]);

  useEffect(() => {
    if (!visible || !mounted) return;

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [visible, mounted, updatePosition]);

  const handleMouseEnter = () => {
    if (disabled) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      if (openedForCurrentHoverRef.current) return;
      openedForCurrentHoverRef.current = true;
      updatePosition();
      setVisible(true);
      const tooltipId = trackingId ?? getTooltipTrackingId(content);
      useUserLevelStore.getState().trackTooltipClick();
      trackEvent("tooltip_opened", { tooltip_id: tooltipId });
      onOpen?.();
    }, 400);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    openedForCurrentHoverRef.current = false;
    timeoutRef.current = setTimeout(() => setVisible(false), 150);
  };

  useEffect(() => {
    if (disabled) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      openedForCurrentHoverRef.current = false;
      setVisible(false);
    }
  }, [disabled]);

  return (
    <div
      ref={triggerRef}
      className={cn("relative cursor-help", className || "inline-flex w-fit items-center")}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      {children}
      {visible && mounted && position &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[99999]"
            style={{
              top: position.top,
              left: position.left,
              transform: `translate(${align === "center" ? "-50%" : align === "end" ? "-100%" : "0"}, ${
                side === "top" ? "calc(-100% - 6px)" : "6px"
              })`,
            }}
          >
            <div className="animate-in fade-in duration-150">
              <div
                className={cn(
                  "relative w-max max-w-[280px] rounded-md bg-gray-1000 px-3 py-2 text-left text-[13px] font-medium leading-relaxed text-gray-100 after:absolute after:bottom-[-4px] after:h-2 after:w-2 after:rotate-45 after:bg-gray-1000 after:content-['']",
                  side === "bottom" && "after:bottom-auto after:top-[-4px]",
                  align === "center" && "after:left-1/2 after:-translate-x-1/2",
                  align === "start" && "after:left-3",
                  align === "end" && "after:right-3"
                )}
              >
                {content}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
