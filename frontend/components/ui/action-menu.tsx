"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ActionMenuItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
}

interface ActionMenuProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  items: ActionMenuItem[];
  align?: "start" | "end";
}

export function ActionMenu({ anchorEl, onClose, items, align = "start" }: ActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!anchorEl) return;

    const onDocumentMouseDown = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        !anchorEl.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    const closeOnViewportChange = () => onClose();
    const onAnchorClick = () => onClose();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    // Delay outside-click binding so opening click does not immediately close the menu.
    const tid = setTimeout(() => document.addEventListener("mousedown", onDocumentMouseDown), 0);
    // Toggle behavior for anchors that only set open=true on click.
    anchorEl.addEventListener("click", onAnchorClick);
    // Close floating menu when layout/viewport changes due to scrolling.
    window.addEventListener("scroll", closeOnViewportChange, true);
    window.addEventListener("wheel", closeOnViewportChange, { passive: true });
    window.addEventListener("touchmove", closeOnViewportChange, { passive: true });
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      clearTimeout(tid);
      document.removeEventListener("mousedown", onDocumentMouseDown);
      anchorEl.removeEventListener("click", onAnchorClick);
      window.removeEventListener("scroll", closeOnViewportChange, true);
      window.removeEventListener("wheel", closeOnViewportChange);
      window.removeEventListener("touchmove", closeOnViewportChange);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [anchorEl, onClose]);

  if (!anchorEl || !mounted) return null;

  const rect = anchorEl.getBoundingClientRect();
  const menuWidth = 168;
  const top = rect.bottom + 6;
  let left = align === "end" ? rect.right - menuWidth : rect.left;

  left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] flex flex-col gap-0.5 rounded-xl p-1.5 shadow-geist-lg bg-background"
      style={{ top, left, minWidth: menuWidth }}
    >
      {items.map((item) => {
        const isDanger = item.variant === "danger";
        return (
          <button
            key={item.label}
            type="button"
           
            onClick={(e) => {
              e.stopPropagation();
              item.onClick();
              onClose();
            }}
            className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium bg-transparent border-none cursor-pointer transition-colors ${isDanger
              ? "text-red-600 hover:bg-red-100"
              : "text-ds-text-secondary hover:bg-gray-alpha-200 hover:text-ds-text"
              }`}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>,
    document.body
  );
}