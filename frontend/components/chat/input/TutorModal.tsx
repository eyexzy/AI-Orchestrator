"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "@/lib/store/i18nStore";
import { CheckCircle2, AlertCircle, RefreshCcw, Send, Sparkles, Star, ChevronDown } from "lucide-react";

/* ── Types ──────────────────────────────────────────────────────────────────── */

export interface TutorQuestion {
  id: string;
  question: string;
}

export interface TutorReview {
  opening_message: string;
  strengths: string[];
  gaps: string[];
  clarifying_questions: TutorQuestion[];
  improved_prompt: string;
  why_this_is_better: string[];
  next_step: string;
}

export type TutorMode = "quick" | "guided";

interface TutorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading: boolean;
  review: TutorReview | null;
  errorMessage: string | null;
  improvedPromptValue: string;
  clarificationAnswers: Record<string, string>;
  onClarificationAnswerChange: (id: string, value: string) => void;
  onImprovedPromptChange: (value: string) => void;
  onRefineAgain: () => void;
  onRetry: () => void;
  onSendOriginal: () => void;
  onSendImproved: (value: string) => void;
  onCancel: () => void;
  onModeChange?: (mode: TutorMode) => void;
  onWeaknessViewed?: (gap: string) => void;
  onWhyBetterViewed?: () => void;
  onNextStepClicked?: () => void;
  onHelpfulnessRated?: (rating: number) => void;
  onQuestionsSkipped?: () => void;
}

/* ── Prompt score bar ───────────────────────────────────────────────────────── */
// Score = strengths / (strengths + gaps), capped nicely
function computeScore(strengths: number, gaps: number): number {
  const total = strengths + gaps;
  if (total === 0) return 50;
  return Math.round((strengths / total) * 100);
}

function PromptScoreBar({ strengths, gaps }: { strengths: number; gaps: number }) {
  const { t } = useTranslation();
  const score = computeScore(strengths, gaps);
  const label = score >= 75 ? t("tutor.scoreStrong") : score >= 45 ? t("tutor.scoreOk") : t("tutor.scoreWeak");
  const color = score >= 75 ? "bg-green-700" : score >= 45 ? "bg-amber-700" : "bg-red-700";
  const badgeVariant = score >= 75 ? "green-subtle" : score >= 45 ? "amber-subtle" : "red-subtle";

  return (
    <div className="flex items-center gap-3">
      <Progress value={score} max={100} variant={score >= 70 ? "default" : score >= 40 ? "warning" : "error"} className="flex-1" />
      <Badge variant={badgeVariant} size="sm">{label}</Badge>
    </div>
  );
}

/* ── Gap card ──────────────────────────────────────────────────────────────── */
function GapCard({ gap, onExpand }: { gap: string; onExpand: () => void }) {
  const [open, setOpen] = useState(false);

  // Extract a short label (first 6 words) and the rest as detail
  const words = gap.trim().split(/\s+/);
  const label = words.slice(0, 7).join(" ") + (words.length > 7 ? "…" : "");
  const hasMore = words.length > 7;

  const toggle = () => {
    if (!open) onExpand();
    setOpen((v) => !v);
  };

  return (
    <button
      type="button"
      onClick={hasMore ? toggle : undefined}
      className={`group w-full text-left rounded-lg border border-amber-700/20 bg-amber-700/8 px-3 py-2.5 transition-colors
        ${hasMore ? "hover:border-amber-700/30 cursor-pointer" : "cursor-default"}`}
    >
      <div className="flex items-start gap-2">
        <AlertCircle size={14} strokeWidth={2} className="shrink-0 mt-0.5 text-amber-700" />
        <span className="text-[13px] leading-5 text-ds-text flex-1">
          {open ? gap : label}
        </span>
        {hasMore && (
          <ChevronDown
            size={13}
            strokeWidth={2}
            className={`shrink-0 mt-0.5 text-ds-text-tertiary transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </div>
    </button>
  );
}

/* ── Star rating ────────────────────────────────────────────────────────────── */
function StarRating({ onRate }: { onRate: (r: number) => void }) {
  const { t } = useTranslation();
  const [rated, setRated] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  if (rated !== null) {
    return (
      <span className="text-[12px] text-ds-text-tertiary">{t("tutor.ratedThanks")}</span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] text-ds-text-tertiary">{t("tutor.rateHelpfulness")}</span>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = hovered !== null ? n <= hovered : false;
          return (
            <button
              key={n}
              type="button"
              onMouseEnter={() => setHovered(n)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => { setRated(n); onRate(n); }}
              aria-label={`${n} star`}
              className="text-ds-text-tertiary hover:text-amber-400 transition-colors"
            >
              <Star size={14} strokeWidth={2} fill={filled ? "currentColor" : "none"}
                className={filled ? "text-amber-400" : ""} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Review body ─────────────────────────────────────────────────────────────── */
function TutorReviewBody({
  review,
  improvedPromptValue,
  clarificationAnswers,
  onClarificationAnswerChange,
  onImprovedPromptChange,
  onRefineAgain,
  onWeaknessViewed,
  onWhyBetterViewed,
  onHelpfulnessRated,
  onQuestionsSkipped,
}: {
  review: TutorReview;
  improvedPromptValue: string;
  clarificationAnswers: Record<string, string>;
  onClarificationAnswerChange: (id: string, value: string) => void;
  onImprovedPromptChange: (v: string) => void;
  onRefineAgain: () => void;
  onWeaknessViewed?: (gap: string) => void;
  onWhyBetterViewed?: () => void;
  onHelpfulnessRated?: (r: number) => void;
  onQuestionsSkipped?: () => void;
}) {
  const { t } = useTranslation();
  const [whyOpen, setWhyOpen] = useState(false);
  const [questionsSkipped, setQuestionsSkipped] = useState(false);

  const strengths = review.strengths.slice(0, 3);
  const gaps = review.gaps.slice(0, 3);
  const questions = review.clarifying_questions;
  const hasQuestions = questions.length > 0;
  const hasWhyBetter = review.why_this_is_better.length > 0;

  return (
    <div className="flex flex-col">

      {/* ① Score + Analysis */}
      <div className="px-6 py-4 space-y-3">
        <PromptScoreBar strengths={strengths.length} gaps={gaps.length} />

        {/* Strengths — compact pills */}
        {strengths.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {strengths.map((s) => (
              <div key={s} className="flex items-center gap-1.5 rounded-full bg-green-700/10 border border-green-700/20 px-2.5 py-1 text-[12px] text-green-700">
                <CheckCircle2 size={11} strokeWidth={2.5} className="shrink-0" />
                <span className="leading-none">{s}</span>
              </div>
            ))}
          </div>
        )}

        {/* Gaps — expandable cards */}
        {gaps.length > 0 && (
          <div className="space-y-1.5">
            {gaps.map((gap) => (
              <GapCard key={gap} gap={gap} onExpand={() => onWeaknessViewed?.(gap)} />
            ))}
          </div>
        )}
      </div>

      {/* ② Clarifying questions */}
      {hasQuestions && !questionsSkipped && (
        <div className="px-6 pb-4 space-y-2.5">
          <p className="text-[12px] text-ds-text-tertiary font-medium">{t("tutor.questions")}</p>
          <div className="space-y-2">
            {questions.map((q) => (
              <div key={q.id} className="space-y-1.5">
                <p className="text-[13px] font-medium text-ds-text leading-snug">{q.question}</p>
                <Input
                  variant="default"
                  size="md"
                  value={clarificationAnswers[q.id] ?? ""}
                  onChange={(e) => onClarificationAnswerChange(q.id, e.target.value)}
                  placeholder={t("tutor.answerPlaceholder")}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-0.5">
            <button
              type="button"
              className="text-[12px] text-ds-text-tertiary hover:text-ds-text-secondary transition-colors"
              onClick={() => { setQuestionsSkipped(true); onQuestionsSkipped?.(); }}
            >
              {t("tutor.skipQuestions")}
            </button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<RefreshCcw size={12} strokeWidth={2} />}
              onClick={onRefineAgain}
            >
              {t("tutor.refineAgain")}
            </Button>
          </div>
        </div>
      )}

      {/* ③ Improved prompt */}
      <div className="px-6 pb-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-medium text-ds-text-tertiary">{t("tutor.improvedPrompt")}</p>
          {hasWhyBetter && (
            <button
              type="button"
              onClick={() => { if (!whyOpen) onWhyBetterViewed?.(); setWhyOpen((v) => !v); }}
              className="flex items-center gap-1 text-[12px] text-blue-700 hover:text-blue-800 transition-colors"
            >
              {t("tutor.whyBetter")}
              <ChevronDown size={11} strokeWidth={2.5} className={`transition-transform ${whyOpen ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>

        {whyOpen && hasWhyBetter && (
          <div className="rounded-lg bg-blue-700/8 border border-blue-700/20 px-3 py-2.5 space-y-1">
            {review.why_this_is_better.map((item) => (
              <p key={item} className="text-[12px] leading-[18px] text-blue-700">· {item}</p>
            ))}
          </div>
        )}

        <Textarea
          value={improvedPromptValue}
          onChange={(e) => onImprovedPromptChange(e.target.value)}
          placeholder={t("tutor.noImprovedPrompt")}
          variant="default"
          wrapperClassName="rounded-lg"
          textareaClassName="min-h-[120px] resize-none px-3 py-3 text-[13.5px] leading-relaxed"
        />
      </div>

      {/* ④ Rating */}
      {onHelpfulnessRated && (
        <div className="px-6 pb-4 flex items-center justify-end">
          <StarRating onRate={onHelpfulnessRated} />
        </div>
      )}
    </div>
  );
}

/* ── Loading ─────────────────────────────────────────────────────────────────── */
function TutorLoadingBody() {
  const { t } = useTranslation();
  return (
    <div className="flex h-[280px] flex-col items-center justify-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-alpha-100 shadow-[0_0_0_1px_var(--ds-gray-alpha-200)]">
        <Sparkles size={16} strokeWidth={2} className="animate-pulse text-ds-text-tertiary" />
      </div>
      <p className="text-[13px] text-ds-text-secondary">{t("tutor.loading")}</p>
    </div>
  );
}

/* ── Error ───────────────────────────────────────────────────────────────────── */
function TutorErrorBody({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-[280px] flex-col items-center justify-center px-6">
      <ErrorState title={t("tutor.errorTitle")} description={message} />
    </div>
  );
}

/* ── Modal ───────────────────────────────────────────────────────────────────── */
export function TutorModal({
  open, onOpenChange,
  isLoading, review, errorMessage,
  improvedPromptValue, clarificationAnswers,
  onClarificationAnswerChange, onImprovedPromptChange,
  onRefineAgain, onRetry, onSendOriginal, onSendImproved, onCancel,
  onModeChange: _onModeChange,
  onWeaknessViewed, onWhyBetterViewed,
  onNextStepClicked: _onNextStepClicked,
  onHelpfulnessRated, onQuestionsSkipped,
}: TutorModalProps) {
  const { t } = useTranslation();
  const showLoading = isLoading || (!review && !errorMessage);
  const canSend = !!improvedPromptValue.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange} onCancel={onCancel}>
      <DialogContent className="w-[560px] max-w-[calc(100vw-2rem)] flex flex-col max-h-[90vh] p-0 gap-0 overflow-hidden">

        {/* Header */}
        <DialogHeader className="shrink-0 px-6 pt-5 pb-4 border-b border-gray-alpha-200">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/40">
              <Sparkles size={14} strokeWidth={2} className="text-blue-600" />
            </div>
            <DialogTitle className="text-[15px]">{t("tutor.title")}</DialogTitle>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {showLoading ? (
            <TutorLoadingBody />
          ) : errorMessage ? (
            <TutorErrorBody message={errorMessage || t("tutor.errorDescription")} />
          ) : review ? (
            <TutorReviewBody
              review={review}
              improvedPromptValue={improvedPromptValue}
              clarificationAnswers={clarificationAnswers}
              onClarificationAnswerChange={onClarificationAnswerChange}
              onImprovedPromptChange={onImprovedPromptChange}
              onRefineAgain={onRefineAgain}
              onWeaknessViewed={onWeaknessViewed}
              onWhyBetterViewed={onWhyBetterViewed}
              onHelpfulnessRated={onHelpfulnessRated}
              onQuestionsSkipped={onQuestionsSkipped}
            />
          ) : null}
        </div>

        {/* Footer */}
        {!showLoading && !errorMessage && (
          <DialogFooter className="shrink-0 border-t border-gray-alpha-200 px-6 py-4">
            <div className="flex items-center justify-between w-full">
              <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
                {t("tutor.close")}
              </Button>
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={onSendOriginal}>
                  {t("tutor.sendOriginal")}
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  leftIcon={<Send size={13} strokeWidth={2} />}
                  onClick={() => onSendImproved(improvedPromptValue)}
                  disabled={!canSend}
                >
                  {t("tutor.sendImproved")}
                </Button>
              </div>
            </div>
          </DialogFooter>
        )}

        {!showLoading && errorMessage && (
          <DialogFooter className="shrink-0 border-t border-gray-alpha-200 px-6 py-4">
            <div className="flex items-center justify-between w-full">
              <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
                {t("tutor.close")}
              </Button>
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={onSendOriginal}>
                  {t("tutor.sendOriginal")}
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  leftIcon={<RefreshCcw size={13} strokeWidth={2} />}
                  onClick={onRetry}
                >
                  {t("tutor.refineAgain")}
                </Button>
              </div>
            </div>
          </DialogFooter>
        )}

      </DialogContent>
    </Dialog>
  );
}
