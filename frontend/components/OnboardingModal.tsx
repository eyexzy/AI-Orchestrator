"use client";

import { useEffect, useRef, useState } from "react";
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
import { Choicebox } from "@/components/ui/choicebox";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { useTranslation } from "@/lib/store/i18nStore";
import { patchProfilePreferences } from "@/lib/profilePreferences";
import { trackEvent, flushEvents } from "@/lib/eventTracker";

// 4-step onboarding — richer signal for the ML scoring model
type Step = 1 | 2 | 3 | 4;
const TOTAL_STEPS: Step = 4;

const STORAGE_KEY_PREFIX = "ai_orchestrator_onboarded_";

interface Option {
  key: string;
  score: number;
}

const STEP_OPTIONS: Record<Step, Option[]> = {
  // Q1 — AI tool usage frequency
  1: [
    { key: "onboarding.q1a0", score: 0 },
    { key: "onboarding.q1a1", score: 1 },
    { key: "onboarding.q1a2", score: 2 },
    { key: "onboarding.q1a3", score: 3 },
  ],
  // Q2 — Prompt writing experience
  2: [
    { key: "onboarding.q2a0", score: 0 },
    { key: "onboarding.q2a1", score: 1 },
    { key: "onboarding.q2a2", score: 2 },
    { key: "onboarding.q2a3", score: 3 },
  ],
  // Q3 — Prompt failure behavior (diagnostic)
  3: [
    { key: "onboarding.q3a0", score: 0 },
    { key: "onboarding.q3a1", score: 1 },
    { key: "onboarding.q3a2", score: 2 },
    { key: "onboarding.q3a3", score: 3 },
  ],
  // Q4 — Goal / desired interface level
  4: [
    { key: "onboarding.q4a0", score: 0 },
    { key: "onboarding.q4a1", score: 1 },
    { key: "onboarding.q4a2", score: 2 },
    { key: "onboarding.q4a3", score: 3 },
  ],
};

const STEP_TITLE_KEYS: Record<Step, string> = {
  1: "onboarding.q1",
  2: "onboarding.q2",
  3: "onboarding.q3",
  4: "onboarding.q4",
};

function computeStartLevel(scores: number[]): 1 | 2 | 3 {
  const total = scores.reduce((a, b) => a + b, 0);
  const max = scores.length * 3;
  const ratio = total / max;
  if (ratio <= 0.3) return 1;
  if (ratio <= 0.65) return 2;
  return 3;
}

function normalizeLevel(value: unknown): 1 | 2 | 3 | null {
  return value === 1 || value === 2 || value === 3 ? value : null;
}

export function OnboardingModal() {
  const { t }: { t: (key: string) => string } = useTranslation();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [answers, setAnswers] = useState<Record<Step, number | null>>({ 1: null, 2: null, 3: null, 4: null });

  const profileLoaded = useUserLevelStore((s) => s.profileLoaded);
  const onboardingCompleted = useUserLevelStore((s) => s.onboardingCompleted);
  const userEmail = useUserLevelStore((s) => s.userEmail);
  const startTimeRef = useRef<number>(Date.now());

  const storageKey = STORAGE_KEY_PREFIX + userEmail;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!profileLoaded) return;
    if (onboardingCompleted) return;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) {
        setOpen(true);
        trackEvent("onboarding_started", {});
        flushEvents();
      }
    } catch {
    }
  }, [profileLoaded, onboardingCompleted, storageKey]);

  const handleCloseCompletely = () => setOpen(false);

  const markOnboarded = () => {
    if (typeof window !== "undefined") {
      try { window.localStorage.setItem(storageKey, "1"); } catch {}
    }
  };

  const handleSkip = () => {
    trackEvent("onboarding_skipped", { step_reached: step });
    flushEvents();
    useUserLevelStore.setState({ onboardingCompleted: true });
    patchProfilePreferences({ onboarding_completed: true }, userEmail)
      .then((data) => {
        const persistedLevel = normalizeLevel(data.current_level);
        useUserLevelStore.setState({
          onboardingCompleted: data.onboarding_completed ?? true,
          ...(persistedLevel !== null ? { level: persistedLevel } : {}),
        });
      })
      .catch(() => {});
    markOnboarded();
    handleCloseCompletely();
  };

  const handleNext = () => {
    if (answers[step] == null) return;
    if (step < TOTAL_STEPS) setStep((s) => (s + 1) as Step);
  };

  const handleStart = () => {
    const allAnswers = [1, 2, 3, 4] as Step[];
    if (allAnswers.some((s) => answers[s] == null)) return;
    const scores = allAnswers.map((s) => answers[s] as number);
    const total = scores.reduce((a, b) => a + b, 0);
    const groundTruth = computeStartLevel(scores);
    const startLevel = groundTruth;
    const elapsedMs = Date.now() - startTimeRef.current;

    useUserLevelStore.getState().setLevel(startLevel);
    useUserLevelStore.getState().setGroundTruth(groundTruth);
    useUserLevelStore.setState({ onboardingCompleted: true });

    trackEvent("onboarding_completed", {
      self_assessed_level: startLevel,
      computed_level: groundTruth,
      total_score: total,
      scores,
      elapsed_ms: elapsedMs,
    });
    flushEvents();

    patchProfilePreferences({
      self_assessed_level: startLevel,
      onboarding_completed: true,
    }, userEmail)
      .then((data) => {
        const persistedLevel = normalizeLevel(data.current_level);
        useUserLevelStore.setState({
          onboardingCompleted: data.onboarding_completed ?? true,
          ...(persistedLevel !== null ? { level: persistedLevel } : {}),
        });
      })
      .catch(() => {});

    markOnboarded();
    handleCloseCompletely();
  };

  const selectedScore = answers[step];
  const options = STEP_OPTIONS[step];
  const isLastStep = step === TOTAL_STEPS;
  const canProceed = selectedScore != null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleCloseCompletely()}>
      <DialogContent className="max-w-[560px] text-ds-text">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} strokeWidth={2} className="text-blue-700" />
            <span>{t("onboarding.welcome")}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-start justify-between gap-4 px-6 pt-4">
          <DialogDescription className="mt-0 max-w-[400px]">
            {t("onboarding.description")}
          </DialogDescription>
          <span className="rounded-full border border-gray-alpha-200 bg-gray-alpha-100 px-2 py-1 text-xs font-mono text-ds-text-tertiary shrink-0">
            {step}/{TOTAL_STEPS}
          </span>
        </div>

        {/* Step progress bar */}
        <div className="px-6 pb-3 pt-4">
          <div className="flex items-center gap-1.5">
            {([1, 2, 3, 4] as Step[]).map((s) => {
              const isDone = s < step;
              const isActive = s === step;
              return (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                    isActive
                      ? "bg-blue-600"
                      : isDone
                      ? "bg-blue-300"
                      : "bg-gray-alpha-200"
                  }`}
                />
              );
            })}
          </div>
        </div>

        {/* Question & options */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-[15px] font-medium text-ds-text">
            {t(STEP_TITLE_KEYS[step])}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {options.map((opt) => (
              <Choicebox
                key={opt.key}
                label={t(opt.key)}
                checked={selectedScore === opt.score}
                onChange={() => setAnswers((prev) => ({ ...prev, [step]: opt.score }))}
              />
            ))}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between">
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
                size="sm"
                disabled={!canProceed}
                rightIcon={<ChevronRight size={14} strokeWidth={2} />}
              >
                {t("onboarding.next")}
              </Button>
            )}
            {isLastStep && (
              <Button
                onClick={handleStart}
                size="sm"
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
