"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/lib/store/i18nStore";
import { ThumbsDown, ThumbsUp } from "lucide-react";

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
  onWhyBetterViewed?: () => void;
  onNextStepClicked?: () => void;
  onHelpfulnessRated?: (rating: "like" | "dislike") => void;
  onQuestionsSkipped?: () => void;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[14px] font-medium leading-5 text-ds-text">
      {children}
    </p>
  );
}

function TutorRating({ onRate }: { onRate: (rating: "like" | "dislike") => void }) {
  const { t } = useTranslation();
  const [rated, setRated] = useState<"like" | "dislike" | null>(null);

  if (rated !== null) {
    return <span className="text-[13px] text-ds-text-tertiary">{t("tutor.ratedThanks")}</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] text-ds-text-tertiary">{t("tutor.rateHelpfulness")}</span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          iconOnly
          aria-label={t("msg.like")}
          className="text-ds-text-tertiary hover:text-ds-text"
          onClick={() => {
            setRated("like");
            onRate("like");
          }}
        >
          <ThumbsUp size={14} strokeWidth={2} />
        </Button>
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          iconOnly
          aria-label={t("msg.dislike")}
          className="text-ds-text-tertiary hover:text-ds-text"
          onClick={() => {
            setRated("dislike");
            onRate("dislike");
          }}
        >
          <ThumbsDown size={14} strokeWidth={2} />
        </Button>
      </div>
    </div>
  );
}

function TutorLoadingBody() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[260px] items-center justify-center px-6">
      <p className="text-[14px] leading-6 text-ds-text-secondary">{t("tutor.loading")}</p>
    </div>
  );
}

function TutorErrorBody({ message }: { message: string }) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[260px] items-center justify-center px-6 py-8">
      <ErrorState title={t("tutor.errorTitle")} description={message} />
    </div>
  );
}

function TutorReviewBody({
  review,
  improvedPromptValue,
  clarificationAnswers,
  onClarificationAnswerChange,
  onImprovedPromptChange,
  onRefineAgain,
  onWhyBetterViewed,
  onNextStepClicked,
  onHelpfulnessRated,
  onQuestionsSkipped,
}: {
  review: TutorReview;
  improvedPromptValue: string;
  clarificationAnswers: Record<string, string>;
  onClarificationAnswerChange: (id: string, value: string) => void;
  onImprovedPromptChange: (value: string) => void;
  onRefineAgain: () => void;
  onWhyBetterViewed?: () => void;
  onNextStepClicked?: () => void;
  onHelpfulnessRated?: (rating: "like" | "dislike") => void;
  onQuestionsSkipped?: () => void;
}) {
  const { t } = useTranslation();
  const [questionsSkipped, setQuestionsSkipped] = useState(false);
  const [whyViewed, setWhyViewed] = useState(false);
  const [nextStepViewed, setNextStepViewed] = useState(false);
  const questions = questionsSkipped ? [] : review.clarifying_questions.slice(0, 3);
  const gaps = review.gaps.slice(0, 2);
  const reasons = review.why_this_is_better.slice(0, 3);

  const handleWhyViewed = () => {
    if (whyViewed) return;
    setWhyViewed(true);
    onWhyBetterViewed?.();
  };

  const handleNextStepViewed = () => {
    if (nextStepViewed) return;
    setNextStepViewed(true);
    onNextStepClicked?.();
  };

  return (
    <div className="max-h-[65vh] overflow-y-auto">
      <div className="space-y-5 px-6 py-5">
        <section className="space-y-2">
          <SectionTitle>{t("tutor.notes")}</SectionTitle>
          <p className="text-[14px] leading-6 text-ds-text-secondary">
            {review.opening_message || t("tutor.description")}
          </p>
        </section>

        {gaps.length > 0 && (
          <>
            <Separator />
            <section className="space-y-3">
              <SectionTitle>{t("tutor.gaps")}</SectionTitle>
              <div className="space-y-2">
                {gaps.map((gap) => (
                  <div
                    key={gap}
                    className="rounded-[6px] border border-gray-alpha-200 bg-[var(--ds-background-100)] px-3 py-2.5 text-[14px] leading-6 text-ds-text-secondary"
                  >
                    {gap}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {questions.length > 0 && (
          <>
            <Separator />
            <section className="space-y-3">
              <SectionTitle>{t("tutor.questions")}</SectionTitle>
              <div className="space-y-3">
                {questions.map((question) => (
                  <div key={question.id} className="space-y-1.5">
                    <p className="text-[14px] leading-6 text-ds-text">{question.question}</p>
                    <Input
                      variant="default"
                      size="md"
                      value={clarificationAnswers[question.id] ?? ""}
                      onChange={(event) => onClarificationAnswerChange(question.id, event.target.value)}
                      placeholder={t("tutor.answerPlaceholder")}
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQuestionsSkipped(true);
                    onQuestionsSkipped?.();
                  }}
                >
                  {t("tutor.skipQuestions")}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={onRefineAgain}>
                  {t("tutor.refineAgain")}
                </Button>
              </div>
            </section>
          </>
        )}

        <Separator />
        <section className="space-y-2">
          <SectionTitle>{t("tutor.improvedPrompt")}</SectionTitle>
          <Textarea
            value={improvedPromptValue}
            onChange={(event) => onImprovedPromptChange(event.target.value)}
            placeholder={t("tutor.noImprovedPrompt")}
            variant="default"
            textareaClassName="min-h-[150px] resize-none px-3 py-3 text-[14px] leading-6"
          />
        </section>

        {(reasons.length > 0 || review.next_step) && (
          <>
            <Separator />
            <section className="space-y-3">
              {reasons.length > 0 && (
                <div className="space-y-2" onMouseEnter={handleWhyViewed}>
                  <SectionTitle>{t("tutor.whyBetter")}</SectionTitle>
                  <ul className="space-y-1.5">
                    {reasons.map((reason) => (
                      <li
                        key={reason}
                        className="text-[14px] leading-6 text-ds-text-secondary"
                      >
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {review.next_step && (
                <div className="space-y-2">
                  <SectionTitle>{t("tutor.takeaway")}</SectionTitle>
                  <p
                    className="text-[14px] leading-6 text-ds-text-secondary"
                    onMouseEnter={handleNextStepViewed}
                  >
                    {review.next_step}
                  </p>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {onHelpfulnessRated && (
        <>
          <Separator />
          <div className="flex justify-end px-6 py-3">
            <TutorRating onRate={onHelpfulnessRated} />
          </div>
        </>
      )}
    </div>
  );
}

export function TutorModal({
  open,
  onOpenChange,
  isLoading,
  review,
  errorMessage,
  improvedPromptValue,
  clarificationAnswers,
  onClarificationAnswerChange,
  onImprovedPromptChange,
  onRefineAgain,
  onRetry,
  onSendOriginal,
  onSendImproved,
  onCancel,
  onModeChange: _onModeChange,
  onWhyBetterViewed,
  onNextStepClicked,
  onHelpfulnessRated,
  onQuestionsSkipped,
}: TutorModalProps) {
  const { t } = useTranslation();
  const showLoading = isLoading || (!review && !errorMessage);
  const canSend = improvedPromptValue.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} onCancel={onCancel}>
      <DialogContent className="flex max-h-[90vh] max-w-xl flex-col p-0">
        <DialogHeader>
          <DialogTitle>{t("tutor.title")}</DialogTitle>
          <DialogDescription>{t("tutor.description")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden">
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
              onWhyBetterViewed={onWhyBetterViewed}
              onNextStepClicked={onNextStepClicked}
              onHelpfulnessRated={onHelpfulnessRated}
              onQuestionsSkipped={onQuestionsSkipped}
            />
          ) : null}
        </div>

        {!showLoading && !errorMessage && (
          <DialogFooter>
            <div className="flex w-full items-center justify-between">
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
          <DialogFooter>
            <div className="flex w-full items-center justify-between">
              <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
                {t("tutor.close")}
              </Button>
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={onSendOriginal}>
                  {t("tutor.sendOriginal")}
                </Button>
                <Button type="button" variant="default" size="sm" onClick={onRetry}>
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
