"use client";

import { useEffect, useState } from "react";
import { Sparkles, ArrowRight, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { useTranslation } from "@/lib/store/i18nStore";

type Step = 1 | 2 | 3;

const STORAGE_KEY = "ai_orchestrator_onboarded";

interface Option {
  key: string;
  score: number;
}

const STEP_OPTIONS: Record<Step, Option[]> = {
  1: [
    { key: "onboarding.q1a0", score: 0 },
    { key: "onboarding.q1a1", score: 1 },
    { key: "onboarding.q1a2", score: 2 },
    { key: "onboarding.q1a3", score: 3 },
  ],
  2: [
    { key: "onboarding.q2a0", score: 0 },
    { key: "onboarding.q2a1", score: 1 },
    { key: "onboarding.q2a2", score: 2 },
    { key: "onboarding.q2a3", score: 3 },
  ],
  3: [
    { key: "onboarding.q3a0", score: 0 },
    { key: "onboarding.q3a1", score: 1 },
    { key: "onboarding.q3a2", score: 2 },
    { key: "onboarding.q3a3", score: 3 },
  ],
};

const STEP_TITLE_KEYS: Record<Step, string> = {
  1: "onboarding.q1",
  2: "onboarding.q2",
  3: "onboarding.q3",
};

function computeStartLevel(s1: number, s2: number, s3: number): 1 | 2 | 3 {
  const total = s1 + s2 + s3;
  const startLevel = total <= 2 ? 1 : total <= 5 ? 2 : 3;
  return startLevel as 1 | 2 | 3;
}

export function OnboardingModal() {
  const { t }: { t: (key: string) => string } = useTranslation();
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleCloseCompletely()}>
      <DialogContent className="max-w-[540px] border-gray-alpha-200 shadow-geist-lg text-ds-text">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Sparkles size={18} strokeWidth={2} className="text-blue-700" />
                <span>{t("onboarding.welcome")}</span>
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm">
                {t("onboarding.description")}
              </DialogDescription>
            </div>
            <span className="rounded-full border border-gray-alpha-200 bg-gray-alpha-100 px-2 py-1 text-xs font-mono text-ds-text-tertiary">
              {step}/3
            </span>
          </div>
        </DialogHeader>

        {/* Progress tabs */}
        <div className="border-b border-gray-alpha-200 px-6 pb-3 pt-2">
          <div className="flex items-center gap-2">
            {([1, 2, 3] as Step[]).map((s) => {
              const isActive = step === s;
              const isDone =
                (s === 1 && step1 != null && step > 1) ||
                (s === 2 && step2 != null && step > 2) ||
                false;
              return (
                <div
                  key={s}
                  className={`flex-1 rounded-full border px-2 py-1 text-center text-xs font-mono transition-all ${isActive
                    ? "border-gray-alpha-400 bg-gray-alpha-200 text-ds-text"
                    : isDone
                      ? "border-gray-alpha-200 bg-gray-alpha-100 text-ds-text-secondary"
                      : "border-gray-alpha-200 bg-gray-alpha-50 text-ds-text-tertiary"
                    }`}
                >
                  {t("onboarding.step")} {s}
                </div>
              );
            })}
          </div>
        </div>

        {/* Question & options */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-[15px] font-medium text-ds-text">
            {t(STEP_TITLE_KEYS[step])}
          </p>
          <div className="grid gap-2">
            {options.map((opt) => {
              const isSelected = selectedScore === opt.score;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    if (step === 1) setStep1(opt.score);
                    if (step === 2) setStep2(opt.score);
                    if (step === 3) setStep3(opt.score);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-left text-[15px] transition-all cursor-pointer ${isSelected
                    ? "border-gray-alpha-400 bg-gray-alpha-200 text-ds-text"
                    : "border-gray-alpha-200 bg-gray-alpha-100 text-ds-text-secondary hover:border-gray-alpha-300 hover:bg-gray-alpha-200"
                    }`}
                >
                  <span>{t(opt.key)}</span>
                  <span
                    className={`h-4 w-4 shrink-0 rounded-full border-2 transition-colors ${isSelected
                      ? "border-foreground bg-foreground"
                      : "border-gray-alpha-400 bg-transparent"
                      }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between px-6 py-4">
          {step === 1 ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={handleSkip}
              className="h-auto px-0 text-sm text-ds-text-tertiary hover:text-ds-text-secondary"
            >
              {t("onboarding.skip")}
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {!isLastStep && (
              <Button
                onClick={handleNext}
                disabled={!canProceed}
                rightIcon={<ChevronRight size={14} strokeWidth={2} />}
              >
                {t("onboarding.next")}
              </Button>
            )}
            {isLastStep && (
              <Button
                onClick={handleStart}
                disabled={!canProceed}
                rightIcon={<ArrowRight size={14} strokeWidth={2} />}
              >
                {t("onboarding.getStarted")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}