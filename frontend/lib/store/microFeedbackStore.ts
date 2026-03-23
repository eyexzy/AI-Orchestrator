"use client";

import { create } from "zustand";
import { flushEvents, trackEvent } from "@/lib/eventTracker";

// Micro-prompt definitions

export type MicroPromptId =
  | "level_change_agree"
  | "low_confidence_self_assess"
  | "help_series_check"
  | "scenario_complete"
  | "periodic_check";

export interface MicroPrompt {
  id: MicroPromptId;
  questionType: string;
  /** key into i18n store */
  textKey: string;
  options: { value: string; labelKey: string }[];
}

export const MICRO_PROMPTS: Record<MicroPromptId, MicroPrompt> = {
  level_change_agree: {
    id: "level_change_agree",
    questionType: "level_change_agreement",
    textKey: "microFeedback.levelChange",
    options: [
      { value: "agree", labelKey: "microFeedback.yes" },
      { value: "disagree", labelKey: "microFeedback.no" },
    ],
  },
  low_confidence_self_assess: {
    id: "low_confidence_self_assess",
    questionType: "self_assess_level",
    textKey: "microFeedback.selfAssess",
    options: [
      { value: "1", labelKey: "microFeedback.level1" },
      { value: "2", labelKey: "microFeedback.level2" },
      { value: "3", labelKey: "microFeedback.level3" },
    ],
  },
  help_series_check: {
    id: "help_series_check",
    questionType: "help_series_check",
    textKey: "microFeedback.helpSeries",
    options: [
      { value: "too_complex", labelKey: "microFeedback.tooComplex" },
      { value: "just_exploring", labelKey: "microFeedback.justExploring" },
      { value: "fine", labelKey: "microFeedback.fine" },
    ],
  },
  scenario_complete: {
    id: "scenario_complete",
    questionType: "scenario_satisfaction",
    textKey: "microFeedback.scenarioComplete",
    options: [
      { value: "too_easy", labelKey: "microFeedback.tooEasy" },
      { value: "just_right", labelKey: "microFeedback.justRight" },
      { value: "too_hard", labelKey: "microFeedback.tooHard" },
    ],
  },
  periodic_check: {
    id: "periodic_check",
    questionType: "periodic_level_check",
    textKey: "microFeedback.periodicCheck",
    options: [
      { value: "agree", labelKey: "microFeedback.yes" },
      { value: "disagree", labelKey: "microFeedback.no" },
    ],
  },
};

// Rate limiting constants

const MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 min between prompts
const MAX_PER_SESSION = 3;

// Store

interface MicroFeedbackState {
  /** Currently shown prompt, or null */
  activePrompt: MicroPrompt | null;
  /** Timestamps of all shown prompts this session */
  shownTimestamps: number[];
  /** Last shown timestamp */
  lastShownAt: number;
  /** Dismissed prompt IDs this session (don't re-trigger same type) */
  dismissedIds: Set<MicroPromptId>;

  /** Try to trigger a micro-prompt. Returns true if shown. */
  tryTrigger: (id: MicroPromptId) => boolean;
  /** User answered — send to backend and close */
  answer: (value: string) => Promise<void>;
  /** User dismissed without answering */
  dismiss: () => void;
  /** Reset for new session */
  resetSession: () => void;
}

export const useMicroFeedbackStore = create<MicroFeedbackState>((set, get) => ({
  activePrompt: null,
  shownTimestamps: [],
  lastShownAt: 0,
  dismissedIds: new Set(),

  tryTrigger: (id) => {
    const state = get();

    // Rate limit: max per session
    if (state.shownTimestamps.length >= MAX_PER_SESSION) return false;

    // Rate limit: min interval
    if (Date.now() - state.lastShownAt < MIN_INTERVAL_MS) return false;

    // Don't re-trigger dismissed prompts
    if (state.dismissedIds.has(id)) return false;

    // Don't overlap
    if (state.activePrompt !== null) return false;

    const prompt = MICRO_PROMPTS[id];
    if (!prompt) return false;

    set({
      activePrompt: prompt,
      shownTimestamps: [...state.shownTimestamps, Date.now()],
      lastShownAt: Date.now(),
    });
    return true;
  },

  answer: async (value) => {
    const { activePrompt } = get();
    if (!activePrompt) return;

    const promptId = activePrompt.id;
    const questionType = activePrompt.questionType;

    set((s) => ({
      activePrompt: null,
      dismissedIds: new Set([...s.dismissedIds, promptId]),
    }));

    trackEvent("ui_level_feedback_given", {
      prompt_id: promptId,
      question_type: questionType,
      answer_value: value,
    });
    await flushEvents();

    // Dynamic import to avoid circular deps
    const { useUserLevelStore } = await import("./userLevelStore");
    const { level, sessionId, chatId } = useUserLevelStore.getState();

    try {
      await fetch("/api/adaptation-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          chat_id: chatId,
          ui_level_at_time: level,
          question_type: questionType,
          answer_value: value,
          feature_snapshot: {},
        }),
      });
    } catch {
      // Non-critical — don't block UX
    }
  },

  dismiss: () => {
    const { activePrompt } = get();
    if (!activePrompt) return;
    set((s) => ({
      activePrompt: null,
      dismissedIds: new Set([...s.dismissedIds, activePrompt.id]),
    }));
  },

  resetSession: () =>
    set({
      activePrompt: null,
      shownTimestamps: [],
      lastShownAt: 0,
      dismissedIds: new Set(),
    }),
}));