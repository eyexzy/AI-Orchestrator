"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUserLevelStore } from "@/lib/store/userLevelStore";

type Step = 1 | 2 | 3;

const STORAGE_KEY = "ai_orchestrator_onboarded";

interface Option {
  label: string;
  score: number;
}

const STEP_OPTIONS: Record<Step, Option[]> = {
  1: [
    { label: "Вперше чую", score: 0 },
    { label: "Кілька разів пробував", score: 1 },
    { label: "Використовую регулярно", score: 2 },
    { label: "Це частина моєї роботи", score: 3 },
  ],
  2: [
    { label: "Просто пишу питання як в Google", score: 0 },
    { label: "Намагаюсь бути більш конкретним", score: 1 },
    { label: "Знаю про ролі, контекст, формат", score: 2 },
    { label: "Використовую system prompts, chain-of-thought", score: 3 },
  ],
  3: [
    { label: "Навчитись писати кращі запити", score: 0 },
    { label: "Зручно спілкуватись з AI", score: 1 },
    { label: "Тестувати різні моделі та параметри", score: 2 },
    { label: "Повний контроль: JSON, system prompts, порівняння", score: 3 },
  ],
};

const STEP_TITLES: Record<Step, string> = {
  1: "Як часто ти працюєш з AI-інструментами?",
  2: "Що краще описує твій досвід з промптами?",
  3: "Що хочеш отримати від цього застосунку?",
};

function computeStartLevel(s1: number, s2: number, s3: number): 1 | 2 | 3 {
  const total = s1 + s2 + s3; // 0-9
  const startLevel = total <= 2 ? 1 : total <= 5 ? 2 : 3;
  return startLevel as 1 | 2 | 3;
}

export function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [step1, setStep1] = useState<number | null>(null);
  const [step2, setStep2] = useState<number | null>(null);
  const [step3, setStep3] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setOpen(true);
      }
    } catch {
      // ignore localStorage errors
    }
  }, []);

  const handleCloseCompletely = () => {
    setOpen(false);
  };

  const markOnboarded = () => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, "1");
      } catch {
        // ignore
      }
    }
  };

  const handleSkip = () => {
    markOnboarded();
    handleCloseCompletely();
  };

  const handleNext = () => {
    if (step === 1) {
      if (step1 == null) return;
      setStep(2);
    } else if (step === 2) {
      if (step2 == null) return;
      setStep(3);
    }
  };

  const handleStart = () => {
    if (step1 == null || step2 == null || step3 == null) return;
    const s1 = step1 ?? 0;
    const s2 = step2 ?? 0;
    const s3 = step3 ?? 0;
    const total = s1 + s2 + s3;
    const groundTruth = total <= 2 ? 1 : total <= 5 ? 2 : 3;
    const startLevel = computeStartLevel(s1, s2, s3);
    
    useUserLevelStore.getState().setLevel(startLevel);
    useUserLevelStore.getState().setGroundTruth(groundTruth);

    markOnboarded();
    handleCloseCompletely();
  };

  const selectedScore = step === 1 ? step1 : step === 2 ? step2 : step3;
  const options = STEP_OPTIONS[step];

  const isLastStep = step === 3;
  const canProceed = selectedScore != null;

  const progressLabel = `${step}/3`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleCloseCompletely()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-[16px]">
                <span>Ласкаво просимо до AI-Orchestrator 👋</span>
              </DialogTitle>
              <DialogDescription className="mt-1 text-[12px]">
                Відповіді допоможуть підібрати стартовий рівень інтерфейсу та підказок.
              </DialogDescription>
            </div>
            <span className="rounded-full border border-white/[0.1] bg-white/[0.03] px-2 py-1 text-[11px] font-mono text-muted-foreground/80">
              {progressLabel}
            </span>
          </div>
        </DialogHeader>

        {/* Progress tabs */}
        <div className="border-b border-white/[0.06] px-6 pb-3 pt-2">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => {
              const isActive = step === s;
              return (
                <div
                  key={s}
                  className={`flex-1 rounded-full border px-2 py-1 text-center text-[11px] font-mono transition-all ${
                    isActive
                      ? "border-primary/70 bg-primary/15 text-primary-foreground/90"
                      : "border-white/[0.08] bg-white/[0.02] text-muted-foreground/70"
                  }`}
                >
                  Крок {s}/3
                </div>
              );
            })}
          </div>
        </div>

        {/* Question & options */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-[14px] font-medium text-foreground/90">{STEP_TITLES[step]}</p>
          <div className="grid gap-2">
            {options.map((opt) => {
              const isSelected = selectedScore === opt.score;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => {
                    if (step === 1) setStep1(opt.score);
                    if (step === 2) setStep2(opt.score);
                    if (step === 3) setStep3(opt.score);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-left text-[13px] transition-all ${
                    isSelected
                      ? "border-primary bg-primary/10 text-foreground shadow-sm"
                      : "border-white/[0.09] bg-white/[0.02] text-muted-foreground hover:border-white/[0.2] hover:bg-white/[0.06] hover:text-foreground"
                  }`}
                >
                  <span>{opt.label}</span>
                  <span
                    className={`h-4 w-4 shrink-0 rounded-full border-2 transition-colors ${
                      isSelected ? "border-primary bg-primary" : "border-white/30"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between px-6 py-4">
          {step === 1 ? (
            <button
              type="button"
              onClick={handleSkip}
              className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Пропустити
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {!isLastStep && (
              <Button
                type="button"
                onClick={handleNext}
                disabled={!canProceed}
                size="sm"
              >
                Далі
              </Button>
            )}
            {isLastStep && (
              <Button
                type="button"
                onClick={handleStart}
                disabled={!canProceed}
                size="sm"
              >
                Розпочати
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

