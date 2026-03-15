"use client";

import { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface DropdownMenuProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  children: React.ReactNode;
  minWidth?: number;
  placement?: "top" | "bottom";
}

export function DropdownMenu({ anchorEl, onClose, children, minWidth = 220, placement = "top" }: DropdownMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!anchorEl) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) onClose();
    };
    const tid = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => { clearTimeout(tid); document.removeEventListener("mousedown", handler); };
  }, [anchorEl, onClose]);

  if (!anchorEl) return null;
  const rect = anchorEl.getBoundingClientRect();

  const posStyle: React.CSSProperties = placement === "bottom"
    ? { top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - minWidth - 8) }
    : { bottom: window.innerHeight - rect.top + 8, left: Math.min(rect.left, window.innerWidth - minWidth - 8) };

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] rounded-xl p-1.5 shadow-geist-lg bg-background border border-gray-alpha-200"
      style={{ ...posStyle, minWidth }}
    >
      {children}
    </div>
  );
}

interface MenuBtnProps {
  onClick: () => void;
  children: React.ReactNode;
  column?: boolean;
}

export function MenuBtn({ onClick, children, column = false }: MenuBtnProps) {
  return (
    <button
      type="button"
     
      onClick={onClick}
      className={`flex w-full rounded-lg py-2.5 px-3.5 text-sm text-ds-text-secondary transition-colors hover:bg-gray-alpha-200 hover:text-ds-text cursor-pointer border-none text-left ${column ? "flex-col items-start gap-1" : "flex-row items-center gap-2"
        }`}
    >
      {children}
    </button>
  );
}