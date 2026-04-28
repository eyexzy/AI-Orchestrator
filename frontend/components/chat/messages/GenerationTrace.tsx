"use client";

import {
  Activity,
  Brain,
  ChevronRight,
  Search,
  Sparkles,
} from "lucide-react";
import { useTranslation, type Language } from "@/lib/store/i18nStore";
import { cn } from "@/lib/utils";

type GenerationStepKind = "thought" | "context" | "generating";
type GenerationStepState = "active" | "completed";

type GenerationTraceStep = {
  id: string;
  kind: GenerationStepKind;
  state: GenerationStepState;
  duration_ms?: number;
  count?: number;
  history_count?: number;
  project_chat_count?: number;
  project_context_used?: boolean;
  stream_chunks?: number;
  stream_chars?: number;
  estimated_tokens?: number;
};

type GenerationSummary = {
  duration_ms?: number;
  first_token_ms?: number;
  history_count?: number;
  project_chat_count?: number;
  project_context_used?: boolean;
  stream_chunks?: number;
  stream_chars?: number;
  estimated_tokens?: number;
  model_label?: string;
  model_id?: string;
  provider?: string;
  stopped?: boolean;
  truncated?: boolean;
  can_continue?: boolean;
  continued_passes?: number;
  finish_reason?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function parseStep(step: unknown): GenerationTraceStep | null {
  if (!isRecord(step)) return null;
  const kind = step.kind;
  const state = step.state;
  if (
    kind !== "thought" &&
    kind !== "context" &&
    kind !== "generating"
  ) {
    return null;
  }
  if (state !== "active" && state !== "completed") {
    return null;
  }

  return {
    id: asString(step.id) ?? kind,
    kind,
    state,
    duration_ms: asNumber(step.duration_ms),
    count: asNumber(step.count),
    history_count: asNumber(step.history_count),
    project_chat_count: asNumber(step.project_chat_count),
    project_context_used: asBoolean(step.project_context_used),
    stream_chunks: asNumber(step.stream_chunks),
    stream_chars: asNumber(step.stream_chars),
    estimated_tokens: asNumber(step.estimated_tokens),
  };
}

function parseSummary(metadata?: Record<string, unknown>): GenerationSummary {
  const summary = isRecord(metadata?.generation_summary)
    ? metadata.generation_summary
    : {};

  return {
    duration_ms: asNumber(summary.duration_ms) ?? asNumber(metadata?.generation_ms) ?? asNumber(metadata?.latency_ms),
    first_token_ms: asNumber(summary.first_token_ms),
    history_count: asNumber(summary.history_count),
    project_chat_count: asNumber(summary.project_chat_count),
    project_context_used: asBoolean(summary.project_context_used),
    stream_chunks: asNumber(summary.stream_chunks),
    stream_chars: asNumber(summary.stream_chars),
    estimated_tokens: asNumber(summary.estimated_tokens) ?? asNumber(metadata?.tokens),
    model_label: asString(summary.model_label) ?? asString(metadata?.model),
    model_id: asString(summary.model_id) ?? asString(metadata?.model_id),
    provider: asString(summary.provider) ?? asString(metadata?.provider),
    stopped: asBoolean(summary.stopped) ?? asBoolean(metadata?.generation_stopped),
    truncated: asBoolean(summary.truncated),
    can_continue: asBoolean(summary.can_continue) ?? asBoolean(metadata?.generation_can_continue),
    continued_passes: asNumber(summary.continued_passes),
    finish_reason: asString(summary.finish_reason),
  };
}

function parseTrace(metadata?: Record<string, unknown>, isStreaming = false): GenerationTraceStep[] {
  const rawTrace = Array.isArray(metadata?.generation_trace)
    ? metadata.generation_trace.map(parseStep).filter((step): step is GenerationTraceStep => step !== null)
    : [];

  if (rawTrace.length > 0) {
    return rawTrace;
  }

  const summary = parseSummary(metadata);
  if (isStreaming) {
    return [
      { id: "thought", kind: "thought", state: "active" },
      ...(summary.history_count || summary.project_chat_count || summary.project_context_used
        ? [{
            id: "context",
            kind: "context" as const,
            state: "completed" as const,
            count: (summary.history_count ?? 0) + (summary.project_chat_count ?? 0),
            history_count: summary.history_count,
            project_chat_count: summary.project_chat_count,
            project_context_used: summary.project_context_used,
          }]
        : []),
    ];
  }

  if (summary.duration_ms) {
    return [{ id: "thought", kind: "thought", state: "completed", duration_ms: summary.first_token_ms ?? summary.duration_ms }];
  }

  return [];
}

function formatDuration(durationMs: number | undefined, language: Language) {
  const totalSeconds = Math.max(1, Math.ceil((durationMs ?? 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (language === "uk") {
    return minutes > 0 ? `${minutes} хв ${seconds} с` : `${seconds} с`;
  }

  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatItems(count: number | undefined, language: Language) {
  const value = count ?? 0;
  return language === "uk" ? `${value} елементів` : `${value} items`;
}

function stepLabel(
  step: GenerationTraceStep,
  language: Language,
  t: (key: string) => string,
) {
  if (step.kind === "thought") {
    return step.state === "active"
      ? t("chat.status.thinking")
      : `${t("chat.status.thoughtFor")} ${formatDuration(step.duration_ms, language)}`;
  }

  if (step.kind === "context") {
    return `${t("chat.status.context")} · ${formatItems(step.count, language)}`;
  }

  return t("chat.status.generating");
}

function renderStepDetails(
  step: GenerationTraceStep,
  language: Language,
  t: (key: string) => string,
) {
  if (step.kind === "thought") {
    const lines = [
      step.state === "active"
        ? t("chat.status.waitingFirstToken")
        : `${t("chat.status.firstToken")} ${formatDuration(step.duration_ms, language)}`,
    ];
    return lines;
  }

  if (step.kind === "context") {
    const lines: string[] = [];
    if ((step.history_count ?? 0) > 0) {
      lines.push(`${step.history_count} ${t("chat.status.recentMessagesReviewed")}`);
    }
    if ((step.project_chat_count ?? 0) > 0) {
      lines.push(`${step.project_chat_count} ${t("chat.status.projectChatsReferenced")}`);
    }
    if (step.project_context_used && (step.project_chat_count ?? 0) === 0) {
      lines.push(t("chat.status.projectInstructionsIncluded"));
    }
    return lines;
  }

  const lines = [t("chat.status.streamingAnswer")];
  if ((step.stream_chunks ?? 0) > 0) {
    lines.push(`${step.stream_chunks} ${t("chat.status.streamChunksValue")}`);
  }
  if ((step.stream_chars ?? 0) > 0) {
    lines.push(`${step.stream_chars} ${t("chat.status.charactersValue")}`);
  }
  if ((step.estimated_tokens ?? 0) > 0) {
    lines.push(`${step.estimated_tokens} ${t("chat.status.estimatedTokensValue")}`);
  }
  return lines;
}

function summaryRows(
  summary: GenerationSummary,
  language: Language,
  t: (key: string) => string,
) {
  const itemsReviewed = (summary.history_count ?? 0) + (summary.project_chat_count ?? 0);
  const rows: Array<{ label: string; value: string }> = [];

  if (summary.first_token_ms) {
    rows.push({
      label: t("chat.status.firstTokenLabel"),
      value: formatDuration(summary.first_token_ms, language),
    });
  }

  if (itemsReviewed > 0) {
    rows.push({
      label: t("chat.status.itemsReviewedLabel"),
      value: formatItems(itemsReviewed, language),
    });
  }

  if ((summary.stream_chunks ?? 0) > 0) {
    rows.push({
      label: t("chat.status.streamChunksLabel"),
      value: String(summary.stream_chunks),
    });
  }

  if ((summary.stream_chars ?? 0) > 0) {
    rows.push({
      label: t("chat.status.charactersLabel"),
      value: String(summary.stream_chars),
    });
  }

  if ((summary.estimated_tokens ?? 0) > 0) {
    rows.push({
      label: t("chat.status.estimatedTokensLabel"),
      value: String(summary.estimated_tokens),
    });
  }

  if (summary.model_label) {
    rows.push({
      label: t("chat.status.modelLabel"),
      value: summary.model_label,
    });
  }

  if ((summary.continued_passes ?? 0) > 0) {
    rows.push({
      label: t("chat.status.continuedPassesLabel"),
      value: String(summary.continued_passes),
    });
  }

  if (summary.provider) {
    rows.push({
      label: t("chat.status.providerLabel"),
      value: summary.provider,
    });
  }

  if (summary.truncated) {
    rows.push({
      label: t("chat.status.completionStatusLabel"),
      value: t("chat.status.completionIncomplete"),
    });
  }

  return rows;
}

function StepIcon({ kind }: { kind: GenerationStepKind }) {
  if (kind === "thought") {
    return <Brain size={13} strokeWidth={2} />;
  }
  if (kind === "context") {
    return <Search size={13} strokeWidth={2} />;
  }
  return <Sparkles size={13} strokeWidth={2} />;
}

export function AssistantGenerationTop({
  metadata,
  isStreaming,
  className,
}: {
  metadata?: Record<string, unknown>;
  isStreaming?: boolean;
  className?: string;
}) {
  const { t, language } = useTranslation();
  const steps = parseTrace(metadata, isStreaming)
    .filter((step) => isStreaming || step.kind !== "generating");

  if (steps.length === 0) {
    return null;
  }

  return (
    <div className={cn("generation-trace", className)}>
      {(() => {
        const activeStepId = isStreaming
          ? steps.find((step) => step.state === "active")?.id ?? null
          : null;

        return steps.map((step) => {
          const details = renderStepDetails(step, language, t);
          const isCurrentAnimatedStep = Boolean(activeStepId && step.id === activeStepId);
          const label = stepLabel(step, language, t);
          const isStepOpen = isCurrentAnimatedStep;

          return (
            <details
              key={step.id}
              className="generation-trace__step"
              open={isStepOpen}
            >
              <summary className="generation-trace__summary">
                <span className="generation-trace__icon" aria-hidden="true">
                  <span className="generation-trace__icon-status">
                    <StepIcon kind={step.kind} />
                  </span>
                  <span className="generation-trace__icon-chevron">
                    <ChevronRight size={13} strokeWidth={2} />
                  </span>
                </span>
                <span className="generation-trace__label">
                  <span
                    className={cn(
                      "generation-trace__label-text",
                      isCurrentAnimatedStep && "generation-trace__animated-text",
                    )}
                  >
                    {label}
                  </span>
                </span>
              </summary>
              {details.length > 0 && (
                <div className="generation-trace__panel">
                  {details.map((detail) => (
                    <div key={detail} className="generation-trace__detail">
                      <span className="generation-trace__detail-text">{detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </details>
          );
        });
      })()}
    </div>
  );
}

export function AssistantGenerationBottom({
  metadata,
  className,
}: {
  metadata?: Record<string, unknown>;
  className?: string;
}) {
  const { t, language } = useTranslation();
  const summary = parseSummary(metadata);

  if (!summary.duration_ms) {
    return null;
  }

  const rows = summaryRows(summary, language, t);
  const labelPrefix = summary.stopped
    ? t("chat.status.stoppedAfter")
    : t("chat.status.workedFor");

  return (
    <details className={cn("generation-trace__step generation-trace__step--summary", className)}>
      <summary className="generation-trace__summary">
        <span className="generation-trace__icon" aria-hidden="true">
          <span className="generation-trace__icon-status">
            <Activity size={13} strokeWidth={2} />
          </span>
          <span className="generation-trace__icon-chevron">
            <ChevronRight size={13} strokeWidth={2} />
          </span>
        </span>
        <span className="generation-trace__label">
          <span className="generation-trace__label-text generation-trace__animated-text generation-trace__animated-text--single">
            {labelPrefix} {formatDuration(summary.duration_ms, language)}
          </span>
        </span>
      </summary>
      {rows.length > 0 && (
        <div className="generation-trace__panel generation-trace__panel--summary">
          {rows.map((row) => (
            <div key={row.label} className="generation-trace__stat">
              <span className="generation-trace__stat-label">{row.label}</span>
              <span className="generation-trace__stat-value">{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}
