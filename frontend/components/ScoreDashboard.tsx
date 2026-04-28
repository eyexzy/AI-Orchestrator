"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import {
  Lightbulb, Zap, Download, PieChart,
  ArrowUpRight, ArrowDownRight, Minus,
  Brain, Cpu, Shield, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/note";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { DASHBOARD_STORAGE_KEY, PROFILE_PREFERENCES_CACHE_TTL_MS } from "@/lib/config";
import { makeScopedStorageKey, readPersistedState, writePersistedState } from "@/lib/persistedState";

function DashboardSkeleton() {
  return (
    <div className="space-y-5 px-5 py-4">
      <div className="flex items-center gap-3">
        <Skeleton width={40} height={40} className="rounded-xl" />
        <Skeleton width={156} height={24} />
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-alpha-200 bg-gray-alpha-100 p-3"
          >
            <Skeleton height={56} width="100%" className="rounded-lg" />
          </div>
        ))}
      </div>

      <Separator />

      <div className="space-y-2">
        <Skeleton height={18} width={112} />
        <Skeleton height={10} width="100%" shape="pill" />
      </div>

      <Skeleton height={72} width="100%" className="rounded-xl" />
      <Skeleton height={136} width="100%" className="rounded-xl" />
      <Skeleton height={120} width="100%" className="rounded-xl" />
    </div>
  );
}

/* Types */

interface DashboardDecision {
  rule_score: number | null;
  rule_level: number | null;
  ml_score: number | null;
  ml_level: number | null;
  final_level: number;
  confidence: number | null;
  transition_reason: Record<string, unknown>;
  created_at: string | null;
}

interface DashboardData {
  current_level: number;
  suggested_level: number | null;
  self_assessed_level: number | null;
  initial_level: number;
  rule_score: number | null;
  ml_score: number | null;
  confidence: number | null;
  profile_features: Record<string, unknown>;
  level_history: number[];
  recent_decisions: DashboardDecision[];
  updated_at: string | null;
}

type PersistedDashboardCache = {
  data: DashboardData;
  fetchedAt: number;
};

const dashboardCache = new Map<string, PersistedDashboardCache>();
const dashboardInflight = new Map<string, Promise<DashboardData | null>>();

function getDashboardCacheKey(userEmail?: string | null): string {
  return makeScopedStorageKey(DASHBOARD_STORAGE_KEY, userEmail);
}

function readPersistedDashboardCache(userEmail?: string | null): PersistedDashboardCache | null {
  const persisted = readPersistedState<PersistedDashboardCache>(getDashboardCacheKey(userEmail));
  if (!persisted || typeof persisted.fetchedAt !== "number" || !persisted.data) {
    return null;
  }
  return persisted;
}

function hydrateDashboardCache(userEmail?: string | null): PersistedDashboardCache | null {
  const cacheKey = getDashboardCacheKey(userEmail);
  const cached = dashboardCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const persisted = readPersistedDashboardCache(userEmail);
  if (persisted) {
    dashboardCache.set(cacheKey, persisted);
  }
  return persisted;
}

function writeDashboardCache(data: DashboardData, userEmail?: string | null): PersistedDashboardCache {
  const entry = {
    data,
    fetchedAt: Date.now(),
  };
  const cacheKey = getDashboardCacheKey(userEmail);
  dashboardCache.set(cacheKey, entry);
  writePersistedState(cacheKey, entry);
  return entry;
}

/* Palette */

const LEVEL_COLORS: Record<number, { text: string; bg: string }> = {
  1: { text: "var(--ds-green-700)", bg: "var(--ds-green-100)" },
  2: { text: "var(--ds-blue-700)", bg: "var(--ds-blue-100)" },
  3: { text: "var(--ds-amber-700)", bg: "var(--ds-amber-100)" },
};

const LEVEL_NAMES: Record<number, string> = {
  1: "Novice",
  2: "Intermediate",
  3: "Expert",
};

/* Small helpers */

function Bar({ value, max = 100, color }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="relative h-1 w-full overflow-hidden rounded-full bg-gray-alpha-200">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color ?? "var(--ds-gray-900)" }}
      />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl p-3 bg-gray-alpha-100 border border-gray-alpha-200">
      <p className="text-xs text-ds-text-tertiary">{label}</p>
      <p className="mt-0.5 font-mono text-[15px] font-medium text-ds-text">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-ds-text-tertiary">{sub}</p>}
    </div>
  );
}

function progressToNext(
  normalized: number,
  level: 1 | 2 | 3,
  thresholds: { L2: number; L3: number },
) {
  if (level === 3) return { percent: 100, label: "Max level reached" };
  if (level === 1) {
    const pct = Math.min(100, (normalized / thresholds.L2) * 100);
    return { percent: pct, label: `${Math.round(pct)}% to L2` };
  }
  const range = thresholds.L3 - thresholds.L2;
  const progress = normalized - thresholds.L2;
  const pct = Math.min(100, Math.max(0, (progress / range) * 100));
  return { percent: pct, label: `${Math.round(pct)}% to L3` };
}

/* Tip system */

interface BreakdownItem {
  category: string;
  points: number;
  max_points: number;
  detail: string;
}

function getTip(
  breakdown: BreakdownItem[],
  reasoning: string[],
  level: 1 | 2 | 3,
  score: number,
): string {
  const hasPolitePenalty = reasoning.some(
    (r) => r.includes("Polite") || r.includes("-0.5"),
  );
  if (hasPolitePenalty) {
    return (
      "AI doesn't need politeness. Instead of \"Could you please...\", " +
      "use direct commands: \"Write\", \"Analyze\"."
    );
  }

  const structureItem = breakdown.find(
    (b) => b.category.endsWith("Structure & Context"),
  );
  if (structureItem && structureItem.points === 0) {
    return (
      "Add structure: specify a role (e.g. \"Act as an expert\") " +
      "or desired format (\"as a table\", \"as a list\")."
    );
  }

  const techItem = breakdown.find((b) => b.category.endsWith("Technical Terms"));
  if (techItem && techItem.points === 0 && level >= 2) {
    return (
      "Use system variables (e.g. {{var}}) " +
      "to make your prompts more precise and flexible."
    );
  }

  if (level === 3 && score > 12) {
    return (
      "Excellent prompts! Try Compare mode " +
      "to test them across different models simultaneously."
    );
  }

  return "Experiment with prompt length — add more context and details for better results.";
}

function TipCard({
  breakdown,
  reasoning,
  level,
  score,
}: {
  breakdown: BreakdownItem[];
  reasoning: string[];
  level: 1 | 2 | 3;
  score: number;
}) {
  const tip = getTip(breakdown, reasoning, level, score);
  const isExpert = level === 3 && score > 12;

  return (
    <div className="flex items-start gap-3 rounded-xl px-4 py-3 text-sm leading-relaxed bg-gray-alpha-100 border border-gray-alpha-200 text-ds-text-secondary">
      <div className={`mt-0.5 shrink-0 ${isExpert ? "text-amber-700" : "text-ds-text-tertiary"}`}>
        {isExpert ? <Zap size={14} strokeWidth={2} /> : <Lightbulb size={14} strokeWidth={2} />}
      </div>
      <span>{tip}</span>
    </div>
  );
}

/* Key factors extraction */
function extractKeyFactors(features: Record<string, unknown>): { label: string; value: string; icon: typeof Brain }[] {
  const factors: { label: string; value: string; icon: typeof Brain }[] = [];

  const avgLen = features.avg_prompt_length_rolling;
  if (typeof avgLen === "number" && avgLen > 0) {
    factors.push({ label: "Avg prompt length", value: `${Math.round(avgLen)} chars`, icon: TrendingUp });
  }

  const structured = features.structured_prompt_ratio_rolling;
  if (typeof structured === "number") {
    factors.push({ label: "Structured ratio", value: `${Math.round(structured * 100)}%`, icon: Shield });
  }

  const advanced = features.advanced_actions_per_session;
  if (typeof advanced === "number") {
    factors.push({ label: "Advanced actions/session", value: String(advanced), icon: Cpu });
  }

  const helpRatio = features.help_ratio;
  if (typeof helpRatio === "number") {
    factors.push({ label: "Help dependency", value: `${Math.round(helpRatio * 100)}%`, icon: Brain });
  }

  const cancelRate = features.cancel_rate;
  if (typeof cancelRate === "number") {
    factors.push({ label: "Cancel rate", value: `${Math.round(cancelRate * 100)}%`, icon: Brain });
  }

  const sessions = features.sessions_count;
  if (typeof sessions === "number") {
    factors.push({ label: "Sessions tracked", value: String(sessions), icon: TrendingUp });
  }

  return factors;
}

/* Transition icon */
function TransitionIcon({ action }: { action: string }) {
  if (action === "promotion") return <ArrowUpRight size={12} className="text-green-700" />;
  if (action === "demotion") return <ArrowDownRight size={12} className="text-red-700" />;
  return <Minus size={12} className="text-ds-text-tertiary" />;
}

/* Main dashboard */
export function ScoreDashboard() {
  const {
    level,
    userEmail,
    confidence: localConfidence,
    reasoning,
    score,
    normalizedScore,
    breakdown,
    thresholds,
    metrics,
    hasAnalyzed,
    isAnalyzing,
  } = useUserLevelStore();

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useLayoutEffect(() => {
    const cached = hydrateDashboardCache(userEmail);
    if (!cached || cached.data.current_level !== level) {
      return;
    }

    setDashboard(cached.data);
    setLoading(false);
  }, [level, userEmail]);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = getDashboardCacheKey(userEmail);
    const cached = hydrateDashboardCache(userEmail);
    const hasMatchingCache = cached !== null && cached.data.current_level === level;
    const hasFreshCache =
      hasMatchingCache &&
      Date.now() - cached.fetchedAt < PROFILE_PREFERENCES_CACHE_TTL_MS;

    if (hasMatchingCache) {
      setDashboard(cached.data);
      setLoading(false);
    } else {
      setLoading(true);
    }

    if (hasFreshCache) {
      return () => {
        cancelled = true;
      };
    }

    let inflight = dashboardInflight.get(cacheKey);
    if (!inflight) {
      inflight = fetch("/api/profile/dashboard")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) {
            writeDashboardCache(data, userEmail);
          }
          return data;
        })
        .catch(() => null)
        .finally(() => {
          dashboardInflight.delete(cacheKey);
        });
      dashboardInflight.set(cacheKey, inflight);
    }

    inflight
      .then((data) => {
        if (!cancelled && data) setDashboard(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [level, userEmail]); // re-fetch when level changes

  const accent = LEVEL_COLORS[level] ?? LEVEL_COLORS[1];
  const progress = progressToNext(normalizedScore, level, thresholds);
  const accentText = accent.text;
  const accentBg = accent.bg;

  // Use persisted data when available, local state as fallback
  const ruleScore = dashboard?.rule_score ?? (hasAnalyzed ? score : null);
  const mlScore = dashboard?.ml_score ?? null;
  const confidence = dashboard?.confidence ?? (hasAnalyzed ? localConfidence : null);
  const suggestedLevel = dashboard?.suggested_level ?? null;
  const profileFeatures = dashboard?.profile_features ?? {};
  const recentDecisions = dashboard?.recent_decisions ?? [];
  const keyFactors = extractKeyFactors(profileFeatures);

  if (loading && !dashboard) {
    return <DashboardSkeleton />;
  }

  if (!hasAnalyzed && !dashboard) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-3 opacity-20">
          <PieChart size={32} strokeWidth={2} />
        </div>
        <p className="text-[15px] text-ds-text-secondary">Waiting for input</p>
        <p className="mt-1 text-xs text-ds-text-tertiary">
          Send a message to see the analysis
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 px-5 py-4">
      {/* Level card */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl font-mono text-sm font-bold"
            style={{ backgroundColor: accentBg, color: accentText }}
          >
            {level}
          </div>
          <div>
            <p className="text-[15px] font-semibold text-ds-text">
              {LEVEL_NAMES[level] ?? `Level ${level}`}
            </p>
            <p className="text-xs text-ds-text-tertiary">
              {confidence !== null ? `${Math.round(confidence * 100)}% confidence` : "No data yet"}
            </p>
          </div>
        </div>
        {isAnalyzing && (
          <div className="flex items-center gap-1.5">
            {[0, 100, 200].map((d) => (
              <span
                key={d}
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: accentText,
                  animation: `pulse-dot 1.2s ${d}ms infinite`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="divider" />

      {/* Scores overview */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          label="Rule score"
          value={ruleScore !== null ? ruleScore.toFixed(1) : "—"}
          sub="out of 15.0"
        />
        <StatCard
          label="ML contribution"
          value={mlScore !== null ? mlScore.toFixed(2) : "—"}
          sub={mlScore !== null ? "blended score" : "not active"}
        />
        <StatCard
          label="Suggested"
          value={suggestedLevel !== null ? `L${suggestedLevel}` : "—"}
          sub={suggestedLevel !== null && suggestedLevel !== level ? "differs from current" : undefined}
        />
        <StatCard
          label="Confidence"
          value={confidence !== null ? `${Math.round(confidence * 100)}%` : "—"}
          sub={confidence !== null && confidence < 0.4 ? "low — needs data" : undefined}
        />
      </div>

      {/* Progress to next level */}
      {hasAnalyzed && (
        <>
          <div className="divider" />
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-ds-text-tertiary">Progress</span>
              <span className="font-mono text-ds-text-secondary">
                {score.toFixed(1)}/15.0
              </span>
            </div>
            <Bar value={progress.percent} color={accentText} />
            <p className="text-xs text-ds-text-tertiary">{progress.label}</p>
          </div>
        </>
      )}

      {/* Mentor tip */}
      {hasAnalyzed && breakdown.length > 0 && (
        <>
          <TipCard breakdown={breakdown} reasoning={reasoning} level={level} score={score} />
        </>
      )}

      {/* Breakdown (real-time from last analysis) */}
      {hasAnalyzed && breakdown.length > 0 && (
        <>
          <div className="divider" />
          <div className="space-y-3">
            <p className="config-label">Breakdown</p>
            {breakdown.map((item) => (
              <div key={item.category} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ds-text-secondary">{item.category}</span>
                  <span className="font-mono text-ds-text-tertiary">
                    {item.points < 0 ? "" : "+"}{item.points.toFixed(1)}/{item.max_points.toFixed(1)}
                  </span>
                </div>
                <Bar
                  value={item.max_points > 0 ? (item.points / item.max_points) * 100 : 0}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Key factors (from persisted user profile) */}
      {keyFactors.length > 0 && (
        <>
          <div className="divider" />
          <div className="space-y-2.5">
            <p className="config-label">Key factors</p>
            <div className="grid grid-cols-2 gap-2">
              {keyFactors.map((f) => (
                <div key={f.label} className="flex items-center gap-2 rounded-lg px-3 py-2 bg-gray-alpha-100 border border-gray-alpha-200">
                  <f.icon size={13} className="shrink-0 text-ds-text-tertiary" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-ds-text-tertiary truncate">{f.label}</p>
                    <p className="font-mono text-[12px] font-medium text-ds-text">{f.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Reasoning */}
      {reasoning.length > 0 && (
        <>
          <div className="divider" />
          <div className="space-y-2">
            <p className="config-label">Analysis</p>
            <ul className="space-y-1">
              {reasoning.map((r, i) => (
                <li key={i} className="text-sm leading-relaxed text-ds-text-secondary">
                  <span className="text-ds-text-tertiary">·</span> {r}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* Transition history */}
      {recentDecisions.length > 0 && (
        <>
          <div className="divider" />
          <div className="space-y-2.5">
            <p className="config-label">Recent transitions</p>
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {recentDecisions.slice(0, 10).map((d, i) => {
                const action = String(d.transition_reason?.action ?? "no_change");
                const ts = d.created_at
                  ? new Date(d.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                  : "";
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-xs bg-gray-alpha-100 border border-gray-alpha-200"
                  >
                    <div className="flex items-center gap-2">
                      <TransitionIcon action={action} />
                      <span className="font-mono text-ds-text">L{d.final_level}</span>
                      <span className="text-ds-text-tertiary">{action.replace("_", " ")}</span>
                    </div>
                    <div className="flex items-center gap-3 text-ds-text-tertiary">
                      {d.rule_score !== null && (
                        <span className="font-mono">R:{d.rule_score.toFixed(1)}</span>
                      )}
                      {d.confidence !== null && (
                        <span className="font-mono">{Math.round(d.confidence * 100)}%</span>
                      )}
                      <span>{ts}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Session metrics */}
      <div className="divider" />
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Messages", value: metrics.sessionMessageCount },
          { label: "Speed", value: `${metrics.charsPerSecond.toFixed(1)} c/s` },
          { label: "Avg. length", value: Math.round(metrics.avgPromptLength) },
          { label: "Session score", value: hasAnalyzed ? score.toFixed(1) : "—" },
        ].map((m) => (
          <StatCard key={m.label} label={m.label} value={m.value} />
        ))}
      </div>

      <div className="divider" />
      <ExportButton />
    </div>
  );
}

/* Export Button */
function ExportButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/export");

      if (res.status === 401) {
        setError("Authentication required. Please sign in.");
        return;
      }
      if (res.status === 503) {
        setError("ADMIN_API_KEY is not configured. Add it to .env.local and restart.");
        return;
      }
      if (res.status === 502) {
        setError("Backend unavailable. Check that FastAPI is running.");
        return;
      }
      if (!res.ok) {
        setError(`Error: HTTP ${res.status}`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "interaction_logs.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed", e);
      setError("Connection error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Button
        variant="secondary"
        size="sm"
        className="w-full"
        onClick={handleExport}
        disabled={loading}
        isLoading={loading}
        leftIcon={!loading ? <Download size={14} strokeWidth={2} /> : undefined}
      >
        {loading ? "Exporting..." : "Export CSV"}
      </Button>
      {error && (
        <Note variant="error" className="py-2">
          {error}
        </Note>
      )}
    </div>
  );
}
