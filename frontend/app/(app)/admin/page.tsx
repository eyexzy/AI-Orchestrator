"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Database, BrainCircuit, RotateCcw, Server, Users,
  RefreshCw, ShieldOff, CircleAlert, CircleCheck, CircleDashed, CircleX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Choicebox } from "@/components/ui/choicebox";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Note } from "@/components/ui/note";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { actionToast } from "@/components/ui/action-toast";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/store/i18nStore";

const ADMIN_EMAIL = "eyexzy@gmail.com";

// в”Ђв”Ђв”Ђ Types в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

type AdminTab = "dataset" | "model" | "retrain" | "users" | "system";

type DatasetStats = {
  gold: number; silver: number; bronze: number; synthetic: number;
  real_total: number; will_use_synthetic: boolean;
  gold_distribution: Record<string, number>;
  issues: string[]; recommendation: "ready" | "collect_more";
  min_gold_recommended: number; min_real_recommended: number;
  target_test_users?: number;
  target_gold_samples?: number;
  target_silver_samples?: number;
  target_bronze_samples?: number;
  target_real_samples?: number;
};

type MlStats = {
  total: number; ml_accuracy: number;
  level_distribution: Record<string, number>;
  confusion_matrix: number[][];
  model_info: { model_type: string; accuracy: number; f1_score: number; samples_used: number; updated_at: string | null } | null;
};

type ПеренавчитиResult = {
  ok: boolean; message: string; samples_used: number;
  test_accuracy: number; f1_macro: number;
  cv_f1_mean: number; cv_f1_std: number;
  model_type: string; confusion_matrix: number[][];
};

type UserStats = {
  total_users: number; active_today: number; active_last_hour: number;
  level_distribution: Record<string, number>;
};

type UserItem = {
  email: string; current_level: number; confidence: number;
  interaction_count: number; sessions_count: number;
  last_active: string | null; help_ratio: number; avg_prompt_length: number;
};

type AdaptationIssue = {
  email: string;
  severity: "warning" | "info" | "error";
  code: string;
  title: string;
  detail: string;
  last_active: string | null;
};

type SystemHealth = {
  status: string; db: string;
  providers: Record<string, boolean>;
};

type ModelType = "LogisticRegression" | "RandomForest" | "SVC";

type HourlyActivity = { hours: { label: string; count: number }[]; total: number };

// в”Ђв”Ђв”Ђ Design primitives в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

const DATASET_TIER_KEYS = ["gold", "silver", "bronze", "synthetic"] as const;

const MODEL_OPTIONS: { value: ModelType; label: string; descKey: string }[] = [
  { value: "LogisticRegression", label: "Logistic Regression", descKey: "admin.retrain.modelDesc.lr" },
  { value: "RandomForest",       label: "Random Forest",       descKey: "admin.retrain.modelDesc.rf" },
  { value: "SVC",                label: "SVC",                 descKey: "admin.retrain.modelDesc.svc" },
];

function metricColorClass(tone: "neutral" | "info" | "success" | "warning" | "danger") {
  return {
    neutral: "text-ds-text",
    info: "text-blue-800",
    success: "text-green-800",
    warning: "text-amber-800",
    danger: "text-red-800",
  }[tone];
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-gray-alpha-200 bg-background-100", className)}>
      {children}
    </div>
  );
}

function Row({ title, description, control, children }: {
  title: string; description?: string;
  control?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium leading-5 text-ds-text">{title}</p>
          {description && <p className="mt-1 text-[13px] leading-5 text-ds-text-tertiary">{description}</p>}
        </div>
        {control && <div className="shrink-0 self-center">{control}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-gray-alpha-200" />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 px-1 text-[13px] font-semibold text-ds-text-tertiary">{children}</p>;
}

function ProgressRow({
  title,
  value,
  max,
  variant = "default",
}: {
  title: string;
  value: number;
  max: number;
  variant?: "default" | "error" | "warning" | "gray";
}) {
  const safeMax = Math.max(max, 1);
  const pct = Math.round(Math.min(value / safeMax, 1) * 100);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[15px] font-medium text-ds-text">{title}</p>
          <p className="mt-0.5 text-[14px] text-ds-text-tertiary">
            {value} / {max}
          </p>
        </div>
        <span className={cn(
          "text-[14px] font-medium tabular-nums",
          "text-ds-text-secondary",
        )}>
          {pct}%
        </span>
      </div>
      <Progress value={value} max={safeMax} variant={variant} />
    </div>
  );
}

// Vercel-style stat card: big number + small label
function StatCard({ value, label, sub }: {
  value: number | string;
  label: string;
  sub?: string;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
}) {
  return (
    <div className="rounded-lg border border-gray-alpha-200 bg-background-100 px-5 py-4">
      <p className="text-[13px] font-medium text-ds-text">{label}</p>
      <p className="mt-1.5 text-[30px] font-semibold tabular-nums leading-none text-ds-text">{value}</p>
      {sub && <p className="mt-1 text-[12px] text-ds-text-secondary">{sub}</p>}
    </div>
  );
}

// Single consistent badge for ALL status items
type BadgeVariant = "ok" | "warning" | "error" | "neutral";
function StatusBadge({ variant, label }: { variant: BadgeVariant; label: string }) {
  const badge: Record<BadgeVariant, NonNullable<BadgeProps["variant"]>> = {
    ok: "green-subtle",
    warning: "amber-subtle",
    error: "red-subtle",
    neutral: "gray-subtle",
  };
  const Icon: Record<BadgeVariant, typeof CircleCheck> = {
    ok: CircleCheck,
    warning: CircleAlert,
    error: CircleX,
    neutral: CircleDashed,
  };
  const BadgeIcon = Icon[variant];
  return (
    <Badge variant={badge[variant]} size="lg" className="gap-1.5 text-[15px]">
      <BadgeIcon size={16} strokeWidth={2} />
      {label}
    </Badge>
  );
}

function translateWithFallback(t: (key: string) => string, key: string, fallback: string) {
  const translated = t(key);
  return translated === key ? fallback : translated;
}

function translateAdminStatus(t: (key: string) => string, group: "appStatus" | "db" | "providerStatus", status?: string | null) {
  if (!status) return t("admin.system.unknown");
  return translateWithFallback(t, `admin.system.${group}.${status}`, status);
}

function translateAdaptationIssue(t: (key: string) => string, issue: AdaptationIssue) {
  const baseKey = `admin.users.issue.${issue.code}`;
  return {
    title: translateWithFallback(t, `${baseKey}.title`, issue.title),
    detail: translateWithFallback(t, `${baseKey}.detail`, issue.detail),
  };
}

function AccuracyBig({ value, label, tone = "info" }: {
  value: number;
  label: string;
  tone?: "info" | "success" | "warning" | "danger";
}) {
  const pct = Math.round(value * 100);
  const valueTone = pct >= 80 ? tone : pct >= 65 ? "warning" : "danger";
  return (
    <div className="flex flex-col gap-0.5">
      <span className={cn("text-[30px] font-semibold tabular-nums leading-none", metricColorClass(valueTone))}>{pct}%</span>
      <span className="text-[12px] text-ds-text-tertiary">{label}</span>
    </div>
  );
}

function ConfusionMatrix({ matrix }: { matrix: number[][] }) {
  const { t } = useTranslation();
  if (!matrix?.length) return null;
  const labels = ["L1", "L2", "L3"];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <div className="w-7" />
        {labels.map(l => (
          <div key={l} className="flex h-7 w-14 items-center justify-center text-[12px] font-medium text-ds-text-tertiary">{l}</div>
        ))}
        <span className="ml-2 text-[11px] text-ds-text-tertiary">{t("admin.model.cmPredicted")}</span>
      </div>
      {matrix.map((row, ri) => (
        <div key={ri} className="flex items-center gap-1">
          <div className="flex h-7 w-7 items-center justify-center text-[12px] font-medium text-ds-text-tertiary">{labels[ri]}</div>
          {row.map((val, ci) => (
            <div
              key={ci}
              className={cn(
                "flex h-7 w-14 items-center justify-center rounded-md text-[13px] font-semibold tabular-nums",
                ri === ci
                  ? val > 0
                    ? "border border-[color:var(--ds-green-400)] bg-[color:var(--ds-green-100)] text-[color:var(--ds-green-900)]"
                    : "bg-gray-alpha-100 text-ds-text-tertiary"
                  : val > 0
                    ? "border border-[color:var(--ds-red-400)] bg-[color:var(--ds-red-100)] text-[color:var(--ds-red-900)]"
                    : "bg-gray-alpha-100 text-ds-text-tertiary",
              )}
            >
              {val}
            </div>
          ))}
        </div>
      ))}
      <p className="pt-0.5 text-[11px] text-ds-text-tertiary">{t("admin.model.cmHint")}</p>
    </div>
  );
}

function MiniBarChart({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex items-end gap-px" style={{ height: 40 }}>
      {data.map((d, i) => (
        <div key={i} className="relative flex-1 flex flex-col justify-end" title={`${d.label}: ${d.count}`}>
          <div
            className={cn(
              "w-full rounded-[2px] transition-colors",
              d.count > 0 ? "bg-blue-800 hover:opacity-85" : "bg-gray-alpha-200",
            )}
            style={{ height: `${Math.max((d.count / max) * 100, d.count > 0 ? 15 : 5)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function UserTable({ users, loading }: { users: UserItem[]; loading: boolean }) {
  const { t } = useTranslation();

  function timeAgo(iso: string | null) {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return t("admin.users.timeJustNow");
    if (m < 60) return t("admin.users.timeMinutes").replace("{m}", String(m));
    const h = Math.floor(m / 60);
    if (h < 24) return t("admin.users.timeHours").replace("{h}", String(h));
    return t("admin.users.timeDays").replace("{d}", String(Math.floor(h / 24)));
  }

  const columns: DataTableColumn<UserItem>[] = [
    {
      key: "user",
      header: t("admin.users.col.user"),
      cell: (u) => <span className="font-medium text-ds-text">{u.email}</span>,
      width: "32%",
    },
    {
      key: "level",
      header: t("admin.users.col.level"),
      cell: (u) => <span>{t(`admin.level.${u.current_level}`)}</span>,
    },
    {
      key: "last_active",
      header: t("admin.users.col.lastActive"),
      cell: (u) => <span className="text-ds-text-secondary">{timeAgo(u.last_active)}</span>,
    },
    {
      key: "interactions",
      header: t("admin.users.col.interactions"),
      align: "right",
      cell: (u) => <span className="tabular-nums">{u.interaction_count}</span>,
    },
    {
      key: "sessions",
      header: t("admin.users.col.sessions"),
      align: "right",
      cell: (u) => <span className="tabular-nums">{u.sessions_count}</span>,
    },
    {
      key: "help_ratio",
      header: t("admin.users.col.helpRatio"),
      align: "right",
      cell: (u) => (
        <span className={cn("tabular-nums", u.help_ratio > 0.5 ? "text-amber-800" : "text-ds-text-secondary")}>
          {(u.help_ratio * 100).toFixed(0)}%
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={users}
      keyExtractor={(u) => u.email}
      isLoading={loading}
      skeletonRows={4}
      emptyMessage={t("admin.users.empty")}
      pageSize={10}
      pageSizeOptions={[10, 25, 50]}
    />
  );
}

// в”Ђв”Ђв”Ђ Tab definitions в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

const TABS: { key: AdminTab; tKey: string; icon: typeof Database }[] = [
  { key: "dataset", tKey: "admin.tab.dataset",  icon: Database },
  { key: "model",   tKey: "admin.tab.model",    icon: BrainCircuit },
  { key: "retrain", tKey: "admin.tab.retrain",  icon: RotateCcw },
  { key: "users",   tKey: "admin.tab.users",    icon: Users },
  { key: "system",  tKey: "admin.tab.system",   icon: Server },
];

// в”Ђв”Ђв”Ђ Page в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export default function AdminPage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();

  // в”Ђв”Ђ Auth guard в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  if (status === "loading") {
    return (
      <main className="flex-1 flex items-center justify-center">
        <Skeleton width={200} height={32} />
      </main>
    );
  }
  if (session?.user?.email !== ADMIN_EMAIL) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <ShieldOff size={32} strokeWidth={1.5} className="text-ds-text-tertiary" />
          <p className="text-[18px] font-semibold text-ds-text">{t("admin.accessDenied")}</p>
          <p className="text-[14px] text-ds-text-tertiary">{t("admin.accessDeniedDescription")}</p>
        </div>
      </main>
    );
  }

  return <AdminContent />;
}

function AdminContent() {
  const { t, language } = useTranslation();
  const [tab, setTab] = useState<AdminTab>("dataset");

  // Dataset
  const [dataset, setDataset]     = useState<DatasetStats | null>(null);
  const [datasetLoading, setDL]   = useState(false);
  const [datasetError, setDE]     = useState<string | null>(null);

  // Model
  const [mlStats, setMlStats]     = useState<MlStats | null>(null);
  const [mlLoading, setML]        = useState(false);
  const [mlError, setME]          = useState<string | null>(null);

  // Перенавчити
  const [modelType, setModelType] = useState<ModelType>("LogisticRegression");
  const [retraining, setRT]       = useState(false);
  const [retrainResult, setRR]    = useState<ПеренавчитиResult | null>(null);
  const [retrainError, setRE]     = useState<string | null>(null);

  // Users
  const [userStats, setUS]        = useState<UserStats | null>(null);
  const [userList, setUL]         = useState<UserItem[]>([]);
  const [userIssues, setUserIssues] = useState<AdaptationIssue[]>([]);
  const [activity, setActivity]   = useState<HourlyActivity | null>(null);
  const [usersLoading, setULoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // System
  const [health, setHealth]       = useState<SystemHealth | null>(null);
  const [healthLoading, setHL]    = useState(false);
  const [testingProviders, setTP] = useState(false);
  const [providerResults, setPR]  = useState<Record<string, { status: string; latency_ms?: number; error?: string }> | null>(null);

  // Export
  const [exporting, setExporting] = useState(false);

  // в”Ђв”Ђ Loaders в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  const loadDataset = useCallback(async () => {
    setDL(true); setDE(null);
    try {
      const r = await fetch("/api/admin/dataset-stats");
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? t("admin.error.loadFailed"));
      setDataset(await r.json());
    } catch (e) { setDE(e instanceof Error ? e.message : t("admin.error.generic")); }
    finally { setDL(false); }
  }, [t]);

  const loadMlStats = useCallback(async () => {
    setML(true); setME(null);
    try {
      const r = await fetch("/api/admin/ml-stats");
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? t("admin.error.loadFailed"));
      setMlStats(await r.json());
    } catch (e) { setME(e instanceof Error ? e.message : t("admin.error.generic")); }
    finally { setML(false); }
  }, [t]);

  const loadUsers = useCallback(async () => {
    setULoading(true);
    try {
      const [statsR, listR, issuesR, activityR] = await Promise.all([
        fetch("/api/admin/users-stats"),
        fetch("/api/admin/users-list"),
        fetch("/api/admin/users-issues"),
        fetch("/api/admin/activity"),
      ]);
      if (statsR.ok) setUS(await statsR.json());
      if (listR.ok)  setUL((await listR.json()).users ?? []);
      if (issuesR.ok) setUserIssues((await issuesR.json()).issues ?? []);
      if (activityR.ok) setActivity(await activityR.json());
      setLastRefresh(new Date());
    } catch { /* silent */ }
    finally { setULoading(false); }
  }, []);

  const loadHealth = useCallback(async () => {
    setHL(true);
    try {
      const r = await fetch("/api/admin/health");
      if (r.ok) setHealth(await r.json());
    } catch { /* silent */ }
    finally { setHL(false); }
  }, []);

  // в”Ђв”Ђ Tab effects в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  useEffect(() => {
    if (tab === "dataset")                void loadDataset();
    if (tab === "model" || tab === "retrain") void loadMlStats();
    if (tab === "system")                 void loadHealth();
    if (tab === "users") {
      void loadUsers();
      refreshTimerRef.current = setInterval(() => void loadUsers(), 30_000);
      return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
    }
  }, [tab, loadDataset, loadMlStats, loadHealth, loadUsers]);

  // в”Ђв”Ђ Перенавчити в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  const handleRetrain = async () => {
    setRT(true); setRE(null); setRR(null);
    try {
      const r = await fetch("/api/admin/retrain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_type: modelType }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? data.detail ?? t("admin.error.retrainFailed"));
      setRR(data as ПеренавчитиResult);
      void loadMlStats();
      actionToast.success(t("admin.retrain.successToast").replace("{pct}", String(Math.round(data.test_accuracy * 100))));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("admin.error.generic");
      setRE(msg);
      actionToast.error(msg);
    } finally { setRT(false); }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const r = await fetch("/api/admin/export-csv");
      if (!r.ok) throw new Error(t("admin.error.generic"));
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "interaction_logs.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      actionToast.error(e instanceof Error ? e.message : t("admin.error.generic"));
    } finally { setExporting(false); }
  };

  const handleTestProviders = async () => {
    setTP(true); setPR(null);
    try {
      const r = await fetch("/api/admin/test-providers");
      if (!r.ok) throw new Error(t("admin.error.generic"));
      const data = await r.json() as { providers: Record<string, { status: string; latency_ms?: number; error?: string }> };
      setPR(data.providers);
    } catch (e) {
      actionToast.error(e instanceof Error ? e.message : t("admin.error.generic"));
    } finally { setTP(false); }
  };

  // в”Ђв”Ђ Render в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  return (
    <main className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
      <div className="mx-auto max-w-5xl px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
        <div className="space-y-8">

          {/* Header */}
          <div>
            <h1 className="text-[28px] font-semibold text-ds-text sm:text-[32px]">{t("admin.title")}</h1>
          </div>

          <div className="flex flex-col gap-8 lg:flex-row">

            {/* Sidebar */}
            <aside className="shrink-0 lg:w-[200px]">
              <nav className="sticky top-6 flex flex-col gap-0.5 overflow-x-auto lg:overflow-visible">
                <div className="flex gap-1 lg:flex-col">
                  {TABS.map(({ key, tKey, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTab(key)}
                      className={cn(
                        "flex h-10 w-full shrink-0 items-center gap-2 overflow-hidden rounded-lg px-3 text-left text-[15px] font-medium transition-colors",
                        tab === key
                          ? "bg-gray-alpha-200 text-ds-text"
                          : "text-ds-text hover:bg-gray-alpha-200 hover:text-ds-text",
                      )}
                    >
                      <Icon size={18} strokeWidth={2} className="shrink-0 text-current" />
                      <span className="whitespace-nowrap">{t(tKey)}</span>
                    </button>
                  ))}
                </div>
              </nav>
            </aside>

            {/* Content */}
            <div className="min-w-0 flex-1 space-y-6">

              {/* в”Ђв”Ђ DATASET в”Ђв”Ђ */}
              {tab === "dataset" && (
                <section className="animate-fade-in space-y-6">
                  {datasetError && <ErrorState description={datasetError} actionLabel={t("admin.action.retry")} onAction={() => void loadDataset()} />}

                  <div>
                    <div className="mb-3 flex items-center justify-between px-1">
                      <SectionLabel>{t("admin.dataset.section")}</SectionLabel>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="tertiary" size="sm" isLoading={exporting}
                          onClick={() => void handleExportCsv()}>CSV</Button>
                        <Button type="button" variant="default" size="sm" isLoading={datasetLoading}
                          leftIcon={<RefreshCw size={16} strokeWidth={2} />}
                          onClick={() => void loadDataset()}>{t("admin.dataset.refresh")}</Button>
                      </div>
                    </div>

                    {/* Stat row */}
                    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {DATASET_TIER_KEYS.map(tier => {
                        const vals = { gold: dataset?.gold ?? 0, silver: dataset?.silver ?? 0, bronze: dataset?.bronze ?? 0, synthetic: dataset?.synthetic ?? 0 };
                        return datasetLoading
                          ? <Skeleton key={tier} height={80} className="rounded-xl" />
                          : <StatCard
                              key={tier}
                              value={vals[tier]}
                              label={t(`admin.dataset.tier.${tier}`)}
                            />;
                      })}
                    </div>

                    <Card>
                      {(["gold", "silver", "bronze"] as const).map((tier, i) => {
                        const counts = { gold: dataset?.gold ?? 0, silver: dataset?.silver ?? 0, bronze: dataset?.bronze ?? 0 };
                        const targets = {
                          gold: dataset?.target_gold_samples ?? dataset?.min_gold_recommended ?? 200,
                          silver: dataset?.target_silver_samples ?? 1000,
                          bronze: dataset?.target_bronze_samples ?? 100,
                        };
                        const count = counts[tier]; const target = targets[tier];
                        const pct = Math.min(count / target, 1);
                        const v = pct >= 1 ? "default" : pct >= 0.5 ? "warning" : "error";
                        return (
                          <div key={tier}>
                            {i > 0 && <Divider />}
                            <div className="px-5 py-4">
                              {datasetLoading ? (
                                <div className="space-y-3">
                                  <Skeleton width={140} height={20} />
                                  <Skeleton height={10} className="rounded-[6px]" />
                                </div>
                              ) : (
                                <ProgressRow title={t(`admin.dataset.tier.${tier}`)} value={count} max={target} variant={v} />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </Card>
                    </div>

                  {!datasetLoading && dataset && (
                    <Note variant={dataset.recommendation === "ready" ? "success" : "warning"}>
                      {dataset.recommendation === "ready"
                        ? t("admin.dataset.ready")
                        : t("admin.dataset.needMore")}
                    </Note>
                  )}
                </section>
              )}

              {/* в”Ђв”Ђ MODEL в”Ђв”Ђ */}
              {tab === "model" && (
                <section className="animate-fade-in space-y-6">
                  {mlError && <ErrorState description={mlError} actionLabel={t("admin.action.retry")} onAction={() => void loadMlStats()} />}

                  {/* Metric row */}
                  <div>
                    <div className="mb-3 flex items-center justify-between px-1">
                      <SectionLabel>{t("admin.model.section")}</SectionLabel>
                      <Button type="button" variant="default" size="sm" isLoading={mlLoading}
                        leftIcon={<RefreshCw size={16} strokeWidth={2} />}
                        onClick={() => void loadMlStats()}>{t("admin.dataset.refresh")}</Button>
                    </div>
                    <Card>
                      <div className="px-5 py-5">
                        {mlLoading
                          ? <div className="flex gap-8"><Skeleton width={70} height={50} /><Skeleton width={70} height={50} /><Skeleton width={70} height={50} /></div>
                          : mlStats?.model_info
                          ? <div className="flex flex-wrap gap-8">
                              <AccuracyBig value={mlStats.model_info.accuracy} label={t("admin.model.accuracy")} tone="info" />
                              <AccuracyBig value={mlStats.model_info.f1_score} label={t("admin.model.f1macro")} tone="success" />
                              <AccuracyBig value={mlStats.ml_accuracy} label={t("admin.model.currentAccuracy")} tone="info" />
                            </div>
                          : <p className="text-[13px] text-ds-text-tertiary">{t("admin.model.notTrained")}</p>
                        }
                      </div>
                      <Divider />
                      <Row title={t("admin.model.algorithm")}
                        control={<span className="text-[13px] font-medium text-ds-text">{mlStats?.model_info?.model_type ?? "—"}</span>} />
                      <Divider />
                      <Row title={t("admin.model.lastTrained")}
                        control={
                          <span className="text-[13px] text-ds-text-secondary">
                            {mlStats?.model_info?.updated_at
                              ? new Date(mlStats.model_info.updated_at).toLocaleString(language === "uk" ? "uk-UA" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                              : t("admin.model.never")}
                          </span>
                        } />
                      <Divider />
                      <Row title={t("admin.model.samplesUsed")}
                        control={<span className="text-[13px] font-semibold tabular-nums text-ds-text">{mlStats?.model_info?.samples_used ?? "—"}</span>} />
                      <Divider />
                      <Row title={t("admin.model.totalInteractions")} description={t("admin.model.totalInteractionsDesc")}
                        control={<span className="text-[13px] font-semibold tabular-nums text-ds-text">{mlStats?.total ?? "—"}</span>} />
                    </Card>
                  </div>

                  {/* Level distribution */}
                  {mlStats?.level_distribution && (
                    <div>
                      <SectionLabel>{t("admin.model.levelDistribution")}</SectionLabel>
                      <Card>
                        {[1, 2, 3].map((lvl, i) => {
                          const count = mlStats.level_distribution[lvl] ?? 0;
                          const total = Object.values(mlStats.level_distribution).reduce((a, b) => a + b, 0);
                          return (
                            <div key={lvl}>
                              {i > 0 && <Divider />}
                              <div className="px-5 py-4">
                                <ProgressRow
                                  title={t(`admin.level.${lvl}`)}
                                  value={count}
                                  max={Math.max(total, 1)}
                                  variant="default"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </Card>
                    </div>
                  )}

                  {/* Матриця помилок */}
                  {mlStats?.confusion_matrix && (
                    <div>
                      <SectionLabel>{t("admin.model.confusionMatrix")}</SectionLabel>
                      <Card>
                        <div className="px-5 py-5">
                          {mlLoading
                            ? <Skeleton height={100} className="rounded-lg" />
                            : <ConfusionMatrix matrix={mlStats.confusion_matrix} />
                          }
                        </div>
                      </Card>
                    </div>
                  )}
                </section>
              )}

              {/* в”Ђв”Ђ RETRAIN в”Ђв”Ђ */}
              {tab === "retrain" && (
                <section className="animate-fade-in space-y-6">

                  {mlStats?.model_info && (
                    <div>
                      <SectionLabel>{t("admin.retrain.beforeSection")}</SectionLabel>
                      <Card>
                        <div className="px-5 py-5 flex flex-wrap gap-8">
                          <AccuracyBig value={mlStats.model_info.accuracy} label={t("admin.model.accuracy")} tone="info" />
                          <AccuracyBig value={mlStats.model_info.f1_score} label={t("admin.model.f1macro")} tone="success" />
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[30px] font-semibold leading-none text-ds-text tabular-nums">{mlStats.model_info.samples_used}</span>
                            <span className="text-[12px] text-ds-text-tertiary">{t("admin.model.samplesUsed")}</span>
                          </div>
                        </div>
                      </Card>
                    </div>
                  )}

                  <div>
                    <SectionLabel>{t("admin.retrain.settingsSection")}</SectionLabel>
                    <Card>
                      <Row title={t("admin.retrain.algorithmRow")} description={t("admin.retrain.algorithmDesc")}>
                        <div className="grid gap-2 sm:grid-cols-3">
                          {MODEL_OPTIONS.map(opt => (
                            <Choicebox key={opt.value} label={opt.label} description={t(opt.descKey)}
                              checked={modelType === opt.value} disabled={retraining}
                              onChange={() => setModelType(opt.value)} />
                          ))}
                        </div>
                      </Row>
                    </Card>
                  </div>

                  <div>
                    <SectionLabel>{t("admin.retrain.launchSection")}</SectionLabel>
                    <Card>
                      <Row
                        title={t("admin.retrain.runTitle")}
                        description={t("admin.retrain.runDesc")}
                        control={
                          <Button type="button" variant="default" size="sm" isLoading={retraining}
                            leftIcon={<RotateCcw size={13} strokeWidth={2} />}
                            onClick={() => void handleRetrain()}>
                            {retraining ? t("admin.retrain.running") : t("admin.retrain.run")}
                          </Button>
                        }
                      />
                      {retrainError && (
                        <>
                          <Divider />
                          <div className="px-5 py-3 flex items-center gap-2">
                            <StatusBadge variant="error" label={retrainError} />
                          </div>
                        </>
                      )}
                    </Card>
                  </div>

                  {retrainResult && (
                    <div>
                      <SectionLabel>{t("admin.retrain.resultsSection")}</SectionLabel>
                      <Card>
                        <div className="px-5 py-5 space-y-5">
                          <StatusBadge
                            variant="ok"
                            label={t("admin.retrain.successResult")
                              .replace("{model}", retrainResult.model_type)
                              .replace("{samples}", String(retrainResult.samples_used))}
                          />

                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {mlStats?.model_info && (
                              <StatCard value={`${Math.round(mlStats.model_info.accuracy * 100)}%`} label={t("admin.retrain.accuracyBefore")} tone="info" />
                            )}
                            <div className={cn(
                              "rounded-lg border px-5 py-4",
                              retrainResult.test_accuracy > (mlStats?.model_info?.accuracy ?? 0)
                                ? "border-[color:var(--ds-green-400)] bg-[color:var(--ds-green-100)]"
                                : "border-gray-alpha-200 bg-background-100",
                            )}>
                              <p className="text-[13px] font-medium text-ds-text-tertiary">{t("admin.retrain.accuracyAfter")}</p>
                              <p className={cn(
                                "mt-1.5 text-[30px] font-semibold tabular-nums leading-none",
                                retrainResult.test_accuracy > (mlStats?.model_info?.accuracy ?? 0) ? "text-green-800" : "text-ds-text",
                              )}>
                                {Math.round(retrainResult.test_accuracy * 100)}%
                                {retrainResult.test_accuracy > (mlStats?.model_info?.accuracy ?? 0) && <span className="ml-1 text-[16px]">↑</span>}
                              </p>
                            </div>
                            <StatCard value={`${Math.round(retrainResult.f1_macro * 100)}%`} label={t("admin.model.f1macro")} tone="success" />
                            <div className="rounded-lg border border-gray-alpha-200 bg-background-100 px-5 py-4">
                              <p className="text-[13px] font-medium text-ds-text-tertiary">{t("admin.retrain.cvF1")}</p>
                              <p className="mt-1.5 text-[20px] font-semibold tabular-nums leading-none text-ds-text">
                                {Math.round(retrainResult.cv_f1_mean * 100)}% ± {Math.round(retrainResult.cv_f1_std * 100)}%
                              </p>
                            </div>
                          </div>

                          <div>
                            <p className="mb-2 text-[13px] font-semibold text-ds-text-tertiary">{t("admin.retrain.cmSection")}</p>
                            <ConfusionMatrix matrix={retrainResult.confusion_matrix} />
                          </div>
                        </div>
                      </Card>
                    </div>
                  )}
                </section>
              )}

              {/* в”Ђв”Ђ USERS в”Ђв”Ђ */}
              {tab === "users" && (
                <section className="animate-fade-in space-y-6">

                  {/* Stat row */}
                  <div>
                    <div className="mb-3 flex items-center justify-between px-1">
                      <SectionLabel>{t("admin.users.overviewSection")}</SectionLabel>
                      <div className="flex items-center gap-2">
                        {lastRefresh && (
                          <span className="text-[12px] text-ds-text-tertiary">
                            {Math.floor((Date.now() - lastRefresh.getTime()) / 1000)} {t("admin.users.secAgo")} {t("admin.users.autoRefresh")}
                          </span>
                        )}
                        <Button type="button" variant="default" size="sm" isLoading={usersLoading}
                          leftIcon={<RefreshCw size={16} strokeWidth={2} />}
                          onClick={() => void loadUsers()}>{t("admin.dataset.refresh")}</Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {usersLoading && !userStats
                        ? [1,2,3].map(i => <Skeleton key={i} height={80} className="rounded-xl" />)
                        : <>
                            <StatCard value={userStats?.total_users ?? 0} label={t("admin.users.totalUsers")} tone="info" />
                            <StatCard value={userStats?.active_today ?? 0} label={t("admin.users.activeToday")} tone="success" />
                            <StatCard value={userStats?.active_last_hour ?? 0} label={t("admin.users.activeHour")} tone="info" />
                          </>
                      }
                    </div>
                  </div>

                  {/* Level distribution */}
                  {userStats?.level_distribution && (
                    <div>
                      <SectionLabel>{t("admin.users.levelsSection")}</SectionLabel>
                      <Card>
                        {[1, 2, 3].map((lvl, i) => {
                            const count = userStats.level_distribution[lvl] ?? 0;
                            const total = userStats.total_users || 1;
                            return (
                              <div key={lvl}>
                                {i > 0 && <Divider />}
                                <div className="px-5 py-4">
                                  <ProgressRow
                                    title={t(`admin.level.${lvl}`)}
                                    value={count}
                                    max={Math.max(total, 1)}
                                    variant="default"
                                  />
                                </div>
                              </div>
                            );
                          })}
                      </Card>
                    </div>
                  )}

                  {/* Activity chart */}
                  {activity && (
                    <div>
                      <SectionLabel>{t("admin.users.activitySection").replace("{count}", String(activity.total))}</SectionLabel>
                      <Card>
                        <div className="px-5 py-4">
                          <MiniBarChart data={activity.hours} />
                          <div className="mt-2 flex justify-between text-[11px] text-ds-text-tertiary">
                            <span>{activity.hours[0]?.label}</span>
                            <span>{activity.hours[11]?.label}</span>
                            <span>{activity.hours[23]?.label}</span>
                          </div>
                        </div>
                      </Card>
                    </div>
                  )}

                  <div>
                    <SectionLabel>{t("admin.users.issuesSection")}</SectionLabel>
                    <Card>
                      {usersLoading && !userIssues.length ? (
                        <div className="space-y-2 px-5 py-4">
                          {[1, 2, 3].map((i) => <Skeleton key={i} height={28} />)}
                        </div>
                      ) : userIssues.length ? (
                        <div className="divide-y divide-gray-alpha-200">
                          {userIssues.map((issue, index) => {
                            const translatedIssue = translateAdaptationIssue(t, issue);
                            return (
                              <div key={`${issue.email}-${issue.code}-${index}`} className="px-5 py-3.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge
                                    variant={issue.severity === "warning" ? "amber-subtle" : issue.severity === "error" ? "red-subtle" : "blue-subtle"}
                                    size="md"
                                  >
                                    {t(`admin.users.severity.${issue.severity}`)}
                                  </Badge>
                                  <p className="min-w-0 truncate text-[14px] font-medium text-ds-text">{issue.email}</p>
                                </div>
                                <p className="mt-1 text-[13px] text-ds-text-secondary">{translatedIssue.title}</p>
                                <p className="mt-0.5 text-[12px] text-ds-text-tertiary">{translatedIssue.detail}</p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="px-5 py-8 text-center">
                          <StatusBadge variant="ok" label={t("admin.users.noIssues")} />
                        </div>
                      )}
                    </Card>
                  </div>

                  {/* User table */}
                  <div>
                    <SectionLabel>{t("admin.users.allUsersSection").replace("{count}", String(userList.length))}</SectionLabel>
                    <UserTable users={userList} loading={usersLoading && !userList.length} />
                  </div>
                </section>
              )}

              {/* в”Ђв”Ђ SYSTEM в”Ђв”Ђ */}
              {tab === "system" && (
                <section className="animate-fade-in space-y-6">
                  <div>
                    <div className="mb-3 flex items-center justify-between px-1">
                      <SectionLabel>{t("admin.system.section")}</SectionLabel>
                      <Button type="button" variant="default" size="sm" isLoading={healthLoading}
                        leftIcon={<RefreshCw size={16} strokeWidth={2} />}
                        onClick={() => void loadHealth()}>{t("admin.dataset.refresh")}</Button>
                    </div>
                    <Card>
                      <Row title={t("admin.system.statusRow")}
                        control={healthLoading
                          ? <Skeleton width={90} height={20} />
                          : <StatusBadge variant={health?.status === "ok" ? "ok" : "error"}
                              label={translateAdminStatus(t, "appStatus", health?.status)} />
                        } />
                      <Divider />
                      <Row title={t("admin.system.dbRow")}
                        control={healthLoading
                          ? <Skeleton width={90} height={20} />
                          : <StatusBadge
                              variant={health?.db === "connected" ? "ok" : "error"}
                              label={translateAdminStatus(t, "db", health?.db)}
                            />
                        } />
                    </Card>
                  </div>

                  {health?.providers && Object.keys(health.providers).length > 0 && (
                    <div>
                      <SectionLabel>{t("admin.system.providersSection")}</SectionLabel>
                      <Card>
                        {Object.entries(health.providers).map(([name, ok], i) => (
                          <div key={name}>
                            {i > 0 && <Divider />}
                            <Row title={name}
                              control={<StatusBadge variant={ok ? "ok" : "neutral"} label={ok ? t("admin.system.connected") : t("admin.system.notConfigured")} />} />
                          </div>
                        ))}
                      </Card>
                    </div>
                  )}

                  <div>
                    <div className="mb-3 flex items-center justify-between px-1">
                      <SectionLabel>{t("admin.system.testSection")}</SectionLabel>
                      <Button type="button" variant="default" size="sm" isLoading={testingProviders}
                        onClick={() => void handleTestProviders()}>{t("admin.system.testProviders")}</Button>
                    </div>
                    {providerResults && (
                      <Card>
                        {Object.entries(providerResults).map(([name, res], i) => (
                          <div key={name}>
                            {i > 0 && <Divider />}
                            <Row
                              title={name}
                              description={res.status === "ok" ? `${res.latency_ms ?? 0}ms` : (res.error ?? "")}
                              control={
                                <StatusBadge
                                  variant={res.status === "ok" ? "ok" : "error"}
                                  label={translateAdminStatus(t, "providerStatus", res.status)}
                                />
                              }
                            />
                          </div>
                        ))}
                      </Card>
                    )}
                  </div>
                </section>
              )}

            </div>
          </div>
        </div>
      </div>
    </main>
  );
}


