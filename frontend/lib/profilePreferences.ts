import {
  ACCOUNT_STATS_STORAGE_KEY,
  PROFILE_PREFERENCES_CACHE_TTL_MS,
  PROFILE_PREFERENCES_STORAGE_KEY,
} from "@/lib/config";
import { makeScopedStorageKey, readPersistedState, writePersistedState } from "@/lib/persistedState";
import { readResponseError } from "@/lib/request";

export interface ProfilePreferences {
  theme: string;
  language: string;
  current_level: 1 | 2 | 3;
  auto_level?: 1 | 2 | 3;
  effective_level?: 1 | 2 | 3;
  initial_level: 1 | 2 | 3;
  self_assessed_level: 1 | 2 | 3 | null;
  manual_level_override: 1 | 2 | 3 | null;
  onboarding_completed: boolean;
  hidden_templates: string[];
  display_name: string | null;
  notify_level_up: boolean;
  notify_micro_feedback: boolean;
  notify_tutor_suggestions: boolean;
  tracking_enabled: boolean;
}

export type ProfilePreferencesPatch = Partial<ProfilePreferences>;

export interface AccountStats {
  chats_count: number;
  messages_count: number;
  projects_count: number;
  templates_count: number;
  events_count: number;
  decisions_count: number;
}

type PersistedProfilePreferencesCache = {
  data: ProfilePreferences;
  fetchedAt: number;
};

type PersistedAccountStatsCache = {
  data: AccountStats;
  fetchedAt: number;
};

let cachedPreferences: ProfilePreferences | null = null;
let preferencesLastFetchedAt = 0;
let preferencesScopeKey = PROFILE_PREFERENCES_STORAGE_KEY;
let preferencesInflight: Promise<ProfilePreferences> | null = null;
let preferencesInflightScopeKey: string | null = null;

let cachedAccountStats: AccountStats | null = null;
let accountStatsLastFetchedAt = 0;
let accountStatsScopeKey = ACCOUNT_STATS_STORAGE_KEY;
let accountStatsInflight: Promise<AccountStats> | null = null;
let accountStatsInflightScopeKey: string | null = null;

function getScopedCacheKey(baseKey: string, userEmail?: string | null): string {
  return makeScopedStorageKey(baseKey, userEmail);
}

function readPersistedProfilePreferencesCache(
  userEmail?: string | null,
): PersistedProfilePreferencesCache | null {
  const persisted = readPersistedState<PersistedProfilePreferencesCache>(
    getScopedCacheKey(PROFILE_PREFERENCES_STORAGE_KEY, userEmail),
  );
  if (!persisted || typeof persisted.fetchedAt !== "number" || !persisted.data) {
    return null;
  }
  return persisted;
}

function writePersistedProfilePreferencesCache(
  data: ProfilePreferences,
  userEmail?: string | null,
): void {
  writePersistedState(getScopedCacheKey(PROFILE_PREFERENCES_STORAGE_KEY, userEmail), {
    data,
    fetchedAt: Date.now(),
  });
}

function readPersistedAccountStatsCache(userEmail?: string | null): PersistedAccountStatsCache | null {
  const persisted = readPersistedState<PersistedAccountStatsCache>(
    getScopedCacheKey(ACCOUNT_STATS_STORAGE_KEY, userEmail),
  );
  if (!persisted || typeof persisted.fetchedAt !== "number" || !persisted.data) {
    return null;
  }
  return persisted;
}

function writePersistedAccountStatsCache(data: AccountStats, userEmail?: string | null): void {
  writePersistedState(getScopedCacheKey(ACCOUNT_STATS_STORAGE_KEY, userEmail), {
    data,
    fetchedAt: Date.now(),
  });
}

export function hydrateCachedProfilePreferences(userEmail?: string | null): ProfilePreferences | null {
  const scopeKey = getScopedCacheKey(PROFILE_PREFERENCES_STORAGE_KEY, userEmail);
  if (preferencesScopeKey === scopeKey && cachedPreferences) {
    return cachedPreferences;
  }

  const persistedPreferences = readPersistedProfilePreferencesCache(userEmail);
  preferencesScopeKey = scopeKey;
  cachedPreferences = persistedPreferences?.data ?? null;
  preferencesLastFetchedAt = persistedPreferences?.fetchedAt ?? 0;

  return cachedPreferences;
}

export function readCachedProfilePreferences(userEmail?: string | null): ProfilePreferences | null {
  const scopeKey = getScopedCacheKey(PROFILE_PREFERENCES_STORAGE_KEY, userEmail);
  if (preferencesScopeKey !== scopeKey) {
    return null;
  }
  return cachedPreferences;
}

export function hydrateCachedAccountStats(userEmail?: string | null): AccountStats | null {
  const scopeKey = getScopedCacheKey(ACCOUNT_STATS_STORAGE_KEY, userEmail);
  if (accountStatsScopeKey === scopeKey && cachedAccountStats) {
    return cachedAccountStats;
  }

  const persistedStats = readPersistedAccountStatsCache(userEmail);
  accountStatsScopeKey = scopeKey;
  cachedAccountStats = persistedStats?.data ?? null;
  accountStatsLastFetchedAt = persistedStats?.fetchedAt ?? 0;

  return cachedAccountStats;
}

export function readCachedAccountStats(userEmail?: string | null): AccountStats | null {
  const scopeKey = getScopedCacheKey(ACCOUNT_STATS_STORAGE_KEY, userEmail);
  if (accountStatsScopeKey !== scopeKey) {
    return null;
  }
  return cachedAccountStats;
}

export async function fetchAccountStats(userEmail?: string | null): Promise<AccountStats> {
  hydrateCachedAccountStats(userEmail);
  const scopeKey = getScopedCacheKey(ACCOUNT_STATS_STORAGE_KEY, userEmail);
  const hasFreshCache =
    accountStatsScopeKey === scopeKey &&
    cachedAccountStats !== null &&
    Date.now() - accountStatsLastFetchedAt < PROFILE_PREFERENCES_CACHE_TTL_MS;
  if (hasFreshCache) {
    return cachedAccountStats!;
  }
  if (accountStatsInflight && accountStatsInflightScopeKey === scopeKey) {
    return accountStatsInflight;
  }

  accountStatsInflightScopeKey = scopeKey;
  accountStatsInflight = (async () => {
    const res = await fetch("/api/profile/stats", { cache: "no-store" });
    if (!res.ok) {
      throw new Error(await readResponseError(res, "Failed to load account stats"));
    }
    const data: AccountStats = await res.json();
    cachedAccountStats = data;
    accountStatsLastFetchedAt = Date.now();
    accountStatsScopeKey = scopeKey;
    writePersistedAccountStatsCache(data, userEmail);
    return data;
  })();

  try {
    return await accountStatsInflight;
  } finally {
    accountStatsInflight = null;
    accountStatsInflightScopeKey = null;
  }
}

export async function deleteAllChats(): Promise<{ ok: boolean; deleted: number }> {
  const res = await fetch("/api/profile/chats", { method: "DELETE" });
  if (!res.ok) {
    throw new Error(await readResponseError(res, "Failed to delete chats"));
  }
  return res.json();
}

export async function deleteAccount(): Promise<{ ok: boolean; deleted: Record<string, number> }> {
  const res = await fetch("/api/profile/account", { method: "DELETE" });
  if (!res.ok) {
    throw new Error(await readResponseError(res, "Failed to delete account"));
  }
  return res.json();
}

export async function fetchProfilePreferences(userEmail?: string | null): Promise<ProfilePreferences> {
  hydrateCachedProfilePreferences(userEmail);
  const scopeKey = getScopedCacheKey(PROFILE_PREFERENCES_STORAGE_KEY, userEmail);
  const hasFreshCache =
    preferencesScopeKey === scopeKey &&
    cachedPreferences !== null &&
    Date.now() - preferencesLastFetchedAt < PROFILE_PREFERENCES_CACHE_TTL_MS;
  if (hasFreshCache) {
    return cachedPreferences!;
  }
  if (preferencesInflight && preferencesInflightScopeKey === scopeKey) {
    return preferencesInflight;
  }

  preferencesInflightScopeKey = scopeKey;
  preferencesInflight = (async () => {
    const res = await fetch("/api/profile/preferences", { cache: "no-store" });
    if (!res.ok) {
      throw new Error(await readResponseError(res, "Failed to load preferences"));
    }
    const data: ProfilePreferences = await res.json();
    cachedPreferences = data;
    preferencesLastFetchedAt = Date.now();
    preferencesScopeKey = scopeKey;
    writePersistedProfilePreferencesCache(data, userEmail);
    return data;
  })();

  try {
    return await preferencesInflight;
  } finally {
    preferencesInflight = null;
    preferencesInflightScopeKey = null;
  }
}

export async function patchProfilePreferences(
  body: ProfilePreferencesPatch,
  userEmail?: string | null,
): Promise<ProfilePreferences> {
  const res = await fetch("/api/profile/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(await readResponseError(res, "Failed to save preferences"));
  }
  const data: ProfilePreferences = await res.json();
  cachedPreferences = data;
  preferencesLastFetchedAt = Date.now();
  preferencesScopeKey = getScopedCacheKey(PROFILE_PREFERENCES_STORAGE_KEY, userEmail);
  writePersistedProfilePreferencesCache(data, userEmail);
  return data;
}
