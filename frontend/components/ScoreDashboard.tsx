"use client";

import { useState } from "react";
import { Lightbulb, Zap, Download, PieChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserLevelStore } from "@/lib/store/userLevelStore";

/* Level palette — RGB triplets for use with rgba() */
const LEVEL_COLORS: Record<1 | 2 | 3, string> = {
  1: "46, 125, 50",
  2: "0, 100, 245",
  3: "189, 119, 0",
};

const LEVEL_NAMES: Record<1 | 2 | 3, string> = {
  1: "Novice",
  2: "Intermediate",
  3: "Expert",
};

/* Bar */
function Bar({
  value,
  max = 100,
  color,
}: {
  value: number;
  max?: number;
  color?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="relative h-1 w-full overflow-hidden rounded-full bg-gray-alpha-200">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${pct}%`,
          background: color ?? "rgb(var(--text-2))",
        }}
      />
    </div>
  );
}

/* Progress math */
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
    (b) => b.category === "Structure & Context",
  );
  if (structureItem && structureItem.points === 0) {
    return (
      "Add structure: specify a role (e.g. \"Act as an expert\") " +
      "or desired format (\"as a table\", \"as a list\")."
    );
  }

  const techItem = breakdown.find((b) => b.category === "Technical Terms");
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

/* Main dashboard */

export function ScoreDashboard() {
  const {
    level,
    confidence,
    reasoning,
    score,
    normalizedScore,
    breakdown,
    thresholds,
    metrics,
    hasAnalyzed,
    isAnalyzing,
  } = useUserLevelStore();

  const accent = LEVEL_COLORS[level];
  const progress = progressToNext(normalizedScore, level, thresholds);

  if (!hasAnalyzed) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-3 opacity-20">
          <PieChart size={32} strokeWidth={2} />
        </div>
        <p className="text-[15px] text-ds-text-secondary">
          Waiting for input
        </p>
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
            style={{ backgroundColor: `rgba(${accent}, 0.12)`, color: `rgb(${accent})` }}
          >
            {level}
          </div>
          <div>
            <p className="text-[15px] font-semibold text-ds-text">
              {LEVEL_NAMES[level]}
            </p>
            <p className="text-xs text-ds-text-tertiary">
              {Math.round(confidence * 100)}% confidence
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
                  background: `rgb(${accent})`,
                  animation: `pulse-dot 1.2s ${d}ms infinite`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="divider" />

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-ds-text-tertiary">Progress</span>
          <span className="font-mono text-ds-text-secondary">
            {score}/13.5
          </span>
        </div>
        <Bar value={progress.percent} color={`rgb(${accent})`} />
        <p className="text-xs text-ds-text-tertiary">
          {progress.label}
        </p>
      </div>

      {/* Mentor tip */}
      <TipCard
        breakdown={breakdown}
        reasoning={reasoning}
        level={level}
        score={score}
      />

      <div className="divider" />

      {/* Breakdown */}
      <div className="space-y-3">
        <p className="config-label">Breakdown</p>
        {breakdown.map((item) => (
          <div key={item.category} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-ds-text-secondary">{item.category}</span>
              <span className="font-mono text-ds-text-tertiary">
                {item.points < 0 ? "" : "+"}
                {item.points.toFixed(1)}/{item.max_points.toFixed(1)}
              </span>
            </div>
            <Bar
              value={item.max_points > 0 ? (item.points / item.max_points) * 100 : 0}
            />
          </div>
        ))}
      </div>

      <div className="divider" />

      {/* Reasoning */}
      {reasoning.length > 0 && (
        <div className="space-y-2">
          <p className="config-label">Analysis</p>
          <ul className="space-y-1">
            {reasoning.map((r, i) => (
              <li
                key={i}
                className="text-sm leading-relaxed text-ds-text-secondary"
              >
                <span className="text-ds-text-tertiary">·</span> {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="divider" />

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Messages", value: metrics.sessionMessageCount },
          { label: "Speed", value: `${metrics.charsPerSecond.toFixed(1)} c/s` },
          { label: "Avg. length", value: Math.round(metrics.avgPromptLength) },
          { label: "Score", value: score },
        ].map((m) => (
          <div
            key={m.label}
            className="rounded-xl p-3 bg-gray-alpha-100 border border-gray-alpha-200"
          >
            <p className="text-xs text-ds-text-tertiary">
              {m.label}
            </p>
            <p className="mt-0.5 font-mono text-[15px] font-medium text-ds-text">
              {m.value}
            </p>
          </div>
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
        <p className="text-center text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}