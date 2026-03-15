"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { ChevronDown, ChevronUp, PieChart, Star, Pencil, Trash2 } from "lucide-react";
import { UserLevelToggle } from "@/components/user-level-toggle";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { useChatStore } from "@/lib/store/chatStore";
import { useI18nStore } from "@/lib/store/i18nStore";
import { useTheme } from "next-themes";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { ScoreDashboard } from "@/components/ScoreDashboard";
import { ChatSidebar } from "@/components/ChatSidebar";
import { UserMenuDropdown } from "@/components/UserMenuDropdown";
import { OnboardingModal } from "@/components/OnboardingModal";
import { AccountSettingsModal } from "@/components/modals/AccountSettingsModal";
import { FeedbackModal } from "@/components/modals/FeedbackModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { RenameChatModal } from "@/components/modals/RenameChatModal";
import { useTranslation } from "@/lib/store/i18nStore";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

const LEVEL_META: Record<1 | 2 | 3, {
  tag: string;
  description: string;
  variant: "green-subtle" | "blue-subtle" | "amber-subtle";
}> = {
  1: { tag: "Guided", description: "Simple chat with hints", variant: "green-subtle" },
  2: { tag: "Constructor", description: "Model and generation parameters", variant: "blue-subtle" },
  3: { tag: "Engineer", description: "System prompt, variables, RAW JSON", variant: "amber-subtle" },
};

const VARIANT_ACCENT: Record<string, { border: string; text: string; bgSubtle: string }> = {
  "green-subtle": { border: "border-geist-success/30", text: "text-geist-success", bgSubtle: "bg-geist-success/[0.09]" },
  "blue-subtle": { border: "border-geist-blue/30", text: "text-geist-blue", bgSubtle: "bg-geist-blue/[0.09]" },
  "amber-subtle": { border: "border-geist-amber/30", text: "text-geist-amber", bgSubtle: "bg-geist-amber/[0.09]" },
};

/* Level badge */
function LevelIndicator() {
  const { level, normalizedScore, hasAnalyzed } = useUserLevelStore();
  const meta = LEVEL_META[level];
  return (
    <div className="flex items-center gap-2.5">
      <Badge variant={meta.variant as any} size="lg">
        <span className="font-mono opacity-70">L{level}</span>
        {meta.tag}
      </Badge>
      {hasAnalyzed && (
        <span className="font-mono text-sm text-ds-text-tertiary">
          {Math.round(normalizedScore * 100)}%
        </span>
      )}
    </div>
  );
}

/* Level-up toast */
function LevelUpNotification() {
  const level = useUserLevelStore((s) => s.level);
  const lastLevelChangeTs = useUserLevelStore((s) => s.lastLevelChangeTs);
  const [show, setShow] = useState(false);
  const [direction, setDir] = useState<"up" | "down">("up");
  const prevRef = useRef<number>(level);
  const seenTsRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (lastLevelChangeTs > seenTsRef.current && level !== prevRef.current) {
      seenTsRef.current = lastLevelChangeTs;
      setDir(level > prevRef.current ? "up" : "down");
      prevRef.current = level;
      setShow(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setShow(false), 6000);
    }
  }, [lastLevelChangeTs, level]);

  if (!show) return null;

  const meta = LEVEL_META[level];
  const accent = VARIANT_ACCENT[meta.variant];
  const isUp = direction === "up";

  return (
    <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 animate-toast">
      <div
        className={`flex items-center gap-4 rounded-xl px-5 py-4 shadow-geist-lg bg-background border min-w-[320px] ${isUp ? accent.border : "border-gray-alpha-300"}`}
      >
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accent.bgSubtle}`}>
          {isUp ? (
            <ChevronUp size={16} strokeWidth={2} className={accent.text} />
          ) : (
            <ChevronDown size={16} strokeWidth={2} className="text-ds-text-tertiary" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-base font-semibold text-ds-text">
            Level changed to L{level} · {meta.tag}
          </p>
          <p className="text-sm text-ds-text-tertiary mt-0.5">
            {isUp ? "Your prompts are getting more advanced" : "Interface simplified"}
          </p>
        </div>
        <button
          type="button"
         
          onClick={() => setShow(false)}
          className="flex h-7 w-7 items-center justify-center rounded-full text-sm transition-colors hover:bg-gray-alpha-300 text-ds-text-tertiary"
        >
          ×
        </button>
      </div>
    </div>
  );
}

/* Active chat title in header */
function ActiveChatTitle() {
  const { chats, activeChatId, renameChat, deleteChat } = useChatStore();
  const { t } = useTranslation();
  const activeChat = chats.find((c) => c.id === activeChatId);
  const title = activeChat?.title ?? "New Chat";

  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);

  const startRename = useCallback(() => {
    setMenuOpen(false);
    if (!activeChatId) return;
    setRenameOpen(true);
  }, [activeChatId]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
       
        onClick={() => setMenuOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-gray-alpha-100 text-ds-text"
        aria-label="Chat options"
      >
        <span className="text-[15px] font-medium max-w-[260px] truncate leading-snug">{title}</span>
        <ChevronDown size={16} strokeWidth={2} className="shrink-0 text-ds-text-tertiary" />
      </button>
      {menuOpen && (
        <ActionMenu
          align="start"
          anchorEl={btnRef.current}
          onClose={() => setMenuOpen(false)}
          items={[
            {
              label: t("sidebar.star"),
              icon: <Star size={14} strokeWidth={2} />,
              onClick: () => { },
            },
            {
              label: t("sidebar.rename"),
              icon: <Pencil size={14} strokeWidth={2} />,
              onClick: startRename,
            },
            {
              label: t("sidebar.delete"),
              icon: <Trash2 size={14} strokeWidth={2} />,
              onClick: () => { if (activeChatId) deleteChat(activeChatId); },
              variant: "danger",
            },
          ]}
        />
      )}
      <RenameChatModal
        open={renameOpen}
        onOpenChange={setRenameOpen}
        initialTitle={activeChat?.title ?? ""}
        onSave={async (nextTitle) => {
          if (!activeChatId) return;
          await renameChat(activeChatId, nextTitle);
        }}
      />
    </>
  );
}

/* Root page */
export default function HomePage() {
  const { data: session } = useSession();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { activeChatId, selectChat, chats } = useChatStore();
  const { setTheme } = useTheme();
  const prefsFetched = useRef(false);

  useEffect(() => {
    const email = session?.user?.email;
    if (email && !prefsFetched.current) {
      prefsFetched.current = true;
      useUserLevelStore.getState().setUserEmail(email);

      fetch("/api/profile/preferences")
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch preferences");
          return res.json();
        })
        .then((data) => {
          if (data.language) {
            useI18nStore.getState().setLanguage(data.language as "en" | "uk");
          }
          if (data.theme) {
            document.documentElement.classList.add("theme-transitioning");
            setTheme(data.theme);
            setTimeout(() => {
              document.documentElement.classList.remove("theme-transitioning");
            }, 50);
          }
          if (Array.isArray(data.hidden_templates)) {
            useUserLevelStore.setState({ hiddenTemplates: data.hidden_templates });
          }
        })
        .catch((err) => {
          console.error("Failed to load preferences on start:", err);
          prefsFetched.current = false;
        });
    }
  }, [session?.user?.email, setTheme]);

  useEffect(() => {
    if (!activeChatId && chats.length > 0) selectChat(chats[0].id);
  }, [activeChatId, chats, selectChat]);

  return (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        {/* Left sidebar — chat history */}
        <ChatSidebar />

        {/* Main column */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header — Glassmorphism */}
          <header
            className="sticky top-0 z-50 flex shrink-0 items-center justify-between px-6 py-3.5 border-b border-gray-alpha-300 bg-background/60 backdrop-blur-md"
          >
            {/* Left: active chat title + level badge */}
            <div className="flex items-center gap-3">
              <ActiveChatTitle />
              <div className="h-5 w-px bg-gray-alpha-200" />
              <LevelIndicator />
            </div>

            {/* Right: controls */}
            <div className="flex items-center gap-2.5">
              <SheetTrigger asChild>
                <button type="button" className="btn-ghost flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm text-ds-text-secondary">
                  <PieChart size={16} strokeWidth={2} />
                  Score
                </button>
              </SheetTrigger>

              <div className="h-5 w-px bg-gray-alpha-200" />
              <UserLevelToggle />
              <div className="h-5 w-px bg-gray-alpha-200" />
              <UserMenuDropdown 
                onOpenAccountSettings={() => setAccountSettingsOpen(true)}
                onOpenFeedback={() => setFeedbackOpen(true)}
              />
            </div>
          </header>

          {/* Adaptive chat area */}
          <main className="flex flex-1 overflow-hidden px-0 pt-0 pb-0">
            <ChatLayout />
          </main>
        </div>

        <LevelUpNotification />
        <OnboardingModal />
        <AccountSettingsModal open={accountSettingsOpen} onOpenChange={setAccountSettingsOpen} />
        <FeedbackModal open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      </div>

      {/* Score Sheet — rendered outside header to avoid clipping */}
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Experience Score</SheetTitle>
          <SheetDescription>Prompt and behavior analysis</SheetDescription>
        </SheetHeader>
        <div className="mt-4 flex-1 overflow-y-auto">
          <ScoreDashboard />
        </div>
      </SheetContent>
    </Sheet>
  );
}