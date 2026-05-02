"use client";

import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/store/i18nStore";

type GenerationStatusTone = "thinking" | "thought" | "worked";

function formatDurationLabel(
  tone: GenerationStatusTone,
  durationMs: number,
  language: "en" | "uk",
): string {
  const seconds = Math.max(1, Math.ceil(durationMs / 1000));

  if (tone === "thinking") {
    return language === "uk" ? "Думаю" : "Thinking";
  }

  if (tone === "thought") {
    return language === "uk"
      ? `Відповідь почалась за ${seconds} с`
      : `Response started in ${seconds}s`;
  }

  return language === "uk"
    ? `Завершено за ${seconds} с`
    : `Completed in ${seconds}s`;
}

export function GenerationStatusRow({
  tone,
  durationMs = 0,
  shimmer = false,
  singleShimmer = false,
  className,
}: {
  tone: GenerationStatusTone;
  durationMs?: number;
  shimmer?: boolean;
  singleShimmer?: boolean;
  className?: string;
}) {
  const { language, t } = useTranslation();
  const label = formatDurationLabel(tone, durationMs, language);

  return (
    <div className={cn("generation-status", className)}>
      <div
        className="generation-status__row"
        role="status"
        aria-live="polite"
        aria-label={tone === "thinking" ? t("chat.thinking.title") : label}
        data-state="open"
      >
        <span className="generation-status__icon" aria-hidden="true">
          <Brain strokeWidth={2} />
        </span>
        <div className="generation-status__content">
          <div className="generation-status__stack">
            <span
              className={cn(
                "generation-status__text",
                shimmer && "generation-status__text--shimmer",
                singleShimmer && "generation-status__text--single",
              )}
            >
              {label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
