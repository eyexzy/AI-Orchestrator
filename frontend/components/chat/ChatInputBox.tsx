"use client";

import {
  useRef, useEffect, useCallback, useState,
  type KeyboardEvent, type ReactNode, type RefObject, type MutableRefObject,
} from "react";
import { ArrowUp, Plus, Upload, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentChip, type AttachmentChipData } from "@/components/ui/attachment-chip";
import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";

/* ─────────────────────────────────────────────────────────────────────────────
   Public types
───────────────────────────────────────────────────────────────────────────── */

export type { AttachmentChipData };

export interface ChatInputBoxProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  isSending?: boolean;
  topSlot?: ReactNode;
  bottomSlot?: ReactNode;
  mono?: boolean;
  maxHeight?: number;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  attachments?: AttachmentChipData[];
  onAttach?: (files: FileList) => void;
  onRemoveAttachment?: (id: string) => void;
  onChipClick?: (chip: AttachmentChipData) => void;
  inProject?: boolean;
  onManageProject?: () => void;
  /** Drag is happening anywhere over the window (set by parent) */
  externalDragging?: boolean;
  /** Enhance button rendered inside the action bar (left of send) */
  enhanceSlot?: ReactNode;
}

/* ─────────────────────────────────────────────────────────────────────────────
   + menu (portal, opens above the button)
───────────────────────────────────────────────────────────────────────────── */

interface PlusMenuProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onUpload: () => void;
  onManageProject?: () => void;
  inProject?: boolean;
}

function PlusMenu({ anchorEl, onClose, onUpload, onManageProject, inProject }: PlusMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!anchorEl) return;
    const tid = setTimeout(() => {
      document.addEventListener("mousedown", handleOutside);
    }, 0);
    window.addEventListener("keydown", handleKey as unknown as EventListener);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      clearTimeout(tid);
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", handleKey as unknown as EventListener);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
    function handleOutside(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        !anchorEl!.contains(e.target as Node)
      ) onClose();
    }
    function handleKey(e: globalThis.KeyboardEvent) { if (e.key === "Escape") onClose(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorEl, onClose]);

  if (!anchorEl || !mounted) return null;

  const rect = anchorEl.getBoundingClientRect();
  const menuW = 204;
  const rows = 1 + (onManageProject ? 1 : 0);
  const menuH = rows * 36 + 12;
  let top = rect.top - menuH - 6;
  if (top < 8) top = rect.bottom + 6;
  let left = rect.left;
  left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] flex flex-col gap-0.5 rounded-xl border border-gray-alpha-200 bg-background p-1.5 shadow-geist-lg"
      style={{ top, left, minWidth: menuW }}
    >
      <button
        type="button"
        onClick={() => { onUpload(); onClose(); }}
        className="flex w-full items-center gap-2.5 rounded-md bg-transparent px-3 py-2 text-left text-[13px] font-medium text-ds-text transition-colors hover:bg-gray-alpha-200"
      >
        <Upload size={16} strokeWidth={2} className="shrink-0 text-ds-text" />
        Upload from computer
      </button>
      {onManageProject && (
        <button
          type="button"
          onClick={() => { onManageProject(); onClose(); }}
          className="flex w-full items-center gap-2.5 rounded-md bg-transparent px-3 py-2 text-left text-[13px] font-medium text-ds-text transition-colors hover:bg-gray-alpha-200"
        >
          <Folder size={16} strokeWidth={2} className="shrink-0 text-ds-text" />
          {inProject ? "Change project" : "Add to project"}
        </button>
      )}
    </div>,
    document.body,
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main component
───────────────────────────────────────────────────────────────────────────── */

export function ChatInputBox({
  value, onChange, onSend, onStop, onFocus, onBlur,
  placeholder = "Type a message...",
  disabled = false, isSending = false, topSlot, bottomSlot,
  mono = false, maxHeight = 200, inputRef: externalInputRef,
  attachments, onAttach, onRemoveAttachment, onChipClick,
  inProject, onManageProject, externalDragging = false,
  enhanceSlot,
}: ChatInputBoxProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusBtnRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [localDragging, setLocalDragging] = useState(false);
  const dragCountRef = useRef(0);

  // Show drag state when file is over the input OR anywhere in the window
  const dragging = localDragging || externalDragging;

  const setTextareaRef = useCallback((el: HTMLTextAreaElement | null) => {
    (internalRef as MutableRefObject<HTMLTextAreaElement | null>).current = el;
    if (externalInputRef) (externalInputRef as MutableRefObject<HTMLTextAreaElement | null>).current = el;
  }, [externalInputRef]);

  useEffect(() => {
    const el = internalRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [value, maxHeight]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (value.trim() && !disabled) onSend();
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCountRef.current += 1;
    setLocalDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current = Math.max(0, dragCountRef.current - 1);
    if (dragCountRef.current === 0) setLocalDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    (e.nativeEvent as DragEvent & { _handledByInputBox?: boolean })._handledByInputBox = true;
    dragCountRef.current = 0;
    setLocalDragging(false);
    if (e.dataTransfer.files.length > 0 && onAttach) onAttach(e.dataTransfer.files);
  };

  const canSend = value.trim().length > 0 && !disabled;
  const canStop = isSending && typeof onStop === "function";
  const actionDisabled = !canSend && !canStop;
  const hasAttachments = attachments && attachments.length > 0;

  return (
    <div className="w-full">
      {/* Input pill — p-3 matches v0 uniform 12px padding */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          "relative cursor-text rounded-xl bg-background-100 p-3 transition-[border-color] duration-150",
          dragging
            ? "border border-dashed border-gray-alpha-400"
            : "border border-gray-alpha-400 hover:border-gray-alpha-500 focus-within:border-gray-alpha-500",
        )}
      >
        {/* Drop overlay — matches v0: dashed border + bg-gray-alpha-100 + full text */}
        {dragging && (
          <div className="pointer-events-none absolute inset-[-1px] z-20 flex items-center justify-center rounded-[inherit] border border-dashed border-gray-alpha-500 bg-background-100">
            <span className="flex items-center gap-2 font-medium text-[13px] text-ds-text">
              <Plus size={16} strokeWidth={2} className="shrink-0" />
              Drop files here to add as attachments
            </span>
          </div>
        )}

        {/* Chips */}
        {hasAttachments && (
          <div className={cn("flex flex-wrap gap-1.5 pb-2", dragging && "invisible")}>
            {attachments!.map((chip) => (
              <AttachmentChip
                key={chip.id}
                chip={chip}
                removable
                onRemove={onRemoveAttachment}
                onClick={onChipClick}
              />
            ))}
          </div>
        )}

        {topSlot && <div className={cn("pb-2", dragging && "invisible")}>{topSlot}</div>}

        {/* Textarea — no extra padding, container p-3 handles it; pb-2 gives gap to toolbar */}
        <Textarea
          ref={setTextareaRef}
          variant="chat"
          size="md"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          textareaClassName={cn(
            "chat-input-textarea w-full resize-none border-none outline-none bg-transparent p-0 text-[15px] leading-6 text-ds-text placeholder:text-ds-text-tertiary min-h-[54px] block disabled:opacity-50",
            dragging && "invisible",
          )}
          style={{ maxHeight, overflowY: "hidden" }}
        />

        {/* Toolbar — items-end aligns to bottom of multi-line content */}
        <div className={cn("flex items-center gap-1 pt-2", dragging && "invisible")}>
          {/* Left: + and extra controls */}
          <div className="flex flex-1 items-end gap-0.5 sm:gap-1">
            {onAttach && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="sr-only"
                  multiple
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) onAttach(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button
                  ref={plusBtnRef}
                  type="button"
                  disabled={disabled}
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="Attach files"
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent text-ds-text-tertiary transition-colors hover:bg-gray-alpha-200 hover:text-ds-text disabled:opacity-50",
                    menuOpen && "bg-gray-alpha-200 text-ds-text",
                  )}
                >
                  <Plus size={16} strokeWidth={2} />
                </button>

                {menuOpen && (
                  <PlusMenu
                    anchorEl={plusBtnRef.current}
                    onClose={() => setMenuOpen(false)}
                    onUpload={() => fileInputRef.current?.click()}
                    onManageProject={onManageProject}
                    inProject={inProject}
                  />
                )}
              </>
            )}
          </div>

          {/* Right: enhance + send */}
          <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
            {enhanceSlot}
            <Button
              variant="default"
              shape="square"
              size="sm"
              iconOnly
              disabled={actionDisabled}
              onClick={() => {
                if (canStop) { onStop?.(); return; }
                if (canSend) onSend();
              }}
              title={canStop ? "Stop generation" : canSend ? "Send (Enter)" : "Type a message"}
              className="active:scale-[0.88] !h-7 !w-7 overflow-hidden rounded-md"
            >
              {canStop ? (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.75" />
                  <rect x="5.5" y="5.5" width="7" height="7" rx="1" fill="currentColor" />
                </svg>
              ) : (
                <ArrowUp size={16} strokeWidth={2} />
              )}
            </Button>
          </div>
        </div>
      </div>

      {bottomSlot && <div className="mt-2">{bottomSlot}</div>}
    </div>
  );
}
