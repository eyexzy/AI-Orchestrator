"use client";

import { useEffect, useRef } from "react";
import { MessageCircleQuestion, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/store/i18nStore";
import { useMicroFeedbackStore } from "@/lib/store/microFeedbackStore";

const AUTO_DISMISS_MS = 20_000; // auto-hide after 20 s

export function MicroFeedbackToast() {
  const { t } = useTranslation();
  const activePrompt = useMicroFeedbackStore((s) => s.activePrompt);
  const answer = useMicroFeedbackStore((s) => s.answer);
  const dismiss = useMicroFeedbackStore((s) => s.dismiss);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (activePrompt) {
      timerRef.current = setTimeout(dismiss, AUTO_DISMISS_MS);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activePrompt, dismiss]);

  if (!activePrompt) return null;

  const questionText = t(activePrompt.textKey) ?? activePrompt.textKey;

  return (
    <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 animate-toast">
      <div className="flex items-center gap-3 rounded-xl border border-geist-blue/30 bg-background px-5 py-3.5 shadow-geist-lg min-w-[340px] max-w-[520px]">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-geist-blue/[0.09]">
          <MessageCircleQuestion size={16} strokeWidth={2} className="text-geist-blue" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[13px] leading-snug text-ds-text">{questionText}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {activePrompt.options.map((opt) => (
              <Button
                key={opt.value}
                variant="secondary"
                size="sm"
                className="h-7 rounded-full px-3 text-[12px]"
                onClick={() => answer(opt.value)}
              >
                {t(opt.labelKey) ?? opt.value}
              </Button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ds-text-tertiary transition-colors hover:bg-gray-alpha-200 hover:text-ds-text"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}