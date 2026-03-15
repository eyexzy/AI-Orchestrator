"use client";

import { useRef, useEffect, useCallback, type KeyboardEvent, type ReactNode, type RefObject, type MutableRefObject } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
/* Main component */
export interface ChatInputBoxProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  topSlot?: ReactNode;
  bottomSlot?: ReactNode;
  mono?: boolean;
  maxHeight?: number;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}

export function ChatInputBox({
  value, onChange, onSend, onFocus, onBlur,
  placeholder = "Type a message...",
  disabled = false, topSlot, bottomSlot,
  mono = false, maxHeight = 200, inputRef: externalInputRef,
}: ChatInputBoxProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  const canSend = value.trim().length > 0 && !disabled;



  return (
    <div className="w-full">
      {/* The floating pill */}
      <div
        ref={wrapperRef}
        className="flex flex-col rounded-xl border border-gray-alpha-400 bg-background overflow-hidden transition-all duration-150 shadow-geist-md hover:border-gray-alpha-500 focus-within:border-gray-alpha-500"
      >
        {topSlot && <div className="px-5 pt-4">{topSlot}</div>}

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
          textareaClassName="chat-input-textarea w-full resize-none border-none outline-none bg-transparent px-5 pt-4 pb-3 text-base leading-[1.7] text-ds-text min-h-[60px] block font-mono"
          style={{ maxHeight, overflowY: "hidden" }}
        />

        {/* Action bar */}
        <div className="flex items-center justify-end px-4 pb-3 pt-1">
          <Button
            variant="default"
            shape="rounded"
            size="md"
            iconOnly
            disabled={!canSend}
            onClick={() => { if (canSend) onSend(); }}
            title={canSend ? "Send (Enter)" : "Type a message"}
            className="active:scale-[0.88]"
          >
            <ArrowUp size={18} strokeWidth={2} />
          </Button>
        </div>
      </div>

      {bottomSlot && <div className="mt-2">{bottomSlot}</div>}
    </div>
  );
}