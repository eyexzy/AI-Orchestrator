import { create } from "zustand";
import { API_URL } from "@/lib/config";

function generateSessionId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxx-xxxx-4xxx-yxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export type UserLevel = 1 | 2 | 3;

export interface BehavioralMetrics {
  charsPerSecond: number;
  sessionMessageCount: number;
  avgPromptLength: number;
  promptLengths: number[];
  typingStartTime: number | null;
  typingChars: number;
  changedTemperature: boolean;
  changedModel: boolean;
  usedSystemPrompt: boolean;
  usedVariables: boolean;
  advancedFeaturesCount: number;
  tooltipClickCount: number;
  suggestionClickCount: number;
  cancelActionCount: number;
  levelTransitionCount: number;
  sessionDurationSeconds: number;
  sessionStartTime: number;
}

export interface ScoreBreakdown {
  category: string;
  points: number;
  max_points: number;
  detail: string;
}

let levelChangeTimer: ReturnType<typeof setTimeout> | null = null;

interface UserLevelState {
  sessionId: string;
  // FIX #1: store userEmail so analyzePrompt can pass it to /analyze
  // Without this, hysteresis was keyed by session_id and reset on every reload
  userEmail: string;
  level: UserLevel;
  levelJustChanged: boolean;
  confidence: number;
  reasoning: string[];
  score: number;
  normalizedScore: number;
  breakdown: ScoreBreakdown[];
  thresholds: { L2: number; L3: number };
  metrics: BehavioralMetrics;
  isAnalyzing: boolean;
  hasAnalyzed: boolean;
  groundTruth: number | null;
  setSessionId: (id: string) => void;
  // FIX #1: setter called from MainInput when session is available
  setUserEmail: (email: string) => void;
  setLevel: (level: UserLevel) => void;
  setGroundTruth: (level: number) => void;
  startTyping: () => void;
  recordKeystroke: () => void;
  trackAdvancedFeature: (feature: string) => void;
  trackTooltipClick: () => void;
  trackSuggestionClick: () => void;
  trackCancelAction: () => void;
  analyzePrompt: (text: string) => Promise<void>;
  resetMetrics: () => void;
  restoreFromMessages: (userTexts: string[]) => Promise<void>;
}

const initialMetrics: BehavioralMetrics = {
  charsPerSecond: 0,
  sessionMessageCount: 0,
  avgPromptLength: 0,
  promptLengths: [],
  typingStartTime: null,
  typingChars: 0,
  changedTemperature: false,
  changedModel: false,
  usedSystemPrompt: false,
  usedVariables: false,
  advancedFeaturesCount: 0,
  tooltipClickCount: 0,
  suggestionClickCount: 0,
  cancelActionCount: 0,
  levelTransitionCount: 0,
  sessionDurationSeconds: 0,
  sessionStartTime: Date.now(),
};

export const useUserLevelStore = create<UserLevelState>((set, get) => ({
  sessionId: generateSessionId(),
  userEmail: "anonymous",          // FIX #1: default, updated via setUserEmail
  level: 1,
  levelJustChanged: false,
  confidence: 0,
  reasoning: [],
  score: 0,
  normalizedScore: 0,
  breakdown: [],
  thresholds: { L2: 0.25, L3: 0.55 },
  metrics: { ...initialMetrics },
  isAnalyzing: false,
  hasAnalyzed: false,
  groundTruth: null,

  setSessionId: (id) => set({ sessionId: id }),

  // FIX #1: update userEmail in store whenever NextAuth session resolves
  setUserEmail: (email) => set({ userEmail: email }),

  setLevel: (level) => set({ level }),
  setGroundTruth: (level) => set({ groundTruth: level }),

  startTyping: () =>
    set((s) => ({
      metrics: { ...s.metrics, typingStartTime: Date.now(), typingChars: 0 },
    })),

  recordKeystroke: () =>
    set((s) => {
      const m = s.metrics;
      const newChars = m.typingChars + 1;
      let cps = m.charsPerSecond;
      if (m.typingStartTime) {
        const elapsed = (Date.now() - m.typingStartTime) / 1000;
        if (elapsed > 0.5) cps = newChars / elapsed;
      }
      return { metrics: { ...m, typingChars: newChars, charsPerSecond: cps } };
    }),

  trackAdvancedFeature: (feature: string) =>
    set((s) => {
      const m = s.metrics;
      let changedTemperature = m.changedTemperature;
      let changedModel = m.changedModel;
      let usedSystemPrompt = m.usedSystemPrompt;
      let usedVariables = m.usedVariables;

      switch (feature) {
        case "temperature":   changedTemperature = true; break;
        case "model":         changedModel = true; break;
        case "system_prompt": usedSystemPrompt = true; break;
        case "variable":      usedVariables = true; break;
        default:              break;
      }

      return {
        metrics: {
          ...m,
          changedTemperature,
          changedModel,
          usedSystemPrompt,
          usedVariables,
          advancedFeaturesCount: m.advancedFeaturesCount + 1,
        },
      };
    }),

  trackTooltipClick: () =>
    set((s) => ({
      metrics: { ...s.metrics, tooltipClickCount: s.metrics.tooltipClickCount + 1 },
    })),

  trackSuggestionClick: () =>
    set((s) => ({
      metrics: { ...s.metrics, suggestionClickCount: s.metrics.suggestionClickCount + 1 },
    })),

  trackCancelAction: () =>
    set((s) => ({
      metrics: { ...s.metrics, cancelActionCount: s.metrics.cancelActionCount + 1 },
    })),

  analyzePrompt: async (text: string) => {
    const { metrics, sessionId, userEmail } = get(); // FIX #1: include userEmail
    const newLengths = [...metrics.promptLengths, text.length];
    const avg = newLengths.reduce((a, b) => a + b, 0) / newLengths.length;
    const newCount = metrics.sessionMessageCount + 1;
    const durationSeconds = (Date.now() - metrics.sessionStartTime) / 1000;

    set((s) => ({
      metrics: {
        ...s.metrics,
        sessionMessageCount: newCount,
        avgPromptLength: avg,
        promptLengths: newLengths,
        typingStartTime: null,
        typingChars: 0,
        sessionDurationSeconds: durationSeconds,
      },
      isAnalyzing: true,
    }));

    try {
      const res = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt_text: text,
          session_id: sessionId,
          user_email: userEmail,       // FIX #1: send user_email so backend uses it as profile key
          metrics: {
            chars_per_second: metrics.charsPerSecond,
            session_message_count: newCount,
            avg_prompt_length: avg,
            changed_temperature: metrics.changedTemperature,
            changed_model: metrics.changedModel,
            used_system_prompt: metrics.usedSystemPrompt,
            used_variables: metrics.usedVariables,
            used_advanced_features_count: metrics.advancedFeaturesCount,
            tooltip_click_count: metrics.tooltipClickCount,
            suggestion_click_count: metrics.suggestionClickCount,
            cancel_action_count: metrics.cancelActionCount,
            level_transition_count: metrics.levelTransitionCount,
            session_duration_seconds: durationSeconds,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        let shouldResetLevelChanged = false;

        set((s) => {
          const finalLevel = Number(data.final_level) as UserLevel;
          const levelChanged = finalLevel !== s.level;
          if (levelChanged) shouldResetLevelChanged = true;

          return {
            level: finalLevel,
            levelJustChanged: levelChanged,
            confidence: data.confidence,
            reasoning: data.reasoning,
            score: data.score,
            normalizedScore: data.normalized_score,
            breakdown: data.breakdown ?? [],
            thresholds: data.thresholds ?? { L2: 0.25, L3: 0.55 },
            isAnalyzing: false,
            hasAnalyzed: true,
            metrics: {
              ...s.metrics,
              levelTransitionCount: levelChanged
                ? s.metrics.levelTransitionCount + 1
                : s.metrics.levelTransitionCount,
            },
          };
        });

        const { groundTruth, metrics: m } = get();
        if (groundTruth !== null && m.sessionMessageCount === 1) {
          fetch(`${API_URL}/ml/feedback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt_text: text,
              metrics: {
                chars_per_second: m.charsPerSecond,
                session_message_count: m.sessionMessageCount,
                avg_prompt_length: m.avgPromptLength,
                used_advanced_features_count: m.advancedFeaturesCount,
                tooltip_click_count: m.tooltipClickCount,
              },
              actual_level: groundTruth,
            }),
          }).catch(() => {});
          set({ groundTruth: null });
        }

        if (shouldResetLevelChanged) {
          if (levelChangeTimer) clearTimeout(levelChangeTimer);
          levelChangeTimer = setTimeout(() => {
            set({ levelJustChanged: false });
          }, 3000);
        }
      } else {
        set({ isAnalyzing: false });
      }
    } catch {
      set({ isAnalyzing: false });
    }
  },

  restoreFromMessages: async (userTexts: string[]) => {
    if (userTexts.length === 0) {
      get().resetMetrics();
      return;
    }

    const lengths = userTexts.map((t) => t.length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const count = userTexts.length;

    set({
      metrics: {
        ...initialMetrics,
        sessionMessageCount: count,
        avgPromptLength: avg,
        promptLengths: lengths,
        sessionStartTime: Date.now(),
      },
    });

    // FIX #10: use a recency-weighted sample instead of just the longest message.
    // The longest message ever biased toward outliers (big code paste = L3 forever).
    // Now: take the last 3 messages and pick the longest among those — recent
    // messages best reflect the user's current skill level.
    const recent = userTexts.length >= 3 ? userTexts.slice(-3) : userTexts;
    const representativeText = recent.reduce(
      (best, t) => (t.length > best.length ? t : best),
      ""
    );

    const { sessionId, userEmail } = get(); // FIX #1: pass userEmail here too

    try {
      const res = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt_text: representativeText,
          session_id: sessionId,
          user_email: userEmail,           // FIX #1: hysteresis uses correct profile
          metrics: {
            chars_per_second: 0,
            session_message_count: count,
            avg_prompt_length: avg,
            used_advanced_features_count: 0,
            tooltip_click_count: 0,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const suggestedRaw = Number(data.final_level ?? data.suggested_level);
        const suggested: UserLevel =
          suggestedRaw >= 3 ? 3 : suggestedRaw <= 1 ? 1 : 2;
        set({
          level: suggested,
          levelJustChanged: false,
          confidence: data.confidence,
          reasoning: data.reasoning,
          score: data.score,
          normalizedScore: data.normalized_score,
          breakdown: data.breakdown ?? [],
          thresholds: data.thresholds ?? { L2: 0.25, L3: 0.55 },
          isAnalyzing: false,
          hasAnalyzed: true,
        });
      }
    } catch {
      /* silent — non-critical restore */
    }
  },

  resetMetrics: () =>
    set({
      metrics: { ...initialMetrics },
      levelJustChanged: false,
      score: 0,
      normalizedScore: 0,
      breakdown: [],
      reasoning: [],
      confidence: 0,
      hasAnalyzed: false,
    }),
}));