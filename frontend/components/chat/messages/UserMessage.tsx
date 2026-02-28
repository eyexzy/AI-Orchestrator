"use client";

import { useState, useRef, useEffect } from "react";
import {
  Pencil,
  X,
  Send,
} from "lucide-react";
import { useChatStore } from "@/lib/store/chatStore";
import { ActionBtn } from "./MessageUI";

/* ─────────────────────────────────────────────────────────────────
 *  User message with inline edit
 * ────────────────────────────────────────────────────────────── */
export function UserMessageBubble({
  id,
  content,
  isOptimistic,
}: {
  id: string | number;
  content: string;
  isOptimistic?: boolean;
}) {
  const { editAndResend, isSending } = useChatStore();
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState(content);
  const textareaRef             = useRef<HTMLTextAreaElement>(null);

  // Auto-focus + auto-resize textarea
  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editing]);

  const handleAutoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const handleSave = () => {
    const trimmed = draft.trim();
    if (!trimmed || isSending) return;
    setEditing(false);
    editAndResend(id, trimmed);
  };

  const handleCancel = () => {
    setDraft(content);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSave(); }
    if (e.key === "Escape") handleCancel();
  };

  if (editing) {
    return (
      <div style={{ maxWidth: "min(78%, 600px)" }}>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); handleAutoResize(); }}
          onKeyDown={handleKeyDown}
          rows={1}
          className="chat-input-textarea"
          style={{
            width: "100%",
            resize: "none",
            border: "1px solid rgba(123,147,255,0.4)",
            borderRadius: 12,
            background: "rgb(var(--surface-3))",
            color: "rgb(var(--text-1))",
            padding: "10px 14px",
            fontSize: 14,
            lineHeight: 1.65,
            outline: "none",
            overflowY: "hidden",
            boxShadow: "0 0 0 3px rgba(123,147,255,0.10)",
          }}
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "transparent",
              color: "rgb(var(--text-3))",
              fontSize: 12,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <X size={12} strokeWidth={2.2} />
            Скасувати
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!draft.trim() || isSending}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 14px",
              borderRadius: 8,
              border: "none",
              background: "rgb(var(--accent-blue))",
              color: "#fff",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              opacity: !draft.trim() || isSending ? 0.4 : 1,
              transition: "opacity 0.15s",
            }}
          >
            <Send size={12} strokeWidth={2.2} />
            Зберегти й надіслати
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex flex-col items-end">
      <div
        className={`msg-user px-4 py-2.5 text-[14px] leading-relaxed ${isOptimistic ? "opacity-60" : ""}`}
        style={{ color: "rgb(var(--text-1))" }}
      >
        {content}
      </div>
      {/* Action bar — edit */}
      <div className="flex items-center gap-0.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <ActionBtn onClick={() => { setDraft(content); setEditing(true); }} label="Редагувати">
          <Pencil size={13} strokeWidth={2.2} />
        </ActionBtn>
      </div>
    </div>
  );
}
