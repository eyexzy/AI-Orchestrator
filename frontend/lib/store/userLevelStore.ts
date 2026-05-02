import { create } from "zustand";
import { USER_LEVEL_SNAPSHOT_STORAGE_KEY } from "@/lib/config";
import { flushEvents } from "@/lib/eventTracker";
import { makeScopedStorageKey, readPersistedState, writePersistedState } from "@/lib/persistedState";

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

function highestLevel(...levels: Array<unknown>): UserLevel {
  const normalized = levels
    .map(normalizeUserLevel)
    .filter((level): level is UserLevel => level !== null);
  return normalized.length > 0 ? (Math.max(...normalized) as UserLevel) : 1;
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

export interface LevelTransition {
  fromLevel: UserLevel;
  toLevel: UserLevel;
  direction: "up" | "down";
}

interface UserLevelState {
  /** Behavioral session UUID — generated once per page load (NOT the chat UUID). */
  sessionId: string;
  /** Active chat thread UUID — updated when the user selects / creates a chat. */
  chatId: string | null;
  userEmail: string;
  /** Effective UI level. Existing UI reads this value. */
  level: UserLevel;
  /** Real adaptive level after hysteresis. Manual override never writes here. */
  autoLevel: UserLevel;
  suggestedLevel: UserLevel | null;
  manualOverride: UserLevel | null;
  highestAutoLevelReached: UserLevel;
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
  displayName: string | null;
  notifyLevelUp: boolean;
  notifyMicroFeedback: boolean;
  notifyTutorSuggestions: boolean;
  trackingEnabled: boolean;
  onboardingCompleted: boolean;
  profileLoaded: boolean;
  /** True after hydrateUserLevelStoreFromPersistence() runs — level is now from localStorage, not the L1 default. */
  levelReady: boolean;
  /** Pending level transition to show in the transition modal (null = nothing to show). */
  pendingLevelTransition: LevelTransition | null;
  pendingDowngradeSuggestion: LevelTransition | null;
  setSessionId: (id: string) => void;
  setChatId: (id: string | null) => void;
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
  dismissLevelTransition: () => void;
  dismissDowngradeSuggestion: () => void;
}

interface PersistedUserLevelSnapshot {
  userEmail: string;
  level: UserLevel;
  autoLevel?: UserLevel;
  suggestedLevel?: UserLevel | null;
  manualOverride?: UserLevel | null;
  highestAutoLevelReached?: UserLevel;
  lastLevelChangeTs: number;
  confidence: number;
  reasoning: string[];
  score: number;
  normalizedScore: number;
  breakdown: ScoreBreakdown[];
  thresholds: { L2: number; L3: number };
  hasAnalyzed: boolean;
  hiddenTemplates: string[];
  displayName: string | null;
  notifyLevelUp: boolean;
  notifyMicroFeedback: boolean;
  notifyTutorSuggestions: boolean;
  trackingEnabled: boolean;
  onboardingCompleted: boolean;
  profileLoaded: boolean;
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

function readPersistedUserLevelSnapshot(userEmail?: string | null): PersistedUserLevelSnapshot | null {
  if (userEmail && userEmail !== "anonymous") {
    const scoped = readPersistedState<PersistedUserLevelSnapshot>(
      makeScopedStorageKey(USER_LEVEL_SNAPSHOT_STORAGE_KEY, userEmail),
    );
    if (scoped) {
      return scoped;
    }
  }

  return readPersistedState<PersistedUserLevelSnapshot>(USER_LEVEL_SNAPSHOT_STORAGE_KEY);
}

function writePersistedUserLevelSnapshot(
  snapshot: PersistedUserLevelSnapshot,
  userEmail?: string | null,
): void {
  writePersistedState(USER_LEVEL_SNAPSHOT_STORAGE_KEY, snapshot);

  if (userEmail && userEmail !== "anonymous") {
    writePersistedState(
      makeScopedStorageKey(USER_LEVEL_SNAPSHOT_STORAGE_KEY, userEmail),
      snapshot,
    );
  }
}

function buildPersistedUserLevelSnapshot(state: UserLevelState): PersistedUserLevelSnapshot {
  return {
    userEmail: state.userEmail,
    level: state.level,
    autoLevel: state.autoLevel,
    suggestedLevel: state.suggestedLevel,
    manualOverride: state.manualOverride,
    highestAutoLevelReached: state.highestAutoLevelReached,
    lastLevelChangeTs: state.lastLevelChangeTs,
    confidence: state.confidence,
    reasoning: state.reasoning,
    score: state.score,
    normalizedScore: state.normalizedScore,
    breakdown: state.breakdown,
    thresholds: state.thresholds,
    hasAnalyzed: state.hasAnalyzed,
    hiddenTemplates: state.hiddenTemplates,
    displayName: state.displayName,
    notifyLevelUp: state.notifyLevelUp,
    notifyMicroFeedback: state.notifyMicroFeedback,
    notifyTutorSuggestions: state.notifyTutorSuggestions,
    trackingEnabled: state.trackingEnabled,
    onboardingCompleted: state.onboardingCompleted,
    profileLoaded: state.profileLoaded,
  };
}

// On the client, read persisted snapshot immediately at store creation time
// (inside `create`) so the very first render already has the correct level.
// On the server window is undefined → snapshot is null → SSR-safe defaults.
// levelReady:true is set here when a snapshot exists so components that gate
// on it (ConfigSidebar, ChatSidebar) render the correct UI on the first client
// render — no flash, no useLayoutEffect delay needed.
const _initSnapshot = typeof window !== "undefined" ? readPersistedUserLevelSnapshot() : null;

export const useUserLevelStore = create<UserLevelState>((set, get) => ({
  sessionId: generateSessionId(),
  chatId: null,
  userEmail: _initSnapshot?.userEmail ?? "anonymous",
  level: _initSnapshot?.level ?? 1,
  autoLevel: _initSnapshot?.autoLevel ?? _initSnapshot?.level ?? 1,
  suggestedLevel: _initSnapshot?.suggestedLevel ?? null,
  manualOverride: _initSnapshot?.manualOverride ?? null,
  highestAutoLevelReached: _initSnapshot?.highestAutoLevelReached ?? _initSnapshot?.autoLevel ?? _initSnapshot?.level ?? 1,
  lastLevelChangeTs: _initSnapshot?.lastLevelChangeTs ?? 0,
  confidence: _initSnapshot?.confidence ?? 0,
  reasoning: _initSnapshot?.reasoning ?? [],
  score: _initSnapshot?.score ?? 0,
  normalizedScore: _initSnapshot?.normalizedScore ?? 0,
  breakdown: _initSnapshot?.breakdown ?? [],
  thresholds: _initSnapshot?.thresholds ?? { L2: 0.25, L3: 0.55 },
  metrics: { ...initialMetrics },
  isAnalyzing: false,
  hasAnalyzed: _initSnapshot?.hasAnalyzed ?? false,
  groundTruth: null,
  hiddenTemplates: _initSnapshot?.hiddenTemplates ?? [],
  displayName: _initSnapshot?.displayName ?? null,
  notifyLevelUp: _initSnapshot?.notifyLevelUp ?? true,
  notifyMicroFeedback: _initSnapshot?.notifyMicroFeedback ?? true,
  notifyTutorSuggestions: _initSnapshot?.notifyTutorSuggestions ?? true,
  trackingEnabled: _initSnapshot?.trackingEnabled ?? true,
  onboardingCompleted: _initSnapshot?.onboardingCompleted ?? false,
  profileLoaded: false,
  levelReady: _initSnapshot !== null,
  pendingLevelTransition: null,
  pendingDowngradeSuggestion: null,

  setSessionId: (id) => set({ sessionId: id }),

  setChatId: (id) => set({ chatId: id }),

  setUserEmail: (email) => {
    const persisted = readPersistedUserLevelSnapshot(email);
    set((state) => ({
      userEmail: email,
      ...(persisted
        ? {
            level: persisted.level,
            autoLevel: persisted.autoLevel ?? persisted.level,
            suggestedLevel: persisted.suggestedLevel ?? null,
            manualOverride: persisted.manualOverride ?? null,
            highestAutoLevelReached: persisted.highestAutoLevelReached ?? persisted.autoLevel ?? persisted.level,
            lastLevelChangeTs: persisted.lastLevelChangeTs,
            confidence: persisted.confidence,
            reasoning: persisted.reasoning,
            score: persisted.score,
            normalizedScore: persisted.normalizedScore,
            breakdown: persisted.breakdown,
            thresholds: persisted.thresholds,
            hasAnalyzed: persisted.hasAnalyzed,
            hiddenTemplates: persisted.hiddenTemplates,
            displayName: persisted.displayName,
            notifyLevelUp: persisted.notifyLevelUp,
            notifyMicroFeedback: persisted.notifyMicroFeedback,
            notifyTutorSuggestions: persisted.notifyTutorSuggestions,
            trackingEnabled: persisted.trackingEnabled,
            onboardingCompleted: persisted.onboardingCompleted,
            profileLoaded: persisted.profileLoaded || state.profileLoaded,
          }
        : {}),
    }));
  },

  setLevel: (level) => set({ level }),
  setGroundTruth: (level) => set({ groundTruth: level }),
  dismissLevelTransition: () => set({ pendingLevelTransition: null }),
  dismissDowngradeSuggestion: () => set({ pendingDowngradeSuggestion: null }),

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

    if (!get().trackingEnabled) {
      set({ isAnalyzing: false });
      return;
    }

    try {
      await flushEvents();
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
          chat_id: get().chatId,
          metrics: metricsPayload,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const prevAutoLevel = get().autoLevel;

        set((s) => {
          const autoLevel = normalizeUserLevel(data.auto_level) ?? normalizeUserLevel(data.final_level) ?? s.autoLevel;
          const effectiveLevel =
            normalizeUserLevel(data.effective_ui_level) ??
            normalizeUserLevel(data.final_level) ??
            autoLevel;
          const suggestedLevel = normalizeUserLevel(data.suggested_level);
          const manualOverride =
            data.manual_override_active === true
              ? normalizeUserLevel(data.manual_level_override)
              : null;
          const autoLevelChanged = autoLevel !== s.autoLevel;
          const transition: LevelTransition | null =
            autoLevelChanged && manualOverride === null
              ? { fromLevel: s.autoLevel, toLevel: autoLevel, direction: autoLevel > s.autoLevel ? "up" : "down" }
              : null;
          const isSuggestedDowngrade = transition?.direction === "down";

          return {
            level: isSuggestedDowngrade ? s.level : effectiveLevel,
            autoLevel,
            suggestedLevel,
            manualOverride,
            highestAutoLevelReached: highestLevel(s.highestAutoLevelReached, autoLevel),
            lastLevelChangeTs: autoLevelChanged ? Date.now() : s.lastLevelChangeTs,
            confidence: data.confidence,
            reasoning: data.reasoning,
            score: data.score,
            normalizedScore: data.normalized_score,
            breakdown: data.breakdown ?? [],
            thresholds: data.thresholds ?? { L2: 0.25, L3: 0.55 },
            isAnalyzing: false,
            hasAnalyzed: true,
            pendingLevelTransition: transition?.direction === "up" ? transition : null,
            pendingDowngradeSuggestion: isSuggestedDowngrade ? transition : null,
            metrics: {
              ...s.metrics,
              levelTransitionCount: autoLevelChanged
                ? s.metrics.levelTransitionCount + 1
                : s.metrics.levelTransitionCount,
            },
          };
        });

        // Micro-feedback triggers
        const updatedState = get();
        const autoLevelChanged = updatedState.autoLevel !== prevAutoLevel;
        try {
          if (updatedState.notifyMicroFeedback) {
            const { useMicroFeedbackStore } = await import("./microFeedbackStore");
            const trigger = useMicroFeedbackStore.getState().tryTrigger;

            if (
              autoLevelChanged &&
              updatedState.manualOverride === null &&
              updatedState.pendingDowngradeSuggestion === null
            ) {
              // Trigger 1: level just changed
              trigger("level_change_agree");
            } else if (data.confidence < 0.4 && updatedState.metrics.sessionMessageCount >= 3) {
              // Trigger 2: low confidence after a few messages
              trigger("low_confidence_self_assess");
            } else if (updatedState.metrics.sessionMessageCount > 0 &&
                       updatedState.metrics.sessionMessageCount % 10 === 0) {
              // Trigger 5: periodic check every 10 messages
              trigger("periodic_check");
            } else if (updatedState.metrics.tooltipClickCount >= 3) {
              // Trigger 3: user opened many help tooltips
              trigger("help_series_check");
            }
          }
        } catch {
          // micro-feedback is non-critical
        }

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

  restoreFromMessages: async (_userTexts: string[]) => {
    get().resetMetrics();
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
      if (!res.ok) {
        set({ profileLoaded: true });
        return;
      }
      const data = await res.json();
      const nextState: Partial<UserLevelState> = { profileLoaded: true };
      if (Array.isArray(data.hidden_templates)) {
        nextState.hiddenTemplates = data.hidden_templates;
      }
      const currentLevel = normalizeUserLevel(data.current_level);
      const autoLevel = normalizeUserLevel(data.auto_level) ?? currentLevel;
      if (currentLevel !== null) {
        nextState.level = currentLevel;
      }
      if (autoLevel !== null) {
        nextState.autoLevel = autoLevel;
        nextState.highestAutoLevelReached = highestLevel(get().highestAutoLevelReached, autoLevel);
      }
      nextState.manualOverride = normalizeUserLevel(data.manual_level_override);
      if (typeof data.onboarding_completed === "boolean") {
        nextState.onboardingCompleted = data.onboarding_completed;
      }
      set(nextState);
    } catch {
      set({ profileLoaded: true });
    }
  },

  resetMetrics: () =>
    set({
      metrics: { ...initialMetrics, sessionStartTime: Date.now() },
      isAnalyzing: false,
      hasAnalyzed: false,
    }),
}));

useUserLevelStore.subscribe((state) => {
  writePersistedUserLevelSnapshot(
    buildPersistedUserLevelSnapshot(state),
    state.userEmail,
  );
});

let userLevelStoreHydrated = false;

export function hydrateUserLevelStoreFromPersistence(): void {
  if (userLevelStoreHydrated) return;
  userLevelStoreHydrated = true;

  const persisted = readPersistedUserLevelSnapshot();

  if (!persisted) {
    useUserLevelStore.setState({ levelReady: true });
    return;
  }

  useUserLevelStore.setState((state) => ({
    ...state,
    userEmail: persisted.userEmail,
    level: persisted.level,
    autoLevel: persisted.autoLevel ?? persisted.level,
    suggestedLevel: persisted.suggestedLevel ?? null,
    manualOverride: persisted.manualOverride ?? null,
    highestAutoLevelReached: persisted.highestAutoLevelReached ?? persisted.autoLevel ?? persisted.level,
    lastLevelChangeTs: persisted.lastLevelChangeTs,
    confidence: persisted.confidence,
    reasoning: persisted.reasoning,
    score: persisted.score,
    normalizedScore: persisted.normalizedScore,
    breakdown: persisted.breakdown,
    thresholds: persisted.thresholds,
    hasAnalyzed: persisted.hasAnalyzed,
    hiddenTemplates: persisted.hiddenTemplates,
    displayName: persisted.displayName,
    notifyLevelUp: persisted.notifyLevelUp,
    notifyMicroFeedback: persisted.notifyMicroFeedback,
    notifyTutorSuggestions: persisted.notifyTutorSuggestions,
    trackingEnabled: persisted.trackingEnabled,
    onboardingCompleted: persisted.onboardingCompleted,
    profileLoaded: persisted.profileLoaded,
    levelReady: true,
  }));
}
