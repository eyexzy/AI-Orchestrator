"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  SquarePen,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  MessageSquare,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { useChatStore, type ChatSession } from "@/lib/store/chatStore";

function groupChatsByDate(chats: ChatSession[]) {
  const now       = new Date();
  const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo   = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; items: ChatSession[] }[] = [
    { label: "Сьогодні", items: [] },
    { label: "Вчора",    items: [] },
    { label: "7 днів",   items: [] },
    { label: "Раніше",   items: [] },
  ];

  for (const chat of chats) {
    const d = new Date(chat.updated_at);
    if (d >= today)     groups[0].items.push(chat);
    else if (d >= yesterday) groups[1].items.push(chat);
    else if (d >= weekAgo)   groups[2].items.push(chat);
    else                     groups[3].items.push(chat);
  }
  return groups.filter((g) => g.items.length > 0);
}

function ChatItem({
  chat, isActive, onSelect, onDelete, onRename,
}: {
  chat: ChatSession;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (t: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle]     = useState(chat.title);
  const inputRef              = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = () => {
    const t = title.trim();
    if (t && t !== chat.title) onRename(t);
    setEditing(false);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={editing ? undefined : onSelect}
      onKeyDown={(e) => {
        if (!editing && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer transition-all duration-100 ${
        isActive
          ? "text-[rgb(var(--text-1))]"
          : "text-[rgb(var(--text-2))] hover:text-[rgb(var(--text-1))]"
      }`}
      style={{ background: isActive ? "rgba(255,255,255,0.06)" : undefined }}
    >
      {/* Active accent bar */}
      {isActive && (
        <div
          className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full"
          style={{ background: "rgba(123,147,255,0.7)" }}
        />
      )}

      <MessageSquare
        size={13}
        strokeWidth={2.2}
        className="shrink-0"
        style={{ opacity: isActive ? 0.65 : 0.3 }}
      />

      {editing ? (
        <form
          className="flex flex-1 items-center gap-1"
          onSubmit={(e) => { e.preventDefault(); commit(); }}
        >
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
            className="h-5 flex-1 rounded px-1.5 text-[12px] outline-none"
            style={{ background: "rgba(255,255,255,0.07)", color: "rgb(var(--text-1))" }}
          />
          <button type="submit" className="shrink-0 text-[10px] opacity-50 hover:opacity-100">
            ✓
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="shrink-0 text-[10px] opacity-50 hover:opacity-100"
          >
            ✕
          </button>
        </form>
      ) : (
        <>
          <span className="flex-1 truncate text-[13px] leading-snug">{chat.title}</span>
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setTitle(chat.title);
                setEditing(true);
              }}
              className="flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-white/10"
              style={{ color: "rgb(var(--text-3))" }}
              title="Перейменувати"
            >
              <Pencil size={10} strokeWidth={2.2} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="flex h-5 w-5 items-center justify-center rounded transition-colors hover:text-red-400"
              style={{ color: "rgb(var(--text-3))" }}
              title="Видалити"
            >
              <Trash2 size={10} strokeWidth={2.2} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function ChatSidebar() {
  const { data: session } = useSession();
  const {
    chats, activeChatId, isLoadingChats, sidebarOpen,
    setSidebarOpen, toggleSidebar, loadChats,
    selectChat, createNewChat, deleteChat, renameChat,
  } = useChatStore();

  const userEmail = session?.user?.email ?? "anonymous";
  useEffect(() => { if (userEmail) loadChats(userEmail); }, [userEmail, loadChats]);

  const handleNew = async () => { await createNewChat(userEmail); };

  /* ── Collapsed state ── */
  if (!sidebarOpen) {
    return (
      <div
        className="flex flex-col items-center gap-1.5 py-3 px-2 shrink-0"
        style={{
          width: 52,
          borderRight: "1px solid rgba(255,255,255,0.06)",
          background: "rgb(var(--surface))",
        }}
      >
        <button
          onClick={toggleSidebar}
          className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.05]"
          style={{ color: "rgb(var(--text-3))" }}
          title="Відкрити сайдбар"
        >
          <PanelLeftOpen size={16} strokeWidth={2.2} />
        </button>
        <div className="h-px w-5 my-0.5" style={{ background: "rgba(255,255,255,0.06)" }} />
        <button
          onClick={handleNew}
          className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.05]"
          style={{ color: "rgb(var(--text-3))" }}
          title="Новий чат"
        >
          <SquarePen size={14} strokeWidth={2.2} />
        </button>
      </div>
    );
  }

  const groups = groupChatsByDate(chats);

  return (
    <div
      className="flex h-full w-[260px] shrink-0 flex-col"
      style={{
        borderRight: "1px solid rgba(255,255,255,0.06)",
        background: "rgb(var(--surface))",
      }}
    >
      {/* ── Top bar ── */}
      <div
        className="flex items-center justify-between px-3.5 py-3 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-6 w-6 items-center justify-center rounded-md shrink-0"
            style={{
              background: "rgba(123,147,255,0.13)",
              border: "1px solid rgba(123,147,255,0.2)",
            }}
          >
            {/* Keep the radial/sunburst logo as-is — it's a custom mark, not a UI icon */}
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgb(163,178,255)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
            </svg>
          </div>
          <span
            className="font-display text-[13px] font-semibold tracking-tight"
            style={{ color: "rgb(var(--text-1))" }}
          >
            Orchestrator
          </span>
        </div>

        <button
          onClick={() => setSidebarOpen(false)}
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.05]"
          style={{ color: "rgb(var(--text-3))" }}
          title="Згорнути"
        >
          <PanelLeftClose size={15} strokeWidth={2.2} />
        </button>
      </div>

      {/* ── New Chat button ── */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <button
          onClick={handleNew}
          className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] font-medium transition-all duration-150 active:scale-[0.98]"
          style={{
            background: "rgba(123,147,255,0.10)",
            border: "1px solid rgba(123,147,255,0.18)",
            color: "rgb(163,178,255)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(123,147,255,0.15)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(123,147,255,0.10)";
          }}
        >
          <SquarePen size={14} strokeWidth={2.2} className="shrink-0" />
          Новий чат
        </button>
      </div>

      {/* ── Search (decorative) ── */}
      <div className="px-3 pb-2.5 shrink-0">
        <div
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 cursor-text"
          style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <Search size={12} strokeWidth={2.2} style={{ color: "rgb(var(--text-3))", flexShrink: 0 }} />
          <span className="text-[12px] select-none" style={{ color: "rgb(var(--text-3))" }}>
            Пошук чатів...
          </span>
        </div>
      </div>

      {/* ── Chat list ── */}
      <div className="flex-1 overflow-y-auto px-2 py-1 min-h-0">
        {isLoadingChats ? (
          <div className="flex items-center justify-center gap-2 py-10">
            <div
              className="h-3.5 w-3.5 animate-spin rounded-full"
              style={{
                border: "2px solid rgba(255,255,255,0.08)",
                borderTopColor: "rgba(255,255,255,0.35)",
              }}
            />
            <span className="text-[11px]" style={{ color: "rgb(var(--text-3))" }}>
              Завантаження...
            </span>
          </div>
        ) : chats.length === 0 ? (
          <div className="px-2 py-10 text-center">
            <div className="mb-3 flex justify-center" style={{ opacity: 0.15 }}>
              <MessageSquare size={28} strokeWidth={1.8} style={{ color: "rgb(var(--text-2))" }} />
            </div>
            <p className="text-[12px]" style={{ color: "rgb(var(--text-3))" }}>
              Немає чатів
            </p>
            <button
              onClick={handleNew}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] transition-colors hover:bg-white/5"
              style={{
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgb(var(--text-2))",
              }}
            >
              <Plus size={11} strokeWidth={2.5} />
              Створити
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.label}>
                <p
                  className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-widest font-mono"
                  style={{ color: "rgb(var(--text-3))" }}
                >
                  {g.label}
                </p>
                <div className="space-y-0.5">
                  {g.items.map((chat) => (
                    <ChatItem
                      key={chat.id}
                      chat={chat}
                      isActive={chat.id === activeChatId}
                      onSelect={() => selectChat(chat.id)}
                      onDelete={() => deleteChat(chat.id)}
                      onRename={(t) => renameChat(chat.id, t)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div
        className="shrink-0 px-2 py-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] transition-colors hover:bg-white/[0.04]"
          style={{ color: "rgb(var(--text-3))" }}
        >
          <Settings size={14} strokeWidth={2.2} className="shrink-0" />
          Налаштування
        </button>
      </div>
    </div>
  );
}