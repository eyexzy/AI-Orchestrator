"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
import {
  AlertTriangle,
  Check,
  Layers,
  LogOut,
  BarChart2,
  Trash2,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Choicebox } from "@/components/ui/choicebox";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { actionToast } from "@/components/ui/action-toast";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { ThemeSwitcher, type ThemeOption } from "@/components/ui/theme-switcher";
import { DeleteAccountModal } from "@/components/modals/DeleteAccountModal";
import { DeleteAllChatsModal } from "@/components/modals/DeleteAllChatsModal";
import { SETTINGS_UI_STATE_STORAGE_KEY } from "@/lib/config";
import { makeScopedStorageKey } from "@/lib/persistedState";
import { cn } from "@/lib/utils";
import {
  AccountStats,
  ProfilePreferences,
  deleteAccount,
  deleteAllChats,
  fetchAccountStats,
  fetchProfilePreferences,
  hydrateCachedAccountStats,
  hydrateCachedProfilePreferences,
  patchProfilePreferences,
  readCachedAccountStats,
  readCachedProfilePreferences,
} from "@/lib/profilePreferences";
import { getErrorMessage } from "@/lib/request";
import { useChatStore } from "@/lib/store/chatStore";
import { useDraftStore } from "@/lib/store/draftStore";
import { useI18nStore, useTranslation, type Language } from "@/lib/store/i18nStore";
import { useTemplatesStore } from "@/lib/store/templatesStore";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { useUiShellStore } from "@/lib/store/uiShellStore";
import { usePersistentUiState } from "@/lib/usePersistentUiState";

type SettingsTab = "general" | "adaptation" | "usage" | "account";

interface TabDefinition {
  key: SettingsTab;
  labelKey: string;
  icon: typeof UserRound;
}

const TAB_DEFINITIONS: TabDefinition[] = [
  { key: "general",    labelKey: "settings.general",    icon: UserRound },
  { key: "adaptation", labelKey: "settings.adaptation", icon: Layers },
  { key: "usage",      labelKey: "settings.usage",      icon: BarChart2 },
  { key: "account",    labelKey: "settings.account",    icon: UserRound },
];

const DAILY_LIMIT_DISPLAY = 50;

type NotificationKey =
  | "notify_level_up"
  | "notify_micro_feedback"
  | "notify_tutor_suggestions";

function parseManualLevelOverride(value: unknown): "auto" | 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3 ? value : "auto";
}

function parseCurrentLevel(value: unknown): 1 | 2 | 3 | null {
  return value === 1 || value === 2 || value === 3 ? value : null;
}

function isSettingsTab(value: unknown): value is SettingsTab {
  return value === "general" || value === "adaptation" || value === "account";
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2.5 px-1 text-[12.5px] font-medium text-ds-text-tertiary">
      {children}
    </p>
  );
}

function Card({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border",
        tone === "danger"
          ? "border-red-400 bg-background-100"
          : "border-gray-alpha-200 bg-background-100",
      )}
    >
      {children}
    </div>
  );
}

function Row({
  title,
  description,
  control,
  children,
  tone,
}: {
  title: string;
  description?: string;
  control?: React.ReactNode;
  children?: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-[14px] font-medium",
              tone === "danger" ? "text-ds-text" : "text-ds-text",
            )}
          >
            {title}
          </p>
          {description && (
            <p
              className={cn(
                "mt-1 text-[13px] leading-relaxed",
                tone === "danger" ? "text-ds-text" : "text-ds-text-tertiary",
              )}
            >
              {description}
            </p>
          )}
        </div>
        {control && <div className="shrink-0 self-center">{control}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

function RowDivider({ tone }: { tone?: "danger" }) {
  return (
    <div
      className={cn(
        "border-t",
        tone === "danger" ? "border-red-400" : "border-gray-alpha-200",
      )}
    />
  );
}

function ToggleSkeleton() {
  return <Skeleton width={40} height={24} className="rounded-full" />;
}

export default function SettingsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { data: session } = useSession();
  const selectChat = useChatStore((s) => s.selectChat);
  const language = useI18nStore((s) => s.language);
  const setLanguage = useI18nStore((s) => s.setLanguage);
  const setFeedbackOpen = useUiShellStore((s) => s.setFeedbackOpen);
  const setLevel = useUserLevelStore((s) => s.setLevel);
  const currentLevel = useUserLevelStore((s) => s.level);
  const resetMetrics = useUserLevelStore((s) => s.resetMetrics);
  const hiddenTemplates = useUserLevelStore((s) => s.hiddenTemplates);
  const persistedUserEmail = useUserLevelStore((s) => s.userEmail);
  const hasCachedPreferencesRef = useRef(false);

  const storageUserEmail = session?.user?.email ?? persistedUserEmail;
  const [activeTab, setActiveTab] = usePersistentUiState<SettingsTab>(
    makeScopedStorageKey(SETTINGS_UI_STATE_STORAGE_KEY, storageUserEmail),
    "general",
    { validate: isSettingsTab },
  );
  const [preferences, setPreferences] = useState<ProfilePreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameSavedAt, setNameSavedAt] = useState<number | null>(null);

  const [override, setOverride] = useState<"auto" | 1 | 2 | 3>("auto");
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isResettingOnboarding, setIsResettingOnboarding] = useState(false);
  const [isRestoringTemplates, setIsRestoringTemplates] = useState(false);

  const [stats, setStats] = useState<AccountStats | null>(null);

  type UsagePeriod = { used: number; limit: number; remaining: number; reset_at: string };
  type UsageData = { daily: UsagePeriod; weekly: UsagePeriod; date: string };

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function fmtResetAt(iso: string): string {
    const d = new Date(iso);
    const mon = MONTHS[d.getUTCMonth()];
    const day = d.getUTCDate();
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    return `${mon} ${day}, ${hh}:${mm} UTC`;
  }

  function usageVariant(pct: number): "gray" | "default" | "warning" | "error" {
    if (pct >= 0.85) return "error";
    if (pct >= 0.6)  return "warning";
    if (pct >= 0.25) return "default";
    return "gray";
  }

  type HistoryItem = { id: number; chat_id: string; chat_title: string; created_at: string; model: string; tokens: number; cost_usd: number; kind: string };
  type HistoryData = { total: number; page: number; page_size: number; pages: number; items: HistoryItem[] };

  const [usage, setUsage] = useState<UsageData | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [historyDays, setHistoryDays] = useState(30);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [deleteChatsOpen, setDeleteChatsOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [isDeletingChats, setIsDeletingChats] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  useLayoutEffect(() => {
    const cachedPreferences =
      hydrateCachedProfilePreferences(storageUserEmail) ?? readCachedProfilePreferences(storageUserEmail);
    const cachedStats =
      hydrateCachedAccountStats(storageUserEmail) ?? readCachedAccountStats(storageUserEmail);

    if (cachedPreferences) {
      hasCachedPreferencesRef.current = true;
      setPreferences(cachedPreferences);
      setDisplayNameDraft(cachedPreferences.display_name ?? "");
      setOverride(parseManualLevelOverride(cachedPreferences.manual_level_override));
      setIsLoading(false);
    }

    if (cachedStats) {
      setStats(cachedStats);
    }
  }, [storageUserEmail]);

  const loadPreferences = useCallback(async () => {
    const hasCachedPreferences = hasCachedPreferencesRef.current;
    if (!hasCachedPreferences) {
      setIsLoading(true);
    }
    setLoadError(null);
    try {
      const data = await fetchProfilePreferences(storageUserEmail);
      hasCachedPreferencesRef.current = true;
      setPreferences(data);
      setDisplayNameDraft(data.display_name ?? "");
      setOverride(parseManualLevelOverride(data.manual_level_override));
    } catch (error) {
      if (!hasCachedPreferences) {
        setLoadError(getErrorMessage(error, t("settings.loadError")));
      }
    } finally {
      setIsLoading(false);
    }
  }, [hasCachedPreferencesRef, storageUserEmail, t]);

  const loadStats = useCallback(async () => {
    try {
      const data = await fetchAccountStats(storageUserEmail);
      setStats(data);
    } catch {
      setStats(null);
    }
  }, [storageUserEmail]);

  const loadUsage = useCallback(async () => {
    setUsageLoading(true);
    setUsageError(null);
    try {
      const res = await fetch("/api/usage");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { daily: { used: number; limit: number; remaining: number; reset_at: string }; weekly: { used: number; limit: number; remaining: number; reset_at: string }; date: string };
      setUsage(data);
    } catch {
      setUsageError(t("settings.usageLoadError"));
    } finally {
      setUsageLoading(false);
    }
  }, [t]);

  const loadHistory = useCallback(async (page: number, pageSize: number, days: number) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/usage/history?days=${days}&page=${page}&page_size=${pageSize}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as HistoryData;
      setHistory(data);
    } catch {
      // silently fail
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const downloadHistory = useCallback(() => {
    if (!history?.items.length) return;
    const rows = [
      ["Date", "Model", "Cost (USD)", "Event"],
      ...history.items.map((item) => [
        new Date(item.created_at).toLocaleString(),
        item.model,
        item.cost_usd > 0 ? item.cost_usd.toFixed(6) : "0",
        `${typeof window !== "undefined" ? window.location.origin : ""}/chat?id=${item.chat_id}`,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [history]);

  useEffect(() => {
    void loadPreferences();
    void loadStats();
  }, [loadPreferences, loadStats]);

  useEffect(() => {
    if (activeTab === "usage") {
      void loadUsage();
      void loadHistory(1, historyPageSize, historyDays);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, loadUsage, loadHistory]);

  useEffect(() => {
    if (activeTab === "usage") void loadHistory(historyPage, historyPageSize, historyDays);
  }, [historyPage, historyPageSize, historyDays, activeTab, loadHistory]);

  const user = session?.user;
  const email = user?.email ?? null;
  const name = user?.name ?? null;
  const avatarUrl = user?.image ?? null;
  const initials = useMemo(() => {
    const source = preferences?.display_name?.trim() || name || email || "?";
    const chunks = source.trim().split(/\s+/).slice(0, 2);
    return chunks.map((chunk) => chunk.charAt(0).toUpperCase()).join("") || "?";
  }, [preferences?.display_name, name, email]);

  const handleDisplayNameSave = async () => {
    setIsSavingName(true);
    try {
      const data = await patchProfilePreferences({ display_name: displayNameDraft }, storageUserEmail);
      setPreferences(data);
      setDisplayNameDraft(data.display_name ?? "");
      setNameSavedAt(Date.now());
      useUserLevelStore.setState({ displayName: data.display_name ?? null });
      actionToast.saved(t("settings.savedToast"));
    } catch (error) {
      actionToast.error(getErrorMessage(error, t("settings.saveError")));
    } finally {
      setIsSavingName(false);
    }
  };

  const handleLanguageChange = async (lang: Language) => {
    const previous = language;
    setLanguage(lang);
    useTemplatesStore.getState().fetchTemplates();
    try {
      await patchProfilePreferences({ language: lang }, storageUserEmail);
    } catch (error) {
      setLanguage(previous);
      useTemplatesStore.getState().fetchTemplates();
      actionToast.error(getErrorMessage(error, t("menu.preferenceSaveError")));
    }
  };

  const handleThemePersist = useCallback((nextTheme: ThemeOption) => {
    patchProfilePreferences({ theme: nextTheme }, storageUserEmail).catch((error: unknown) => {
      actionToast.error(getErrorMessage(error, t("menu.preferenceSaveError")));
    });
  }, [storageUserEmail, t]);

  const handleOverrideChange = async (value: "auto" | 1 | 2 | 3) => {
    const previousOverride = override;
    const previousLevel = currentLevel;
    setOverride(value);
    setSaveError(null);
    if (value !== "auto") setLevel(value);

    setIsSavingOverride(true);
    try {
      const data = await patchProfilePreferences({
        manual_level_override: value === "auto" ? null : value,
      }, storageUserEmail);
      setPreferences(data);
      const persistedOverride = parseManualLevelOverride(data.manual_level_override);
      setOverride(persistedOverride);
      const persistedLevel = parseCurrentLevel(data.current_level);
      if (persistedLevel !== null) setLevel(persistedLevel);
      else if (persistedOverride !== "auto") setLevel(persistedOverride);
    } catch (error) {
      setOverride(previousOverride);
      if (previousOverride !== "auto") setLevel(previousOverride);
      else setLevel(previousLevel);
      setSaveError(getErrorMessage(error, t("settings.saveError")));
    } finally {
      setIsSavingOverride(false);
    }
  };

  const handleToggleNotification = async (key: NotificationKey, next: boolean) => {
    if (!preferences) return;
    const previous = preferences[key];
    setPreferences({ ...preferences, [key]: next });
    try {
      const data = await patchProfilePreferences({ [key]: next }, storageUserEmail);
      setPreferences(data);
      useUserLevelStore.setState({
        notifyLevelUp: data.notify_level_up,
        notifyMicroFeedback: data.notify_micro_feedback,
        notifyTutorSuggestions: data.notify_tutor_suggestions,
      });
    } catch (error) {
      setPreferences({ ...preferences, [key]: previous });
      actionToast.error(getErrorMessage(error, t("menu.preferenceSaveError")));
    }
  };

  const handleToggleTracking = async (next: boolean) => {
    if (!preferences) return;
    setPreferences({ ...preferences, tracking_enabled: next });
    try {
      const data = await patchProfilePreferences({ tracking_enabled: next }, storageUserEmail);
      setPreferences(data);
      useUserLevelStore.setState({ trackingEnabled: data.tracking_enabled });
    } catch (error) {
      setPreferences({ ...preferences, tracking_enabled: !next });
      actionToast.error(getErrorMessage(error, t("menu.preferenceSaveError")));
    }
  };

  const handleRestoreHiddenTemplates = async () => {
    setIsRestoringTemplates(true);
    try {
      const data = await patchProfilePreferences({ hidden_templates: [] }, storageUserEmail);
      setPreferences(data);
      useUserLevelStore.setState({ hiddenTemplates: [] });
      useTemplatesStore.getState().fetchTemplates();
      actionToast.restored(t("settings.restoreHiddenTemplatesSuccess"));
    } catch (error) {
      actionToast.error(getErrorMessage(error, t("settings.saveError")));
    } finally {
      setIsRestoringTemplates(false);
    }
  };

  const handleResetOnboarding = async () => {
    setIsResettingOnboarding(true);
    try {
      await patchProfilePreferences({ onboarding_completed: false }, storageUserEmail);
      useUserLevelStore.setState({ onboardingCompleted: false });
      actionToast.warning(t("settings.levelResetSuccess"));
    } catch (error) {
      actionToast.error(getErrorMessage(error, t("settings.saveError")));
    } finally {
      setIsResettingOnboarding(false);
    }
  };

  const handleDeleteChats = async () => {
    setIsDeletingChats(true);
    try {
      await deleteAllChats();
      useChatStore.setState({
        chats: [],
        activeChatId: null,
        messages: [],
      });
      await loadStats();
      setDeleteChatsOpen(false);
      actionToast.deleted(t("settings.deleteChatsSuccess"));
    } catch (error) {
      actionToast.error(getErrorMessage(error, t("settings.deleteChatsError")));
    } finally {
      setIsDeletingChats(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      await deleteAccount();
      useChatStore.getState().clearMessages();
      useDraftStore.getState().clearAll();
      resetMetrics();
      actionToast.deleted(t("settings.deleteAccountSuccess"));
      setDeleteAccountOpen(false);
      await signOut({ callbackUrl: "/login" });
    } catch (error) {
      actionToast.error(getErrorMessage(error, t("settings.deleteAccountError")));
      setIsDeletingAccount(false);
    }
  };

  const handleSignOut = () => {
    useChatStore.getState().clearMessages();
    useDraftStore.getState().clearAll();
    resetMetrics();
    signOut({ callbackUrl: "/login" });
  };

  const trimmedDisplayName = displayNameDraft.trim();
  const originalDisplayName = (preferences?.display_name ?? "").trim();
  const isDirtyDisplayName = trimmedDisplayName !== originalDisplayName;
  const savedRecently = Boolean(nameSavedAt && Date.now() - nameSavedAt < 2500);

  const LEVEL_OPTIONS = [
    { value: "auto" as const, label: t("settings.levelAuto"), description: t("settings.levelAutoDescription") },
    { value: 1 as const, label: t("settings.levelL1"), description: t("settings.levelL1Description") },
    { value: 2 as const, label: t("settings.levelL2"), description: t("settings.levelL2Description") },
    { value: 3 as const, label: t("settings.levelL3"), description: t("settings.levelL3Description") },
  ];

  return (
    <>
      <main className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="mx-auto max-w-6xl px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
          <div className="space-y-8">
            <div>
              <h1 className="text-[28px] font-semibold text-ds-text sm:text-[32px]">
                {t("settings.title")}
              </h1>
              <p className="mt-1 text-[14px] text-ds-text-tertiary">
                {t("settings.subtitle")}
              </p>
            </div>

            <div className="flex flex-col gap-8 lg:flex-row">
              <aside className="shrink-0 lg:w-[224px]">
                <nav className="sticky top-6 flex flex-col gap-1 overflow-x-auto lg:overflow-visible">
                  <div className="flex gap-1 lg:flex-col">
                    {TAB_DEFINITIONS.map(({ key, labelKey, icon: Icon }) => {
                      const isActive = activeTab === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setActiveTab(key)}
                          className={cn(
                            "group flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium transition-colors",
                            isActive
                              ? "bg-gray-alpha-200 text-ds-text"
                              : "text-ds-text-secondary hover:bg-gray-alpha-200 hover:text-ds-text",
                          )}
                        >
                          <Icon
                            size={15}
                            strokeWidth={2}
                            className={cn(
                              "transition-colors",
                              isActive
                                ? "text-ds-text"
                                : "text-ds-text-tertiary group-hover:text-ds-text",
                            )}
                          />
                          <span className="flex-1 whitespace-nowrap">{t(labelKey)}</span>
                        </button>
                      );
                    })}
                  </div>
                </nav>
              </aside>

              <div className="min-w-0 flex-1 space-y-8">
                {loadError && (
                  <ErrorState
                    description={loadError}
                    actionLabel={t("common.retry")}
                    onAction={() => void loadPreferences()}
                  />
                )}

                {activeTab === "general" && (
                  <section className="animate-fade-in space-y-8">
                    <div>
                      <SectionLabel>{t("settings.sectionProfile")}</SectionLabel>
                      <Card>
                        <div className="flex items-center gap-4 px-5 py-4">
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-gray-alpha-200 bg-gray-alpha-100">
                          {avatarUrl ? (
                              <Image
                                src={avatarUrl}
                                alt={name ?? email ?? ""}
                                fill
                                sizes="48px"
                                className="object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[14px] font-semibold text-ds-text-secondary">
                                {initials}
                              </div>
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                          {isLoading ? (
                            <div className="space-y-2">
                              <Skeleton height={16} width="32%" />
                              <Skeleton height={14} width="44%" />
                            </div>
                          ) : (
                            <>
                              <p className="truncate text-[14px] font-semibold text-ds-text">
                                {preferences?.display_name?.trim() || name || email}
                              </p>
                              <p className="mt-0.5 truncate text-[13px] text-ds-text-tertiary">
                                {email ?? "-"}
                              </p>
                            </>
                          )}
                        </div>
                      </div>

                        <RowDivider />

                        <Row
                          title={t("settings.displayName")}
                          description={t("settings.displayNameDescription")}
                        >
                          {isLoading ? (
                            <Skeleton height={36} width="100%" />
                          ) : (
                            <div className="flex gap-2">
                              <div className="flex-1">
                                <Input
                                  variant="default"
                                  size="md"
                                  value={displayNameDraft}
                                  onChange={(event) =>
                                    setDisplayNameDraft(event.target.value)
                                  }
                                  placeholder={t("settings.displayNamePlaceholder")}
                                  maxLength={120}
                                />
                              </div>
                              <Button
                                type="button"
                                variant="default"
                                size="md"
                                isLoading={isSavingName}
                                disabled={!isDirtyDisplayName || isSavingName}
                                onClick={() => void handleDisplayNameSave()}
                                leftIcon={
                                  savedRecently ? (
                                    <Check size={14} strokeWidth={2} />
                                  ) : undefined
                                }
                              >
                                {savedRecently ? t("settings.saved") : t("settings.save")}
                              </Button>
                            </div>
                          )}
                        </Row>
                      </Card>
                    </div>

                    <div>
                      <SectionLabel>{t("settings.sectionInterface")}</SectionLabel>
                      <Card>
                        <Row
                          title={t("menu.theme")}
                          description={t("settings.themeDescription")}
                          control={
                            isLoading ? (
                              <Skeleton width={96} height={32} className="rounded-full" />
                            ) : (
                              <ThemeSwitcher
                                size="default"
                                onPersist={handleThemePersist}
                              />
                            )
                          }
                        />
                        <RowDivider />
                        <Row
                          title={t("menu.language")}
                          description={t("settings.languageDescription")}
                          control={
                            isLoading ? (
                              <Skeleton width={92} height={32} className="rounded-lg" />
                            ) : (
                              <Select
                                size="sm"
                                triggerWidthMode="content"
                                value={language}
                                onValueChange={(value) =>
                                  void handleLanguageChange(value as Language)
                                }
                                options={[
                                  { value: "en", label: t("menu.langEnglish") },
                                  { value: "uk", label: t("menu.langUkrainian") },
                                ]}
                                className="px-2.5 text-[13px]"
                              />
                            )
                          }
                        />
                      </Card>
                    </div>

                    <div>
                      <SectionLabel>{t("settings.sectionNotifications")}</SectionLabel>
                      <Card>
                        <Row
                          title={t("settings.notifLevelUp")}
                          description={t("settings.notifLevelUpDescription")}
                          control={
                            isLoading ? (
                              <ToggleSkeleton />
                            ) : (
                              <Switch
                                size="md"
                                checked={preferences?.notify_level_up ?? true}
                                onCheckedChange={(next) =>
                                  void handleToggleNotification("notify_level_up", next)
                                }
                                disabled={!preferences}
                              />
                            )
                          }
                        />
                        <RowDivider />
                        <Row
                          title={t("settings.notifMicroFeedback")}
                          description={t("settings.notifMicroFeedbackDescription")}
                          control={
                            isLoading ? (
                              <ToggleSkeleton />
                            ) : (
                              <Switch
                                size="md"
                                checked={preferences?.notify_micro_feedback ?? true}
                                onCheckedChange={(next) =>
                                  void handleToggleNotification(
                                    "notify_micro_feedback",
                                    next,
                                  )
                                }
                                disabled={!preferences}
                              />
                            )
                          }
                        />
                        <RowDivider />
                        <Row
                          title={t("settings.notifTutorToast")}
                          description={t("settings.notifTutorToastDescription")}
                          control={
                            isLoading ? (
                              <ToggleSkeleton />
                            ) : (
                              <Switch
                                size="md"
                                checked={preferences?.notify_tutor_suggestions ?? true}
                                onCheckedChange={(next) =>
                                  void handleToggleNotification(
                                    "notify_tutor_suggestions",
                                    next,
                                  )
                                }
                                disabled={!preferences}
                              />
                            )
                          }
                        />
                      </Card>
                    </div>

                    <div>
                      <SectionLabel>{t("settings.sectionPrivacy")}</SectionLabel>
                      <Card>
                        <Row
                          title={t("settings.adaptiveTracking")}
                          description={t("settings.adaptiveTrackingDescription")}
                          control={
                            isLoading ? (
                              <ToggleSkeleton />
                            ) : (
                              <Switch
                                size="md"
                                checked={preferences?.tracking_enabled ?? true}
                                onCheckedChange={(next) => void handleToggleTracking(next)}
                                disabled={!preferences}
                              />
                            )
                          }
                        />
                        <RowDivider />
                        <Row
                          title={t("settings.restoreHiddenTemplates")}
                          description={
                            hiddenTemplates.length > 0
                              ? t("settings.restoreHiddenTemplatesDescription")
                              : t("settings.restoreHiddenTemplatesNone")
                          }
                          control={
                            isLoading ? (
                              <Skeleton width={132} height={32} className="rounded-lg" />
                            ) : (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                isLoading={isRestoringTemplates}
                                disabled={hiddenTemplates.length === 0}
                                onClick={() => void handleRestoreHiddenTemplates()}
                              >
                                {hiddenTemplates.length > 0
                                  ? t("settings.restoreHiddenTemplatesCount").replace(
                                      "{count}",
                                      String(hiddenTemplates.length),
                                    )
                                  : t("settings.restoreHiddenTemplatesAction")}
                              </Button>
                            )
                          }
                        />
                      </Card>
                    </div>
                  </section>
                )}

                {activeTab === "adaptation" && (
                  <section className="animate-fade-in space-y-8">
                    <div>
                      <SectionLabel>{t("settings.sectionSkillLevel")}</SectionLabel>
                      <Card>
                        <Row
                          title={t("settings.levelOverride")}
                          description={t("settings.levelDescription")}
                        >
                          {saveError && (
                            <ErrorState className="mb-3" description={saveError} />
                          )}
                          {isLoading ? (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {[...Array(4)].map((_, index) => (
                                <Skeleton key={index} height={72} width="100%" />
                              ))}
                            </div>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {LEVEL_OPTIONS.map((option) => (
                                <Choicebox
                                  key={String(option.value)}
                                  label={option.label}
                                  description={option.description}
                                  checked={override === option.value}
                                  disabled={isSavingOverride}
                                  onChange={() => void handleOverrideChange(option.value)}
                                />
                              ))}
                            </div>
                          )}
                        </Row>
                        <RowDivider />
                        <Row
                          title={t("settings.levelResetOnboarding")}
                          description={t("settings.levelResetOnboardingDescription")}
                          control={
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              isLoading={isResettingOnboarding}
                              onClick={() => void handleResetOnboarding()}
                            >
                              {t("settings.resetAction")}
                            </Button>
                          }
                        />
                      </Card>
                    </div>
                  </section>
                )}

                {activeTab === "usage" && (
                  <section className="animate-fade-in space-y-6">
                    <SectionLabel>{t("settings.sectionUsage")}</SectionLabel>

                    {usageError && (
                      <ErrorState
                        description={usageError}
                        actionLabel={t("common.retry")}
                        onAction={() => void loadUsage()}
                      />
                    )}

                    {!usageError && (
                      <Card>
                        {/* Daily */}
                        <div className="px-5 py-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[13px] font-medium text-ds-text">{t("settings.usageDailyRequests")}</p>
                              <p className="text-[12px] text-ds-text-tertiary mt-0.5">
                                {t("settings.usageResetsAt")}{" "}
                                {usage ? fmtResetAt(usage.daily.reset_at) : "—"}
                              </p>
                            </div>
                            {usageLoading ? (
                              <Skeleton className="h-5 w-20" />
                            ) : usage ? (() => {
                              const pct = usage.daily.used / usage.daily.limit;
                              const colorClass = pct >= 0.85 ? "text-red-700" : pct >= 0.6 ? "text-amber-700" : "text-ds-text-secondary";
                              return (
                                <span className={cn("text-[13px] font-mono", colorClass)}>
                                  {Math.round(pct * 100)}% used
                                </span>
                              );
                            })() : <span className="text-[13px] text-ds-text-tertiary">—</span>}
                          </div>
                          {usageLoading ? (
                            <Skeleton className="h-[10px] w-full rounded-[6px]" />
                          ) : usage ? (
                            <Progress
                              value={usage.daily.used}
                              max={usage.daily.limit}
                              variant={usageVariant(usage.daily.used / usage.daily.limit)}
                            />
                          ) : null}
                        </div>

                        <RowDivider />

                        {/* Weekly */}
                        <div className="px-5 py-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[13px] font-medium text-ds-text">{t("settings.usageWeeklyRequests")}</p>
                              <p className="text-[12px] text-ds-text-tertiary mt-0.5">
                                {t("settings.usageResetsAt")}{" "}
                                {usage ? fmtResetAt(usage.weekly.reset_at) : "—"}
                              </p>
                            </div>
                            {usageLoading ? (
                              <Skeleton className="h-5 w-20" />
                            ) : usage ? (() => {
                              const pct = usage.weekly.used / usage.weekly.limit;
                              const colorClass = pct >= 0.85 ? "text-red-700" : pct >= 0.6 ? "text-amber-700" : "text-ds-text-secondary";
                              return (
                                <span className={cn("text-[13px] font-mono", colorClass)}>
                                  {Math.round(pct * 100)}% used
                                </span>
                              );
                            })() : <span className="text-[13px] text-ds-text-tertiary">—</span>}
                          </div>
                          {usageLoading ? (
                            <Skeleton className="h-[10px] w-full rounded-[6px]" />
                          ) : usage ? (
                            <Progress
                              value={usage.weekly.used}
                              max={usage.weekly.limit}
                              variant={usageVariant(usage.weekly.used / usage.weekly.limit)}
                            />
                          ) : null}
                        </div>
                      </Card>
                    )}

                    {/* History table */}
                    <div className="space-y-3">
                      <SectionLabel>{t("settings.usageHistory")}</SectionLabel>

                      {/* Controls */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1">
                          {([1, 7, 30, 90] as const).map((d) => (
                            <Button
                              key={d}
                              type="button"
                              variant="tertiary"
                              size="sm"
                              className={cn(
                                "text-ds-text",
                                historyDays === d && "bg-gray-alpha-200",
                              )}
                              onClick={() => { setHistoryDays(d); setHistoryPage(1); }}
                            >
                              {d === 1 ? "1d" : d === 7 ? "7d" : d === 30 ? "30d" : "90d"}
                            </Button>
                          ))}
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={!history?.items.length}
                          onClick={downloadHistory}
                          leftIcon={
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                              <path fillRule="evenodd" clipRule="evenodd" d="M8 1.5a.5.5 0 0 1 .5.5v7.793l2.146-2.147a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 1 1 .708-.708L7.5 9.793V2a.5.5 0 0 1 .5-.5zM2 12.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z" />
                            </svg>
                          }
                        >
                          {t("settings.usageDownload")}
                        </Button>
                      </div>

                      {/* Table */}
                      {(() => {
                        const columns: DataTableColumn<HistoryItem>[] = [
                          {
                            key: "date",
                            header: t("settings.usageColDate"),
                            cell: (item) => (
                              <span>
                                {new Date(item.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            ),
                          },
                          {
                            key: "model",
                            header: t("settings.usageColModel"),
                            cell: (item) => (
                              <span>{item.model}</span>
                            ),
                          },
                          {
                            key: "kind",
                            header: t("settings.usageColKind"),
                            cell: (item) => (
                              <span>{item.kind}</span>
                            ),
                          },
                          {
                            key: "event",
                            header: t("settings.usageColEvent"),
                            cell: (item) => (
                              <button
                                type="button"
                                onClick={() => {
                                  void selectChat(item.chat_id);
                                  router.push("/chat");
                                }}
                                className="inline-flex items-center gap-1 hover:text-blue-700 transition-colors"
                              >
                                Message
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                  <path fillRule="evenodd" clipRule="evenodd" d="M11.5 9.75V11.25C11.5 11.388 11.388 11.5 11.25 11.5H4.75C4.612 11.5 4.5 11.388 4.5 11.25V4.75C4.5 4.612 4.612 4.5 4.75 4.5H6.25H7V3H6.25H4.75C3.784 3 3 3.784 3 4.75V11.25C3 12.216 3.784 13 4.75 13H11.25C12.216 13 13 12.216 13 11.25V9.75V9H11.5V9.75ZM8.5 3H9.25H12.25C12.664 3 13 3.336 13 3.75V6.75V7.5H11.5V6.75V5.56L8.53 8.53L8 9.06L6.94 8L7.47 7.47L10.44 4.5H9.25H8.5V3Z" />
                                </svg>
                              </button>
                            ),
                          },
                          {
                            key: "cost",
                            header: t("settings.usageColCost"),
                            align: "right",
                            cell: (item) => (
                              <span className="tabular-nums">
                                {item.cost_usd > 0 ? `$${item.cost_usd.toFixed(4)}` : "—"}
                              </span>
                            ),
                          },
                        ];

                        return (
                          <DataTable
                            columns={columns}
                            data={history?.items ?? []}
                            keyExtractor={(item) => item.id}
                            isLoading={historyLoading}
                            skeletonRows={historyPageSize > 10 ? 10 : historyPageSize}
                            emptyMessage={t("settings.usageNoHistory")}
                            page={historyPage}
                            pages={history?.pages ?? 1}
                            pageSize={historyPageSize}
                            onPageChange={(p) => setHistoryPage(p)}
                            onPageSizeChange={(s) => { setHistoryPageSize(s); setHistoryPage(1); }}
                            pageSizeLabel={t("settings.usageShow")}
                            ofLabel={t("common.of")}
                          />
                        );
                      })()}
                    </div>
                  </section>
                )}

                {activeTab === "account" && (
                  <section className="animate-fade-in space-y-8">
                    <div>
                      <SectionLabel>{t("settings.sectionSession")}</SectionLabel>
                      <Card>
                        <Row
                          title={t("settings.signOutCurrent")}
                          description={t("settings.signOutCurrentDescription")}
                          control={
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              leftIcon={<LogOut size={14} strokeWidth={2} />}
                              onClick={handleSignOut}
                            >
                              {t("menu.signOut")}
                            </Button>
                          }
                        />
                        <RowDivider />
                        <Row
                          title={t("settings.feedbackLabel")}
                          description={t("settings.feedbackDescription")}
                          control={
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => setFeedbackOpen(true)}
                            >
                              {t("settings.feedbackButton")}
                            </Button>
                          }
                        />
                      </Card>
                    </div>

                    <div>
                      <SectionLabel>{t("settings.sectionDanger")}</SectionLabel>
                      <Card>
                        <Row
                          title={t("settings.deleteChats")}
                          description={t("settings.deleteChatsDescription")}
                          control={
                            <Button
                              type="button"
                              variant="error"
                              size="sm"
                              leftIcon={<Trash2 size={14} strokeWidth={2} />}
                              onClick={() => setDeleteChatsOpen(true)}
                              disabled={!stats || stats.chats_count === 0}
                            >
                              {t("settings.deleteChatsAction")}
                            </Button>
                          }
                        />
                        <RowDivider />
                        <Row
                          title={t("settings.deleteAccount")}
                          description={t("settings.deleteAccountDescription")}
                          control={
                            <Button
                              type="button"
                              variant="error"
                              size="sm"
                              leftIcon={<AlertTriangle size={14} strokeWidth={2} />}
                              onClick={() => setDeleteAccountOpen(true)}
                            >
                              {t("settings.deleteAccountAction")}
                            </Button>
                          }
                        />
                      </Card>
                    </div>
                  </section>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <DeleteAllChatsModal
        open={deleteChatsOpen}
        onOpenChange={setDeleteChatsOpen}
        chatCount={stats?.chats_count ?? 0}
        isSubmitting={isDeletingChats}
        onConfirm={handleDeleteChats}
      />

      <DeleteAccountModal
        open={deleteAccountOpen}
        onOpenChange={setDeleteAccountOpen}
        email={email}
        isSubmitting={isDeletingAccount}
        onConfirm={handleDeleteAccount}
      />
    </>
  );
}
