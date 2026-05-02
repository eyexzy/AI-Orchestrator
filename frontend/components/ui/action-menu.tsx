"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";

export interface ActionMenuItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
  confirm?: {
    title: string;
    description: string;
    actionLabel?: string;
  };
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
  const [confirmingItem, setConfirmingItem] = useState<ActionMenuItem | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

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
  const estimatedHeight = items.length * 36 + 12;
  
  let top = rect.bottom + 6;
  if (top + estimatedHeight > window.innerHeight - 8) {
    top = rect.top - estimatedHeight - 6;
  }

  let left = align === "end" ? rect.right - menuWidth : rect.left;

  left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));

  return createPortal(
    <>
      {!confirmingItem && (
        <div
          ref={menuRef}
          className="fixed z-[9999] flex flex-col gap-0.5 rounded-xl bg-background p-1.5 shadow-geist-lg"
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
                  if (item.confirm) {
                    setConfirmingItem(item);
                    return;
                  }
                  item.onClick();
                  onClose();
                }}
                className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md border-none bg-transparent px-3 py-2 text-[14px] font-medium transition-colors ${
                  isDanger
                    ? "text-red-600 hover:bg-red-100"
                    : "text-ds-text hover:bg-gray-alpha-200"
                }`}
              >
                <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </div>
      )}

      {confirmingItem?.confirm && (
        <ConfirmActionModal
          open
          onOpenChange={(open) => {
            setConfirmingItem(open ? confirmingItem : null);
            if (!open) {
              onClose();
            }
          }}
          title={confirmingItem.confirm.title}
          description={confirmingItem.confirm.description}
          confirmLabel={confirmingItem.confirm.actionLabel ?? confirmingItem.label}
          isSubmitting={isConfirming}
          onConfirm={async () => {
            setIsConfirming(true);
            try {
              await confirmingItem.onClick();
            } finally {
              setIsConfirming(false);
              setConfirmingItem(null);
              onClose();
            }
          }}
        />
      )}
    </>,
    document.body,
  );
}
