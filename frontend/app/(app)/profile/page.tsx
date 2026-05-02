"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { Check } from "lucide-react";

import { ActivityHeatmap, type ActivityHeatmapDatum } from "@/components/ui/activity-heatmap";
import { actionToast } from "@/components/ui/action-toast";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AccountStats,
  ProfilePreferences,
  fetchAccountStats,
  fetchProfilePreferences,
  hydrateCachedAccountStats,
  hydrateCachedProfilePreferences,
  patchProfilePreferences,
  readCachedAccountStats,
  readCachedProfilePreferences,
} from "@/lib/profilePreferences";
import { getErrorMessage } from "@/lib/request";
import { useTranslation } from "@/lib/store/i18nStore";
import { useUserLevelStore } from "@/lib/store/userLevelStore";

type ActivityData = {
  days: ActivityHeatmapDatum[];
  total_active_days: number;
  total_events: number;
  total_messages?: number;
  range_days: number;
};

type ProfileDashboardData = {
  current_level: number;
  auto_level?: number;
  effective_level?: number;
  manual_level_override?: number | null;
  suggested_level: number | null;
  self_assessed_level: number | null;
  initial_level: number;
  rule_score: number | null;
  ml_score: number | null;
  confidence: number | null;
  profile_features: Record<string, unknown>;
  level_history: number[];
  updated_at: string | null;
};

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getProgressPercent(level: number, normalized: number): number {
  if (level >= 3) return 100;
  return Math.min(100, Math.max(0, Math.round(normalized * 100)));
}

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export default function ProfilePage() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const persistedUserEmail = useUserLevelStore((s) => s.userEmail);
  const hasCachedPreferencesRef = useRef(false);

  const storageUserEmail = session?.user?.email ?? persistedUserEmail;
  const [preferences, setPreferences] = useState<ProfilePreferences | null>(null);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [dashboard, setDashboard] = useState<ProfileDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityRange, setActivityRange] = useState("last-12-months");
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameSavedAt, setNameSavedAt] = useState<number | null>(null);

  const user = session?.user;
  const email = user?.email ?? null;
  const name = user?.name ?? null;
  const avatarUrl = user?.image ?? null;
  const activityRangeOptions = useMemo(
    () => [
      { value: "last-12-months", label: t("settings.profileActivityRange") },
      { value: "current-year", label: String(new Date().getFullYear()) },
    ],
    [t],
  );

  useLayoutEffect(() => {
    const cachedPreferences =
      hydrateCachedProfilePreferences(storageUserEmail) ?? readCachedProfilePreferences(storageUserEmail);
    const cachedStats =
      hydrateCachedAccountStats(storageUserEmail) ?? readCachedAccountStats(storageUserEmail);

    if (cachedPreferences) {
      hasCachedPreferencesRef.current = true;
      setPreferences(cachedPreferences);
      setDisplayNameDraft(cachedPreferences.display_name ?? "");
      setIsLoading(false);
    }
    if (cachedStats) setStats(cachedStats);
  }, [storageUserEmail]);

  const loadPreferences = useCallback(async () => {
    const hasCachedPreferences = hasCachedPreferencesRef.current;
    if (!hasCachedPreferences) setIsLoading(true);
    setLoadError(null);
    try {
      const data = await fetchProfilePreferences(storageUserEmail);
      hasCachedPreferencesRef.current = true;
      setPreferences(data);
      setDisplayNameDraft(data.display_name ?? "");
    } catch (error) {
      if (!hasCachedPreferences) {
        setLoadError(getErrorMessage(error, t("settings.loadError")));
      }
    } finally {
      setIsLoading(false);
    }
  }, [storageUserEmail, t]);

  const loadStats = useCallback(async () => {
    try {
      const data = await fetchAccountStats(storageUserEmail);
      setStats(data);
    } catch {
      setStats(null);
    }
  }, [storageUserEmail]);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    setActivityError(null);
    try {
      const res = await fetch("/api/profile/activity", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as ActivityData;
      setActivity(data);
    } catch {
      setActivityError(t("settings.profileActivityLoadError"));
    } finally {
      setActivityLoading(false);
    }
  }, [t]);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/profile/dashboard", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      setDashboard((await res.json()) as ProfileDashboardData);
    } catch {
      setDashboard(null);
    }
  }, []);

  useEffect(() => {
    void loadPreferences();
    void loadStats();
    void loadActivity();
    void loadDashboard();
  }, [loadActivity, loadDashboard, loadPreferences, loadStats]);

  const initials = useMemo(() => {
    const source = preferences?.display_name?.trim() || name || email || "?";
    const chunks = source.trim().split(/\s+/).slice(0, 2);
    return chunks.map((chunk) => chunk.charAt(0).toUpperCase()).join("") || "?";
  }, [preferences?.display_name, name, email]);

  const trimmedDisplayName = displayNameDraft.trim();
  const originalDisplayName = (preferences?.display_name ?? "").trim();
  const isDirtyDisplayName = trimmedDisplayName !== originalDisplayName;
  const savedRecently = Boolean(nameSavedAt && Date.now() - nameSavedAt < 2500);

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

  const dashboardFeatures = dashboard?.profile_features ?? {};
  const trackedSessions = toNumber(dashboardFeatures.sessions_count);
  const totalPrompts = toNumber(dashboardFeatures.total_prompts);
  const currentLevel =
    dashboard?.auto_level ??
    dashboard?.current_level ??
    preferences?.auto_level ??
    preferences?.current_level ??
    1;
  const normalizedFromScore =
    dashboard?.rule_score !== null && dashboard?.rule_score !== undefined
      ? Math.min(1, Math.max(0, dashboard.rule_score / 15))
      : null;
  const progressPercent = getProgressPercent(
    currentLevel,
    normalizedFromScore ?? 0,
  );
  const progressLabel =
    currentLevel >= 3
      ? t("profile.progressMax")
      : fill(t("profile.progressToward"), {
          percent: progressPercent,
          level: currentLevel + 1,
        });

  const activitySummary = useMemo(() => {
    const days = activity?.days ?? [];
    const counts = new Map(days.map((day) => [day.date, day.count]));
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    let last7Messages = 0;
    for (let index = 0; index < 7; index += 1) {
      const date = new Date(today);
      date.setUTCDate(today.getUTCDate() - index);
      last7Messages += counts.get(date.toISOString().slice(0, 10)) ?? 0;
    }

    let streak = 0;
    for (let index = 0; index < (activity?.range_days ?? 364); index += 1) {
      const date = new Date(today);
      date.setUTCDate(today.getUTCDate() - index);
      if ((counts.get(date.toISOString().slice(0, 10)) ?? 0) <= 0) break;
      streak += 1;
    }

    const best = days.reduce<ActivityHeatmapDatum | null>(
      (current, day) => (!current || day.count > current.count ? day : current),
      null,
    );
    const totalMessages = activity?.total_messages ?? stats?.messages_count ?? 0;
    const activeDays = activity?.total_active_days ?? 0;

    return {
      totalMessages,
      activeDays,
      last7Messages,
      streak,
      bestDay: best?.count ?? 0,
      avgPerActiveDay: activeDays > 0 ? Math.round(totalMessages / activeDays) : 0,
    };
  }, [activity, stats?.messages_count]);

  return (
    <main className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
      <div className="mx-auto max-w-6xl px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
        <div className="space-y-8">
          <div>
            <h1 className="text-[28px] font-semibold text-ds-text sm:text-[32px]">
              {t("menu.profile")}
            </h1>
          </div>

          {loadError ? (
            <ErrorState
              description={loadError}
              actionLabel={t("common.retry")}
              onAction={() => void loadPreferences()}
            />
          ) : null}

          <div className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="min-h-0 space-y-5">
              <div>
                <div className="flex items-start gap-3">
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
                      <div className="flex h-full w-full items-center justify-center text-[15px] font-semibold text-ds-text-secondary">
                        {initials}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    {isLoading ? (
                      <div className="space-y-2 pt-1">
                        <Skeleton height={20} width="62%" />
                        <Skeleton height={14} width="76%" />
                      </div>
                    ) : (
                      <>
                        <p className="truncate text-[17px] font-semibold leading-6 text-ds-text">
                          {preferences?.display_name?.trim() || name || email}
                        </p>
                        <p className="truncate text-[13px] leading-5 text-ds-text-tertiary">
                          {email ?? "-"}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium text-ds-text-secondary">
                      {t("settings.displayName")}
                    </label>
                    <Input
                      variant="default"
                      size="sm"
                      value={displayNameDraft}
                      disabled={isLoading}
                      onChange={(event) => setDisplayNameDraft(event.target.value)}
                      placeholder={t("settings.displayNamePlaceholder")}
                      maxLength={120}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="w-full"
                    isLoading={isSavingName}
                    disabled={!isDirtyDisplayName || isSavingName || isLoading}
                    onClick={() => void handleDisplayNameSave()}
                    leftIcon={savedRecently ? <Check size={14} strokeWidth={2} /> : undefined}
                  >
                    {savedRecently ? t("settings.saved") : t("settings.save")}
                  </Button>
                </div>
              </div>

              <div className="border-t border-gray-alpha-200 pt-4">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <p className="text-[14px] font-semibold leading-5 text-ds-text">{t("profile.progress")}</p>
                  <p className="text-[13px] text-ds-text-tertiary">{progressLabel}</p>
                </div>
                <Progress value={progressPercent} max={100} variant="default" />
                <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-[13px] leading-5">
                  {[
                    { label: t("profile.prompts"), value: (totalPrompts ?? activitySummary.totalMessages) || "-" },
                    { label: t("profile.sessions"), value: trackedSessions ?? "-" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-3">
                      <span className="text-ds-text-tertiary">{item.label}</span>
                      <span className="font-medium text-ds-text tabular-nums">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-alpha-200 pt-4">
                <div className="space-y-2 text-[14px] leading-5">
                  {[
                    { label: t("profile.chats"), value: stats?.chats_count ?? "-" },
                    { label: t("profile.projects"), value: stats?.projects_count ?? "-" },
                    { label: t("profile.activeDays"), value: activitySummary.activeDays || "-" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-3">
                      <span className="text-ds-text-tertiary">{item.label}</span>
                      <span className="font-medium text-ds-text tabular-nums">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <section className="min-h-0">
              <div className="w-fit max-w-full space-y-4">
                <div className="flex min-h-9 items-center justify-between gap-4">
                  <p className="px-1 text-[15px] font-semibold leading-5 text-ds-text">
                    {t("settings.profileActivityTitle")}
                  </p>
                  <Select
                    size="sm"
                    align="end"
                    triggerWidthMode="content"
                    dropdownWidthMode="content"
                    dropdownMinWidth={180}
                    value={activityRange}
                    onValueChange={setActivityRange}
                    options={activityRangeOptions}
                    className="px-2.5 text-[14px]"
                  />
                </div>

                {activityError ? (
                  <ErrorState
                    description={activityError}
                    actionLabel={t("common.retry")}
                    onAction={() => void loadActivity()}
                  />
                ) : (
                  <ActivityHeatmap data={activity?.days ?? []} loading={activityLoading} />
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
