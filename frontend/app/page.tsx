"use client";

import { useState, useEffect, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { UserLevelToggle } from "@/components/user-level-toggle";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { useChatStore } from "@/lib/store/chatStore";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { ScoreDashboard } from "@/components/ScoreDashboard";
import { ChatSidebar } from "@/components/ChatSidebar";
import { OnboardingModal } from "@/components/OnboardingModal";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

const LEVEL_META: Record<1 | 2 | 3, { tag: string; description: string; badgeClass: string }> = {
  1: { tag: "Guided",      description: "Простий чат із підказками",      badgeClass: "badge-l1" },
  2: { tag: "Constructor", description: "Параметри моделі та генерації",   badgeClass: "badge-l2" },
  3: { tag: "Engineer",    description: "System prompt, змінні, RAW JSON", badgeClass: "badge-l3" },
};

/* ── Level badge ─────────────────────────────────────────────────── */
function LevelIndicator() {
  const { level, normalizedScore, hasAnalyzed } = useUserLevelStore();
  const meta = LEVEL_META[level];
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-500 ${meta.badgeClass}`}
      >
        <span className="font-mono text-[10px] opacity-70">L{level}</span>
        {meta.tag}
      </span>
      {hasAnalyzed && (
        <span className="font-mono text-[11px]" style={{ color: "rgb(var(--text-3))" }}>
          {Math.round(normalizedScore * 100)}%
        </span>
      )}
    </div>
  );
}

/* ── Level-up toast ─────────────────────────────────────────────── */
function LevelUpNotification() {
  const { level, levelJustChanged } = useUserLevelStore();
  const [show, setShow]       = useState(false);
  const [direction, setDir]   = useState<"up" | "down">("up");
  const prevRef  = useRef<number>(level);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (levelJustChanged && level !== prevRef.current) {
      setDir(level > prevRef.current ? "up" : "down");
      prevRef.current = level;
      setShow(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setShow(false), 6000);
    }
  }, [levelJustChanged, level]);

  if (!show) return null;

  const meta        = LEVEL_META[level];
  const isUp        = direction === "up";
  const borderColor = isUp
    ? level === 2 ? "rgba(52,211,153,0.35)" : "rgba(251,191,36,0.35)"
    : "rgba(255,255,255,0.1)";
  const iconColor   = isUp
    ? level === 2 ? "rgb(52,211,153)" : "rgb(251,191,36)"
    : "rgb(var(--text-3))";

  return (
    <div
      className="fixed bottom-6 left-1/2 z-50 animate-toast"
      style={{ transform: "translateX(-50%)" }}
    >
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3 shadow-2xl"
        style={{ background: "rgb(22,22,30)", border: `1px solid ${borderColor}`, minWidth: 280 }}
      >
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${iconColor}18` }}
        >
          {isUp ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 3 18 9" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 15 12 21 18 15" />
            </svg>
          )}
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-semibold" style={{ color: "rgb(var(--text-1))" }}>
            Інтерфейс → L{level} · {meta.tag}
          </p>
          <p className="text-[11px]" style={{ color: "rgb(var(--text-3))" }}>
            {isUp ? "Ваші промпти стають складнішими" : "Інтерфейс спрощено"}
          </p>
        </div>
        <button
          onClick={() => setShow(false)}
          className="flex h-5 w-5 items-center justify-center rounded-full text-xs transition-colors hover:bg-white/10"
          style={{ color: "rgb(var(--text-3))" }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

/* ── User avatar / sign-out ─────────────────────────────────────── */
function UserMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  if (!session?.user) return null;
  const { name, email, image } = session.user;
  const displayName = name || email || "User";
  const initials    = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full transition-all"
        style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}
      >
        {image ? (
          <Image
            src={image}
            alt={displayName}
            width={28}
            height={28}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-[11px] font-medium" style={{ color: "rgb(var(--text-2))" }}>
            {initials}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl p-1.5 shadow-xl"
            style={{ background: "rgb(20,20,28)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="px-2.5 py-2">
              {name  && <p className="text-[13px] font-medium" style={{ color: "rgb(var(--text-1))" }}>{name}</p>}
              {email && <p className="text-[11px]" style={{ color: "rgb(var(--text-3))" }}>{email}</p>}
            </div>
            <div className="divider my-1" />
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] transition-colors hover:bg-white/5"
              style={{ color: "rgb(var(--text-2))" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Вийти
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Active chat title in header ────────────────────────────────── */
function ActiveChatTitle() {
  const { chats, activeChatId } = useChatStore();
  const activeChat = chats.find((c) => c.id === activeChatId);
  const title = activeChat?.title ?? "Новий чат";

  return (
    <button
      className="flex items-center gap-1 rounded-lg px-2 py-1 transition-colors hover:bg-white/[0.04]"
      style={{ color: "rgb(var(--text-1))" }}
      title="Назва чату"
    >
      <span className="text-sm font-medium max-w-[240px] truncate leading-snug">{title}</span>
      <ChevronDown size={13} style={{ color: "rgb(var(--text-3))", flexShrink: 0 }} />
    </button>
  );
}

/* ── Root page ─────────────────────────────────────────────────── */
export default function HomePage() {
  const { data: session } = useSession();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { activeChatId, selectChat, chats } = useChatStore();

  // FIX #1: Sync authenticated user's email into userLevelStore.
  // Before: userLevelStore never knew who the user was — analyzePrompt sent
  //   user_email: "anonymous" in every request, so the backend always used
  //   session_id as the profile key, which resets on every page reload.
  // After: as soon as NextAuth resolves the session, we push the real email
  //   into userLevelStore. All subsequent /analyze calls include it, so
  //   the backend correctly keys UserProfile by email and hysteresis
  //   (the sliding window that prevents level flickering) survives reloads.
  useEffect(() => {
    const email = session?.user?.email;
    if (email) {
      useUserLevelStore.getState().setUserEmail(email);
    }
  }, [session?.user?.email]);

  useEffect(() => {
    if (!activeChatId && chats.length > 0) selectChat(chats[0].id);
  }, [activeChatId, chats, selectChat]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "rgb(var(--bg))" }}>
      {/* Left sidebar — chat history */}
      <ChatSidebar />

      {/* Main column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* ── Header ── */}
        <header
          className="flex shrink-0 items-center justify-between px-5 py-2.5"
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "rgb(var(--surface))",
          }}
        >
          {/* Left: active chat title + level badge */}
          <div className="flex items-center gap-3">
            <ActiveChatTitle />
            <div className="h-4 w-px" style={{ background: "rgba(255,255,255,0.08)" }} />
            <LevelIndicator />
          </div>

          {/* Right: controls */}
          <div className="flex items-center gap-2">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <button
                  className="btn-ghost flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px]"
                  style={{ color: "rgb(var(--text-2))" }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                    <path d="M22 12A10 10 0 0 0 12 2v10z" />
                  </svg>
                  Score
                </button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Experience Score</SheetTitle>
                  <SheetDescription>Аналіз промптів та поведінки</SheetDescription>
                </SheetHeader>
                <div className="mt-4 flex-1 overflow-y-auto">
                  <ScoreDashboard />
                </div>
              </SheetContent>
            </Sheet>

            <div className="h-4 w-px" style={{ background: "rgba(255,255,255,0.06)" }} />
            <UserLevelToggle />
            <div className="h-4 w-px" style={{ background: "rgba(255,255,255,0.06)" }} />
            <UserMenu />
          </div>
        </header>

        {/* ── Adaptive chat area ── */}
        <main className="flex flex-1 overflow-hidden px-0 pt-0 pb-0">
          <ChatLayout />
        </main>
      </div>

      <LevelUpNotification />
      <OnboardingModal />
    </div>
  );
}