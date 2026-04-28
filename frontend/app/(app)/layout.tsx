"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import {
  hydrateUserLevelStoreFromPersistence,
  useUserLevelStore,
} from "@/lib/store/userLevelStore";
import {
  hydrateChatStoreFromPersistence,
  useChatStore,
} from "@/lib/store/chatStore";
import {
  hydrateI18nStoreFromPersistence,
  useI18nStore,
} from "@/lib/store/i18nStore";
import { useUiShellStore } from "@/lib/store/uiShellStore";
import {
  fetchProfilePreferences,
  hydrateCachedAccountStats,
  hydrateCachedProfilePreferences,
  readCachedProfilePreferences,
} from "@/lib/profilePreferences";
import { initEventTracker } from "@/lib/eventTracker";
import { ChatSidebar } from "@/components/ChatSidebar";
import { RoutePrefetcher } from "@/components/RoutePrefetcher";
import { hydrateModelsStoreFromPersistence } from "@/lib/store/modelsStore";
import { hydrateProjectStoreFromPersistence } from "@/lib/store/projectStore";
import { hydrateTemplatesStoreFromPersistence } from "@/lib/store/templatesStore";

const MicroFeedbackToast = dynamic(
  () => import("@/components/MicroFeedbackToast").then((m) => ({ default: m.MicroFeedbackToast })),
  { ssr: false },
);
const LevelUpNotification = dynamic(
  () => import("@/components/LevelUpNotification").then((m) => ({ default: m.LevelUpNotification })),
  { ssr: false },
);
const OnboardingModal = dynamic(
  () => import("@/components/OnboardingModal").then((m) => ({ default: m.OnboardingModal })),
  { ssr: false },
);
const FeedbackModal = dynamic(
  () => import("@/components/modals/FeedbackModal").then((m) => ({ default: m.FeedbackModal })),
  { ssr: false },
);
const LevelTransitionModal = dynamic(
  () => import("@/components/modals/LevelTransitionModal").then((m) => ({ default: m.LevelTransitionModal })),
  { ssr: false },
);

function parseCurrentLevel(value: unknown): 1 | 2 | 3 | null {
  return value === 1 || value === 2 || value === 3 ? value : null;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const { setTheme } = useTheme();
  const setThemeRef = useRef(setTheme);
  setThemeRef.current = setTheme;
  const prefsFetched = useRef(false);
  const feedbackOpen = useUiShellStore((s) => s.feedbackOpen);
  const setFeedbackOpen = useUiShellStore((s) => s.setFeedbackOpen);
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    hydrateI18nStoreFromPersistence();
    hydrateUserLevelStoreFromPersistence();
    hydrateModelsStoreFromPersistence();
    const persistedUserEmail = useUserLevelStore.getState().userEmail;
    hydrateChatStoreFromPersistence(persistedUserEmail);
    hydrateProjectStoreFromPersistence(persistedUserEmail);
    hydrateTemplatesStoreFromPersistence(persistedUserEmail);
    hydrateCachedAccountStats(persistedUserEmail);

    const cachedPreferences = hydrateCachedProfilePreferences(persistedUserEmail);

    if (cachedPreferences) {
      if (cachedPreferences.language) {
        useI18nStore.getState().setLanguage(cachedPreferences.language as "en" | "uk");
      }
      if (cachedPreferences.theme && !localStorage.getItem("theme")) {
        setThemeRef.current(cachedPreferences.theme);
      }

      const currentLevel = parseCurrentLevel(cachedPreferences.current_level);
      if (currentLevel !== null) {
        useUserLevelStore.getState().setLevel(currentLevel);
      }

      useUserLevelStore.setState({
        hiddenTemplates: Array.isArray(cachedPreferences.hidden_templates)
          ? cachedPreferences.hidden_templates
          : [],
        profileLoaded: true,
        onboardingCompleted: cachedPreferences.onboarding_completed ?? false,
        displayName: cachedPreferences.display_name ?? null,
        notifyLevelUp: cachedPreferences.notify_level_up ?? true,
        notifyMicroFeedback: cachedPreferences.notify_micro_feedback ?? true,
        notifyTutorSuggestions: cachedPreferences.notify_tutor_suggestions ?? true,
        trackingEnabled: cachedPreferences.tracking_enabled ?? true,
      });
    }

    // Signal that all stores are hydrated — children can now render with
    // correct persisted state (level, sidebar open state, preferences, etc.)
    setMounted(true);
  }, []);

  useEffect(() => {
    const email = session?.user?.email;
    if (!email || prefsFetched.current) return;

    let cancelled = false;
    prefsFetched.current = true;
    useUserLevelStore.getState().setUserEmail(email);
    hydrateChatStoreFromPersistence(email);
    hydrateProjectStoreFromPersistence(email);
    hydrateTemplatesStoreFromPersistence(email);
    hydrateCachedAccountStats(email);

    const cachedPreferences = hydrateCachedProfilePreferences(email) ?? readCachedProfilePreferences(email);
    if (cachedPreferences) {
      if (cachedPreferences.language) {
        useI18nStore.getState().setLanguage(cachedPreferences.language as "en" | "uk");
      }
      if (cachedPreferences.theme && !localStorage.getItem("theme")) {
        setThemeRef.current(cachedPreferences.theme);
      }
      const currentLevel = parseCurrentLevel(cachedPreferences.current_level);
      if (currentLevel !== null) {
        useUserLevelStore.getState().setLevel(currentLevel);
      }
      useUserLevelStore.setState({
        hiddenTemplates: Array.isArray(cachedPreferences.hidden_templates)
          ? cachedPreferences.hidden_templates
          : [],
        profileLoaded: true,
        onboardingCompleted: cachedPreferences.onboarding_completed ?? false,
        displayName: cachedPreferences.display_name ?? null,
        notifyLevelUp: cachedPreferences.notify_level_up ?? true,
        notifyMicroFeedback: cachedPreferences.notify_micro_feedback ?? true,
        notifyTutorSuggestions: cachedPreferences.notify_tutor_suggestions ?? true,
        trackingEnabled: cachedPreferences.tracking_enabled ?? true,
      });
    }

    const trackerTimeout = setTimeout(() => {
      initEventTracker({
        getSessionId: () => useUserLevelStore.getState().sessionId,
        getChatId: () => useChatStore.getState().activeChatId,
        getTrackingEnabled: () => useUserLevelStore.getState().trackingEnabled,
      });
    }, 0);

    void fetchProfilePreferences(email)
      .then((data) => {
        if (cancelled) return;

        if (data.language) {
          useI18nStore.getState().setLanguage(data.language as "en" | "uk");
        }
        if (data.theme && !localStorage.getItem("theme")) {
          document.documentElement.classList.add("theme-transitioning");
          setThemeRef.current(data.theme);
          setTimeout(() => {
            document.documentElement.classList.remove("theme-transitioning");
          }, 50);
        }
        if (Array.isArray(data.hidden_templates)) {
          useUserLevelStore.setState({ hiddenTemplates: data.hidden_templates });
        }
        const currentLevel = parseCurrentLevel(data.current_level);
        if (currentLevel !== null) {
          useUserLevelStore.getState().setLevel(currentLevel);
        }
        useUserLevelStore.setState({
          profileLoaded: true,
          onboardingCompleted: data.onboarding_completed ?? false,
          displayName: data.display_name ?? null,
          notifyLevelUp: data.notify_level_up ?? true,
          notifyMicroFeedback: data.notify_micro_feedback ?? true,
          notifyTutorSuggestions: data.notify_tutor_suggestions ?? true,
          trackingEnabled: data.tracking_enabled ?? true,
        });
      })
      .catch(() => {
        if (!cancelled) prefsFetched.current = false;
        useUserLevelStore.setState({ profileLoaded: true });
      });

    return () => {
      cancelled = true;
      clearTimeout(trackerTimeout);
    };
  }, [session?.user?.email]);

  if (!mounted) {
    // Render a neutral shell that matches SSR output exactly — no level-gated
    // content, no localStorage reads. Browser replaces this instantly after
    // useLayoutEffect fires (before first paint), so the user never sees it.
    return (
      <div className="flex h-screen overflow-hidden bg-background text-foreground" />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <RoutePrefetcher />
      <ChatSidebar />

      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>

      <LevelUpNotification />
      <MicroFeedbackToast />
      <OnboardingModal />
      <LevelTransitionModal />
      <FeedbackModal open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </div>
  );
}
