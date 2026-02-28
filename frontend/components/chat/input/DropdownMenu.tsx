"use client";

import { useRef, useEffect, useState } from "react";

interface DropdownMenuProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  children: React.ReactNode;
  minWidth?: number;
}

export function DropdownMenu({ anchorEl, onClose, children, minWidth = 220 }: DropdownMenuProps) {
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
  return (
    <div ref={menuRef} style={{
      position: "fixed",
      bottom: window.innerHeight - rect.top + 8,
      left: Math.min(rect.left, window.innerWidth - minWidth - 8),
      zIndex: 9999, minWidth, borderRadius: 14, padding: "6px",
      boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
      background: "rgb(var(--surface-3))", border: "1px solid rgba(255,255,255,0.12)",
    }}>
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
  const [hovered, setHovered] = useState(false);
  return (
    <button type="button" onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", flexDirection: column ? "column" : "row",
        alignItems: column ? "flex-start" : "center", gap: column ? 3 : 8,
        width: "100%", borderRadius: 9, padding: column ? "8px 10px" : "7px 10px",
        fontSize: 12, color: "rgb(var(--text-2))",
        background: hovered ? "rgba(255,255,255,0.06)" : "transparent",
        border: "none", cursor: "pointer", textAlign: "left", transition: "background 0.1s",
      }}>
      {children}
    </button>
  );
}
