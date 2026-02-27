"use client";

import { useState } from "react";
import { useUserLevelStore } from "@/lib/store/userLevelStore";

const LEVEL_NAMES: Record<1 | 2 | 3, string> = {
  1: "Novice",
  2: "Intermediate",
  3: "Expert",
};

function Bar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      className="relative h-1 w-full overflow-hidden rounded-full"
      style={{ background: "rgba(255,255,255,0.06)" }}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: "rgb(99,120,255)" }}
      />
    </div>
  );
}

function progressToNext(
  normalized: number,
  level: 1 | 2 | 3,
  thresholds: { L2: number; L3: number },
) {
  if (level === 3) return { percent: 100, label: "Максимальний рівень" };
  if (level === 1) {
    const pct = Math.min(100, (normalized / thresholds.L2) * 100);
    return { percent: pct, label: `${Math.round(pct)}% до L2` };
  }
  const range = thresholds.L3 - thresholds.L2;
  const progress = normalized - thresholds.L2;
  const pct = Math.min(100, (progress / range) * 100);
  return { percent: pct, label: `${Math.round(pct)}% до L3` };
}

// ---------------------------------------------------------------------------
// Tip system — contextual mentor advice
// ---------------------------------------------------------------------------

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
  // 1. Politeness penalty detected
  const hasPolitePenalty = reasoning.some(
    (r) => r.includes("Polite") || r.includes("-0.5"),
  );
  if (hasPolitePenalty) {
    return (
      "💡 ШІ не потребує ввічливості. Замість «Будь ласка, чи не міг би ти» " +
      "використовуйте чіткі команди: «Напиши», «Проаналізуй»."
    );
  }

  // 2. No structure / context points
  const structureItem = breakdown.find(
    (b) => b.category === "Structure & Context",
  );
  if (structureItem && structureItem.points === 0) {
    return (
      "💡 Додайте структуру: вкажіть роль (напр., «Дій як експерт») " +
      "або бажаний формат («у вигляді таблиці», «списком»)."
    );
  }

  // 3. No technical terms for intermediate+ users
  const techItem = breakdown.find((b) => b.category === "Technical Terms");
  if (techItem && techItem.points === 0 && level >= 2) {
    return (
      "💡 Використовуйте системні змінні (наприклад, {{var}}), " +
      "щоб зробити запити точнішими та гнучкими."
    );
  }

  // 4. Expert with high score
  if (level === 3 && score > 12) {
    return (
      "🔥 Ідеальні промпти! Використовуйте режим Compare, " +
      "щоб тестувати їх на різних моделях одночасно."
    );
  }

  // 5. Default
  return "💡 Експериментуйте з довжиною запитів — додавайте більше контексту та деталей.";
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
  const isFireTip = tip.startsWith("🔥");

  return (
    <div
      className="rounded-xl px-4 py-3 text-[12px] leading-relaxed transition-all duration-300"
      style={{
        background: isFireTip
          ? "rgba(255,160,60,0.07)"
          : "rgba(123,147,255,0.07)",
        border: `1px solid ${
          isFireTip ? "rgba(255,160,60,0.2)" : "rgba(123,147,255,0.2)"
        }`,
        color: isFireTip
          ? "rgba(255,190,100,0.9)"
          : "rgba(160,175,255,0.9)",
      }}
    >
      {tip}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

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

  const progress = progressToNext(normalizedScore, level, thresholds);

  if (!hasAnalyzed) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-3 opacity-20">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
            <path d="M22 12A10 10 0 0 0 12 2v10z" />
          </svg>
        </div>
        <p className="text-[13px]" style={{ color: "rgb(var(--text-2))" }}>
          Очікую на введення
        </p>
        <p className="mt-1 text-[11px]" style={{ color: "rgb(var(--text-3))" }}>
          Надішліть повідомлення, щоб побачити аналіз
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
            style={{ background: "rgba(99,120,255,0.12)", color: "rgb(99,120,255)" }}
          >
            {level}
          </div>
          <div>
            <p
              className="text-[14px] font-semibold"
              style={{ color: "rgb(var(--text-1))" }}
            >
              {LEVEL_NAMES[level]}
            </p>
            <p className="text-[11px]" style={{ color: "rgb(var(--text-3))" }}>
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
                  background: "rgb(99,120,255)",
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
        <div className="flex items-center justify-between text-[11px]">
          <span style={{ color: "rgb(var(--text-3))" }}>Прогрес</span>
          <span className="font-mono" style={{ color: "rgb(var(--text-2))" }}>
            {score}/13.5
          </span>
        </div>
        <Bar value={progress.percent} />
        <p className="text-[11px]" style={{ color: "rgb(var(--text-3))" }}>
          {progress.label}
        </p>
      </div>

      {/* Mentor tip — right below progress */}
      <TipCard
        breakdown={breakdown}
        reasoning={reasoning}
        level={level}
        score={score}
      />

      <div className="divider" />

      {/* Breakdown */}
      <div className="space-y-3">
        <p className="config-label">Розбивка</p>
        {breakdown.map((item) => (
          <div key={item.category} className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span style={{ color: "rgb(var(--text-2))" }}>{item.category}</span>
              <span className="font-mono" style={{ color: "rgb(var(--text-3))" }}>
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
          <p className="config-label">Аналіз</p>
          <ul className="space-y-1">
            {reasoning.map((r, i) => (
              <li
                key={i}
                className="text-[12px] leading-relaxed"
                style={{ color: "rgb(var(--text-2))" }}
              >
                <span style={{ color: "rgb(var(--text-3))" }}>·</span> {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="divider" />

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Повідомлень", value: metrics.sessionMessageCount },
          { label: "Швидкість", value: `${metrics.charsPerSecond.toFixed(1)} c/c` },
          { label: "Сер. довжина", value: Math.round(metrics.avgPromptLength) },
          { label: "Score", value: score },
        ].map((m) => (
          <div
            key={m.label}
            className="rounded-xl p-3"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <p className="text-[10px]" style={{ color: "rgb(var(--text-3))" }}>
              {m.label}
            </p>
            <p
              className="mt-0.5 font-mono text-[14px] font-medium"
              style={{ color: "rgb(var(--text-1))" }}
            >
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

// ─── Export Button ────────────────────────────────────────────────────────────

function ExportButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/export");

      if (res.status === 401) {
        setError("Потрібна авторизація. Увійдіть в акаунт.");
        return;
      }
      if (res.status === 503) {
        setError(
          "ADMIN_API_KEY не налаштовано в Next.js. " +
          "Додайте ADMIN_API_KEY=<ваш ключ> у .env.local і перезапустіть сервер.",
        );
        return;
      }
      if (res.status === 502) {
        setError("Бекенд недоступний. Перевірте, чи запущено FastAPI.");
        return;
      }
      if (!res.ok) {
        setError(`Помилка: HTTP ${res.status}`);
        return;
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = "interaction_logs.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed", e);
      setError("Помилка з'єднання з сервером");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <button
        onClick={handleExport}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[12px] transition-all"
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          color: "rgb(var(--text-2))",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {loading ? "Завантаження..." : "Експорт CSV"}
      </button>
      {error && (
        <p className="text-center text-[11px]" style={{ color: "rgb(var(--accent-red))" }}>
          {error}
        </p>
      )}
    </div>
  );
}