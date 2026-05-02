"use client";

import { create } from "zustand";
import { flushEvents, trackEvent } from "@/lib/eventTracker";

// Micro-prompt definitions

export type MicroPromptId =
  | "level_change_agree"
  | "low_confidence_self_assess"
  | "help_series_check"
  | "scenario_complete"
  | "periodic_check"
  | "response_clarity"
  | "response_fit"
  | "tutor_helpfulness"
  | "prompt_difficulty";

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
      { value: "simpler_layout", labelKey: "microFeedback.simplerLayout" },
      { value: "current_layout_fits", labelKey: "microFeedback.currentFits" },
      { value: "more_control_needed", labelKey: "microFeedback.moreControl" },
    ],
  },
  low_confidence_self_assess: {
    id: "low_confidence_self_assess",
    questionType: "self_assess_level",
    textKey: "microFeedback.selfAssess",
    options: [
      { value: "more_guidance", labelKey: "microFeedback.moreGuidance" },
      { value: "current_guidance_fits", labelKey: "microFeedback.currentGuidance" },
      { value: "less_guidance", labelKey: "microFeedback.lessGuidance" },
    ],
  },
  help_series_check: {
    id: "help_series_check",
    questionType: "help_series_check",
    textKey: "microFeedback.helpSeries",
    options: [
      { value: "interface_unclear", labelKey: "microFeedback.interfaceUnclear" },
      { value: "learning_feature", labelKey: "microFeedback.learningFeature" },
      { value: "looking_for_shortcut", labelKey: "microFeedback.lookingForShortcut" },
    ],
  },
  scenario_complete: {
    id: "scenario_complete",
    questionType: "scenario_satisfaction",
    textKey: "microFeedback.scenarioComplete",
    options: [
      { value: "improved", labelKey: "microFeedback.improved" },
      { value: "no_change", labelKey: "microFeedback.noChange" },
      { value: "less_clear", labelKey: "microFeedback.lessClear" },
    ],
  },
  periodic_check: {
    id: "periodic_check",
    questionType: "periodic_level_check",
    textKey: "microFeedback.periodicCheck",
    options: [
      { value: "simpler_layout", labelKey: "microFeedback.simplerLayout" },
      { value: "current_layout_fits", labelKey: "microFeedback.currentFits" },
      { value: "more_control_needed", labelKey: "microFeedback.moreControl" },
    ],
  },
  response_clarity: {
    id: "response_clarity",
    questionType: "response_clarity",
    textKey: "microFeedback.responseClarity",
    options: [
      { value: "clear", labelKey: "microFeedback.clear" },
      { value: "partly_clear", labelKey: "microFeedback.partly" },
      { value: "confusing", labelKey: "microFeedback.confusing" },
    ],
  },
  response_fit: {
    id: "response_fit",
    questionType: "response_fit",
    textKey: "microFeedback.responseFit",
    options: [
      { value: "matched", labelKey: "microFeedback.matched" },
      { value: "partly_matched", labelKey: "microFeedback.partly" },
      { value: "missed", labelKey: "microFeedback.missed" },
    ],
  },
  tutor_helpfulness: {
    id: "tutor_helpfulness",
    questionType: "tutor_helpfulness",
    textKey: "microFeedback.tutorHelpfulness",
    options: [
      { value: "useful", labelKey: "microFeedback.useful" },
      { value: "somewhat_useful", labelKey: "microFeedback.somewhatUseful" },
      { value: "not_useful", labelKey: "microFeedback.notUseful" },
    ],
  },
  prompt_difficulty: {
    id: "prompt_difficulty",
    questionType: "prompt_difficulty",
    textKey: "microFeedback.promptDifficulty",
    options: [
      { value: "low_effort", labelKey: "microFeedback.lowEffort" },
      { value: "manageable_effort", labelKey: "microFeedback.manageableEffort" },
      { value: "high_effort", labelKey: "microFeedback.highEffort" },
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
    const {
      level,
      autoLevel,
      suggestedLevel,
      manualOverride,
      sessionId,
      chatId,
      metrics,
      confidence,
      normalizedScore,
      hasAnalyzed,
    } = useUserLevelStore.getState();
    const manualOverrideActive = manualOverride !== null;

    const featureSnapshot = {
      ui_level: level,
      auto_level_at_time: autoLevel,
      effective_ui_level_at_time: level,
      suggested_level_at_time: suggestedLevel,
      manual_override_active: manualOverrideActive,
      manual_level_override: manualOverride,
      normalized_score: normalizedScore,
      confidence,
      has_analyzed: hasAnalyzed,
      session_message_count: metrics.sessionMessageCount,
      avg_prompt_length: metrics.avgPromptLength,
      chars_per_second: metrics.charsPerSecond,
      changed_temperature: metrics.changedTemperature,
      changed_model: metrics.changedModel,
      used_system_prompt: metrics.usedSystemPrompt,
      used_variables: metrics.usedVariables,
      advanced_features_count: metrics.advancedFeaturesCount,
      tooltip_click_count: metrics.tooltipClickCount,
      suggestion_click_count: metrics.suggestionClickCount,
      cancel_action_count: metrics.cancelActionCount,
      level_transition_count: metrics.levelTransitionCount,
      session_duration_seconds: metrics.sessionDurationSeconds,
      prompt_shown_count: get().shownTimestamps.length,
    };

    try {
      await fetch("/api/adaptation-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          chat_id: chatId,
          ui_level_at_time: level,
          suggested_level_at_time: suggestedLevel,
          question_type: questionType,
          answer_value: value,
          feature_snapshot: featureSnapshot,
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
