"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { Badge } from "@/components/ui/badge";

const LEVEL_META: Record<1 | 2 | 3, {
  tag: string;
  variant: "green-subtle" | "blue-subtle" | "amber-subtle";
}> = {
  1: { tag: "Guided", variant: "green-subtle" },
  2: { tag: "Constructor", variant: "blue-subtle" },
  3: { tag: "Engineer", variant: "amber-subtle" },
};

const VARIANT_ACCENT: Record<string, { border: string; text: string; bgSubtle: string }> = {
  "green-subtle": { border: "border-green-300", text: "text-green-700", bgSubtle: "bg-green-100" },
  "blue-subtle": { border: "border-blue-300", text: "text-blue-700", bgSubtle: "bg-blue-100" },
  "amber-subtle": { border: "border-amber-300", text: "text-amber-700", bgSubtle: "bg-amber-100" },
};

export function LevelUpNotification() {
  const level = useUserLevelStore((s) => s.level);
  const lastLevelChangeTs = useUserLevelStore((s) => s.lastLevelChangeTs);
  const notifyLevelUp = useUserLevelStore((s) => s.notifyLevelUp);
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

  if (!show || !notifyLevelUp) return null;

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
          className="flex h-7 w-7 items-center justify-center rounded-full text-sm transition-colors hover:bg-gray-alpha-300 hover:text-ds-text text-ds-text-tertiary"
        >
          ×
        </button>
      </div>
    </div>
  );
}