"use client";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

interface TutorModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isRefining: boolean;
  originalPrompt: string;
  improvedPrompt: string;
  clarifyingQuestions: string[];
  onSendOriginal: () => void;
  onSendImproved: () => void;
  onCancel: () => void;
}

export function TutorModal({
  open, onOpenChange, isRefining,
  originalPrompt, improvedPrompt, clarifyingQuestions,
  onSendOriginal, onSendImproved, onCancel,
}: TutorModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} onCancel={onCancel}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(123,147,255,0.14)" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgb(163,178,255)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>
            <div>
              <DialogTitle>Покращимо ваш запит</DialogTitle>
              <DialogDescription>ШІ-тьютор допомагає зробити промпт точнішим</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="px-5 py-4 space-y-4">
          {isRefining ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <div className="flex items-center gap-1.5">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="h-2 w-2 rounded-full" style={{ background: "rgb(123,147,255)", animation: `pulse-dot 1.2s ${d}ms infinite` }} />
                ))}
              </div>
              <p className="text-[13px]" style={{ color: "rgb(var(--text-2))" }}>Аналізую запит...</p>
            </div>
          ) : (
            <>
              {clarifyingQuestions.length > 0 && (
                <div>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider font-mono" style={{ color: "rgb(var(--text-3))" }}>
                    Уточнення для кращої відповіді
                  </p>
                  <ul className="space-y-2">
                    {clarifyingQuestions.map((q, i) => (
                      <li key={i} className="flex items-start gap-3 rounded-xl px-4 py-3"
                        style={{ background: "rgb(var(--surface-2))", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold font-mono"
                          style={{ background: "rgba(123,147,255,0.15)", color: "rgb(163,178,255)" }}>{i + 1}</span>
                        <span className="text-[13px] leading-relaxed" style={{ color: "rgb(var(--text-1))" }}>{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {improvedPrompt && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider font-mono" style={{ color: "rgb(var(--text-3))" }}>
                    Покращений промпт
                  </p>
                  <div className="relative rounded-xl px-4 py-3.5"
                    style={{ background: "rgba(123,147,255,0.07)", border: "1px solid rgba(123,147,255,0.22)" }}>
                    <div className="absolute left-0 top-0 h-full w-0.5 rounded-l-xl" style={{ background: "rgba(123,147,255,0.5)" }} />
                    <p className="pl-2 text-[13px] leading-relaxed" style={{ color: "rgb(var(--text-1))" }}>{improvedPrompt}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        {!isRefining && (
          <DialogFooter>
            <div className="flex items-center justify-between gap-2">
              <button onClick={onCancel} className="btn-ghost rounded-lg px-3 py-1.5 text-[12px]">Скасувати</button>
              <div className="flex gap-2">
                <button onClick={onSendOriginal} className="rounded-lg px-3 py-1.5 text-[12px] transition-colors"
                  style={{ border: "1px solid rgba(255,255,255,0.1)", color: "rgb(var(--text-2))" }}>
                  Надіслати оригінал
                </button>
                <button onClick={onSendImproved} disabled={!improvedPrompt}
                  className="btn-primary flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px]">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Надіслати покращений
                </button>
              </div>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
