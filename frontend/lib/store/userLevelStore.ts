import { create } from "zustand";

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

function normalizeUserLevel(value: unknown): UserLevel | null {
  return value === 1 || value === 2 || value === 3 ? value : null;
}

export function toBehavioralMetricsPayload(
  metrics: BehavioralMetrics,
  overrides: Partial<Record<string, number | boolean>> = {},
) {
  return {
    chars_per_second: metrics.charsPerSecond,
    session_message_count: metrics.sessionMessageCount,
    avg_prompt_length: metrics.avgPromptLength,
    changed_temperature: metrics.changedTemperature,
    changed_model: metrics.changedModel,
    used_system_prompt: metrics.usedSystemPrompt,
    used_variables: metrics.usedVariables,
    used_advanced_features_count: metrics.advancedFeaturesCount,
    tooltip_click_count: metrics.tooltipClickCount,
    suggestion_click_count: metrics.suggestionClickCount,
    cancel_action_count: metrics.cancelActionCount,
    level_transition_count: metrics.levelTransitionCount,
    session_duration_seconds: metrics.sessionDurationSeconds,
    ...overrides,
  };
}

interface UserLevelState {
  sessionId: string;
  userEmail: string;
  level: UserLevel;
  lastLevelChangeTs: number;
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
  hiddenTemplates: string[];
  setSessionId: (id: string) => void;
  setUserEmail: (email: string) => void;
  setLevel: (level: UserLevel) => void;
  setGroundTruth: (level: number) => void;
  trackAdvancedFeature: (feature: string) => void;
  trackTooltipClick: () => void;
  trackSuggestionClick: () => void;
  trackCancelAction: () => void;
  analyzePrompt: (text: string, currentCps: number) => Promise<void>;
  resetMetrics: () => void;
  restoreFromMessages: (userTexts: string[]) => Promise<void>;
  hideTemplate: (id: string) => Promise<void>;
  initProfile: () => Promise<void>;
}

const initialMetrics: BehavioralMetrics = {
  charsPerSecond: 0,
  sessionMessageCount: 0,
  avgPromptLength: 0,
  promptLengths: [],
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
  userEmail: "anonymous",
  level: 1,
  lastLevelChangeTs: 0,
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
  hiddenTemplates: [],

  setSessionId: (id) => set({ sessionId: id }),

  setUserEmail: (email) => set({ userEmail: email }),

  setLevel: (level) => set({ level }),
  setGroundTruth: (level) => set({ groundTruth: level }),

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

  analyzePrompt: async (text: string, currentCps: number) => {
    const { metrics, sessionId } = get();
    const newLengths = [...metrics.promptLengths, text.length];
    const avg = newLengths.reduce((a, b) => a + b, 0) / newLengths.length;
    const newCount = metrics.sessionMessageCount + 1;
    const durationSeconds = (Date.now() - metrics.sessionStartTime) / 1000;

    set((s) => ({
      metrics: {
        ...s.metrics,
        charsPerSecond: currentCps,
        sessionMessageCount: newCount,
        avgPromptLength: avg,
        promptLengths: newLengths,
        sessionDurationSeconds: durationSeconds,
      },
      isAnalyzing: true,
    }));

    try {
      const metricsPayload = toBehavioralMetricsPayload(metrics, {
        chars_per_second: currentCps,
        session_message_count: newCount,
        avg_prompt_length: avg,
        session_duration_seconds: durationSeconds,
      });

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt_text: text,
          session_id: sessionId,
          metrics: metricsPayload,
        }),
      });

      if (res.ok) {
        const data = await res.json();

        set((s) => {
          const finalLevel = Number(data.final_level) as UserLevel;
          const levelChanged = finalLevel !== s.level;

          return {
            level: finalLevel,
            lastLevelChangeTs: levelChanged ? Date.now() : s.lastLevelChangeTs,
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
          fetch("/api/ml/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt_text: text,
              metrics: toBehavioralMetricsPayload(m),
              actual_level: groundTruth,
            }),
          }).catch(() => {});
          set({ groundTruth: null });
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
      lastLevelChangeTs: 0,
      score: 0,
      normalizedScore: 0,
      breakdown: [],
      reasoning: [],
      confidence: 0,
      isAnalyzing: false,
      hasAnalyzed: false,
    });
  },

  hideTemplate: async (id: string) => {
    const next = [...new Set([...get().hiddenTemplates, id])];
    set({ hiddenTemplates: next });
    try {
      await fetch("/api/profile/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden_templates: next }),
      });
    } catch {
    }
  },

  initProfile: async () => {
    try {
      const res = await fetch("/api/profile/preferences");
      if (!res.ok) return;
      const data = await res.json();
      const nextState: Partial<UserLevelState> = {};
      if (Array.isArray(data.hidden_templates)) {
        nextState.hiddenTemplates = data.hidden_templates;
      }
      const currentLevel = normalizeUserLevel(data.current_level);
      if (currentLevel !== null) {
        nextState.level = currentLevel;
      }
      if (Object.keys(nextState).length > 0) {
        set(nextState);
      }
    } catch {
    }
  },

  resetMetrics: () =>
    set({
      metrics: { ...initialMetrics, sessionStartTime: Date.now() },
      lastLevelChangeTs: 0,
      score: 0,
      normalizedScore: 0,
      breakdown: [],
      reasoning: [],
      confidence: 0,
      hasAnalyzed: false,
    }),
}));