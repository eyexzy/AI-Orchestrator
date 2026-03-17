"use client";

import { useEffect, useState, useRef, memo } from "react";
import { useSession } from "next-auth/react";
import {
  SquarePen,
  Sidebar,
  Search,
  MessageSquare,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Sun,
  Star,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useChatStore, type ChatSession } from "@/lib/store/chatStore";
import { ChatSearchModal } from "@/components/ChatSearchModal";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { RenameChatModal } from "@/components/modals/RenameChatModal";
import { useTranslation } from "@/lib/store/i18nStore";

/* Constants */
const SIDEBAR_W = 300;
const COLLAPSED_W = 68;

/* Shared button class for New Chat / Search / Settings */
const sidebarBtn =
  "w-full justify-start gap-3 rounded-lg px-3 h-10 text-[15px] text-foreground hover:bg-gray-alpha-200 overflow-hidden shadow-none";

/* Group chats by date */
function groupChatsByDate(chats: ChatSession[], labels: { today: string; yesterday: string; week: string; earlier: string }) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; items: ChatSession[] }[] = [
    { label: labels.today, items: [] },
    { label: labels.yesterday, items: [] },
    { label: labels.week, items: [] },
    { label: labels.earlier, items: [] },
  ];

  for (const chat of chats) {
    const d = new Date(chat.updated_at);
    if (d >= today) groups[0].items.push(chat);
    else if (d >= yesterday) groups[1].items.push(chat);
    else if (d >= weekAgo) groups[2].items.push(chat);
    else groups[3].items.push(chat);
  }
  return groups.filter((g) => g.items.length > 0);
}

/* Chat item */
const ChatItem = memo(function ChatItem({
  chat,
  isActive,
  onSelect,
  onDelete,
  onOpenRename,
  onToggleFavorite,
}: {
  chat: ChatSession;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onOpenRename: () => void;
  onToggleFavorite: () => void;
}) {
  const { t }: { t: (key: string) => string } = useTranslation();
  const dotsRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
        className={`group relative flex w-full items-center gap-3 rounded-lg border-none px-3 py-2.5 text-left cursor-pointer transition-all duration-100 ${isActive
          ? "bg-gray-alpha-200 text-ds-text font-medium"
          : "bg-transparent text-ds-text-secondary hover:bg-gray-alpha-200 hover:text-ds-text"
          }`}
      >


        <MessageSquare
          size={16}
          strokeWidth={2}
          className={`shrink-0 ${isActive ? "opacity-65" : "opacity-30"}`}
        />

        <span className={`flex-1 truncate text-[15px] leading-snug transition-all duration-300 ${useChatStore.getState().sidebarOpen ? "opacity-100 w-auto ml-1" : "opacity-0 w-0 hidden m-0"}`}>
          {chat.title}
        </span>
        {useChatStore.getState().sidebarOpen && (
          <button
            ref={dotsRef}
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-0 transition-all group-hover:opacity-100 hover:bg-gray-alpha-300 text-ds-text-tertiary"
            aria-label="Chat options"
          >
            <MoreHorizontal size={16} strokeWidth={2} />
          </button>
        )}
      </div>

      {menuOpen && (
        <ActionMenu
          align="end"
          anchorEl={dotsRef.current}
          onClose={() => setMenuOpen(false)}
          items={[
            {
              label: chat.is_favorite ? t("sidebar.unstar") : t("sidebar.star"),
              icon: <Star size={14} strokeWidth={2} className={chat.is_favorite ? "fill-current text-amber-500" : ""} />,
              onClick: () => { setMenuOpen(false); onToggleFavorite(); },
            },
            {
              label: t("sidebar.rename"),
              icon: <Pencil size={14} strokeWidth={2} />,
              onClick: () => {
                setMenuOpen(false);
                onOpenRename();
              },
            },
            {
              label: t("sidebar.delete"),
              icon: <Trash2 size={14} strokeWidth={2} />,
              onClick: onDelete,
              variant: "danger",
            },
          ]}
        />
      )}
    </>
  );
});

/* Main sidebar */
export function ChatSidebar() {
  const { t }: { t: (key: string) => string } = useTranslation();
  const { data: session } = useSession();
  const {
    chats, activeChatId, isLoadingChats, sidebarOpen,
    setSidebarOpen, toggleSidebar, loadChats,
    selectChat, createNewChat, deleteChat, renameChat, toggleFavorite,
  } = useChatStore(useShallow((s) => ({
    chats: s.chats,
    activeChatId: s.activeChatId,
    isLoadingChats: s.isLoadingChats,
    sidebarOpen: s.sidebarOpen,
    setSidebarOpen: s.setSidebarOpen,
    toggleSidebar: s.toggleSidebar,
    loadChats: s.loadChats,
    selectChat: s.selectChat,
    createNewChat: s.createNewChat,
    deleteChat: s.deleteChat,
    renameChat: s.renameChat,
    toggleFavorite: s.toggleFavorite,
  })));

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ChatSession | null>(null);

  const userEmail = session?.user?.email ?? "anonymous";
  useEffect(() => { if (userEmail) loadChats(userEmail); }, [userEmail, loadChats]);

  // Cmd+K / Ctrl+K to toggle search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleNew = async () => {
    const activeChat = chats.find((c) => c.id === activeChatId);
    if (activeChat && activeChat.message_count === 0) return;
    await createNewChat(userEmail);
  };

  const handleOpenRenameModal = (chat: ChatSession) => {
    setRenameTarget(chat);
    setRenameModalOpen(true);
  };


  const groups = groupChatsByDate(chats, {
    today: t("sidebar.today"),
    yesterday: t("sidebar.yesterday"),
    week: t("sidebar.7days"),
    earlier: t("sidebar.earlier"),
  });

  return (
    <div
      className="flex h-full shrink-0 flex-col border-r border-gray-alpha-200 bg-background-100 overflow-hidden"
      style={{ width: sidebarOpen ? SIDEBAR_W : COLLAPSED_W }}
    >
      {/* Top bar */}
      <div className="relative flex items-center px-4 py-3.5 shrink-0 h-[60px] overflow-hidden">
        <div className={`flex items-center gap-3 ${sidebarOpen ? "opacity-100" : "opacity-0"}`}>
          <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0 bg-geist-blue/10 border border-geist-blue/20">
            <Sun size={14} strokeWidth={2} className="text-geist-blue" />
          </div>
          <span className="text-base font-semibold tracking-tight text-ds-text whitespace-nowrap">
            Orchestrator
          </span>
        </div>

        <div className={`absolute top-3.5 ${sidebarOpen ? "right-4" : "left-1/2 -translate-x-1/2"}`}>
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? t("sidebar.collapse") : t("sidebar.openSidebar")}
          >
            <Sidebar size={18} strokeWidth={2} className="text-ds-text-secondary" />
          </Button>
        </div>
      </div>

      {/* New Chat */}
      <div className="px-3 pb-1 shrink-0">
        <Button
          type="button"
          variant="tertiary"
          size="md"
          onClick={handleNew}
          className={sidebarBtn}
          aria-label={t("sidebar.newChat")}
          leftIcon={<SquarePen size={18} strokeWidth={2} className="shrink-0" />}
        >
          <span className={`whitespace-nowrap ${sidebarOpen ? "opacity-100" : "opacity-0"}`}>
            {t("sidebar.newChat")}
          </span>
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2 shrink-0">
        <Button
          type="button"
          variant="tertiary"
          size="md"
          onClick={() => setIsSearchOpen(true)}
          className={sidebarBtn}
          aria-label={t("sidebar.search")}
          leftIcon={<Search size={18} strokeWidth={2} className="shrink-0" />}
        >
          <span className={`whitespace-nowrap ${sidebarOpen ? "opacity-100" : "opacity-0"}`}>
            {t("sidebar.search")}
          </span>
        </Button>
      </div>

      {/* Chat list */}
      <div className={`flex-1 overflow-y-auto px-3 py-1 min-h-0 text-base ${sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        {isLoadingChats ? (
          <div className="flex items-center justify-center gap-2 py-10">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-alpha-200 border-t-gray-alpha-400" />
            <span className="text-sm text-ds-text-tertiary">{t("sidebar.loading")}</span>
          </div>
        ) : chats.length === 0 ? (
          <div className="px-2 py-10 text-center">
            <div className="mb-3 flex justify-center opacity-[0.15]">
              <MessageSquare size={32} strokeWidth={2} className="text-ds-text-secondary" />
            </div>
            <p className="text-sm text-ds-text-tertiary">{t("sidebar.noChats")}</p>
            <Button
              type="button"
              variant="tertiary"
              size="md"
              onClick={handleNew}
              className="mt-3 px-4 text-sm text-ds-text-secondary hover:bg-gray-alpha-200 shadow-none"
              leftIcon={<Plus size={14} strokeWidth={2} />}
            >
              {t("sidebar.create")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.label}>
                <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-widest font-mono text-ds-text-tertiary whitespace-nowrap">
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
                      onOpenRename={() => handleOpenRenameModal(chat)}
                      onToggleFavorite={() => toggleFavorite(chat.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ChatSearchModal open={isSearchOpen} onOpenChange={setIsSearchOpen} />
      <RenameChatModal
        open={renameModalOpen}
        onOpenChange={setRenameModalOpen}
        initialTitle={renameTarget?.title ?? ""}
        onSave={async (nextTitle) => {
          if (!renameTarget) return;
          await renameChat(renameTarget.id, nextTitle);
        }}
      />
    </div>
  );
}