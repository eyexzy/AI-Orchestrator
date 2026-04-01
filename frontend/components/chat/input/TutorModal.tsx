"use client";

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
import { Label } from "@/components/ui/label";
import { Note } from "@/components/ui/note";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/lib/store/i18nStore";
import { RefreshCcw, Send, Sparkles } from "lucide-react";

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
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wider text-ds-text-tertiary font-mono">
      {children}
    </h4>
  );
}

function BulletList({
  items,
  tone,
}: {
  items: string[];
  tone: "success" | "warning";
}) {
  const dotClassName = tone === "success" ? "bg-green-700" : "bg-amber-700";

  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex items-baseline gap-2">
          <span
            className={`relative top-[-1px] h-1.5 w-1.5 shrink-0 rounded-full ${dotClassName}`}
          />
          <span className="text-[13px] leading-5">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function TutorReviewBody({
  review,
  improvedPromptValue,
  clarificationAnswers,
  onClarificationAnswerChange,
  onImprovedPromptChange,
  onRefineAgain,
}: {
  review: TutorReview;
  improvedPromptValue: string;
  clarificationAnswers: Record<string, string>;
  onClarificationAnswerChange: (id: string, value: string) => void;
  onImprovedPromptChange: (value: string) => void;
  onRefineAgain: () => void;
}) {
  const { t } = useTranslation();
  const strengths = review.strengths.slice(0, 2);
  const gaps = review.gaps.slice(0, 2);
  const questions = review.clarifying_questions.slice(0, 3);

  return (
    <div className="px-6 py-5 space-y-5">
      {/* Notes section */}
      {(strengths.length > 0 || gaps.length > 0) && (
        <section className="space-y-3">
          <SectionLabel>{t("tutor.notes")}</SectionLabel>

          <div className="space-y-2.5">
            {strengths.length > 0 && (
              <Note variant="success" size="sm">
                <p className="text-[13px] font-semibold mb-2">{t("tutor.strengths")}</p>
                <BulletList items={strengths} tone="success" />
              </Note>
            )}

            {gaps.length > 0 && (
              <Note variant="warning" size="sm">
                <p className="text-[13px] font-semibold mb-2">{t("tutor.gaps")}</p>
                <BulletList items={gaps} tone="warning" />
              </Note>
            )}
          </div>
        </section>
      )}

      {/* Clarifying questions */}
      {questions.length > 0 && (
        <>
          <Separator />
          <section className="space-y-3">
            <SectionLabel>{t("tutor.questions")}</SectionLabel>

            <div className="space-y-2.5">
              {questions.map((question, index) => {
                const inputId = `tutor-${question.id}`;

                return (
                  <div
                    key={question.id}
                    className="rounded-lg bg-gray-alpha-100 shadow-[0_0_0_1px_var(--ds-gray-alpha-200)] px-4 py-3 space-y-2"
                  >
                    <Label
                      htmlFor={inputId}
                      className="block text-[13px] font-medium leading-5 text-ds-text"
                    >
                      <span className="mr-1.5 font-mono text-ds-text-tertiary">
                        {index + 1}.
                      </span>
                      {question.question}
                    </Label>

                    <Input
                      id={inputId}
                      variant="default"
                      size="md"
                      value={clarificationAnswers[question.id] ?? ""}
                      onChange={(event) =>
                        onClarificationAnswerChange(
                          question.id,
                          event.target.value,
                        )
                      }
                      placeholder={t("tutor.answerPlaceholder")}
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={<RefreshCcw size={14} strokeWidth={2} />}
                onClick={onRefineAgain}
              >
                {t("tutor.refineAgain")}
              </Button>
            </div>
          </section>
        </>
      )}

      {/* Improved prompt */}
      <Separator />
      <section className="space-y-3">
        <SectionLabel>{t("tutor.improvedPrompt")}</SectionLabel>

        <Textarea
          value={improvedPromptValue}
          onChange={(event) => onImprovedPromptChange(event.target.value)}
          placeholder={t("tutor.noImprovedPrompt")}
          variant="default"
          wrapperClassName="rounded-lg"
          textareaClassName="min-h-[120px] resize-none px-3 py-3 text-[14px] leading-relaxed"
        />
      </section>
    </div>
  );
}

function TutorLoadingBody() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-alpha-100 shadow-[0_0_0_1px_var(--ds-gray-alpha-200)]">
        <Sparkles
          size={16}
          strokeWidth={2}
          className="animate-pulse text-ds-text-tertiary"
        />
      </div>
      <p className="text-[14px] font-medium text-ds-text-secondary">
        {t("tutor.loading")}
      </p>
    </div>
  );
}

function TutorErrorBody({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <ErrorState
        centered
        title={t("tutor.errorTitle")}
        description={message}
        actionLabel={t("tutor.refineAgain")}
        onAction={onRetry}
      />
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
}: TutorModalProps) {
  const { t } = useTranslation();
  const showLoading = isLoading || (!review && !errorMessage);
  const canSendImproved = !!improvedPromptValue.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange} onCancel={onCancel}>
      <DialogContent className="w-[580px] max-w-[calc(100vw-2rem)]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-alpha-100 shadow-[0_0_0_1px_var(--ds-gray-alpha-200)]">
              <Sparkles
                size={16}
                strokeWidth={2}
                className="text-ds-text-secondary"
              />
            </div>
            <div>
              <DialogTitle>{t("tutor.title")}</DialogTitle>
              <DialogDescription>{t("tutor.description")}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="h-[460px] overflow-y-auto">
          {showLoading ? (
            <TutorLoadingBody />
          ) : errorMessage ? (
            <TutorErrorBody
              message={errorMessage || t("tutor.errorDescription")}
              onRetry={onRetry}
            />
          ) : review ? (
            <TutorReviewBody
              review={review}
              improvedPromptValue={improvedPromptValue}
              clarificationAnswers={clarificationAnswers}
              onClarificationAnswerChange={onClarificationAnswerChange}
              onImprovedPromptChange={onImprovedPromptChange}
              onRefineAgain={onRefineAgain}
            />
          ) : null}
        </div>

        {!showLoading && !errorMessage && (
          <DialogFooter>
            <div className="flex items-center justify-between w-full">
              <Button type="button" variant="secondary" onClick={onCancel}>
                {t("tutor.close")}
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onSendOriginal}
                >
                  {t("tutor.sendOriginal")}
                </Button>

                <Button
                  type="button"
                  variant="default"
                  leftIcon={<Send size={14} strokeWidth={2} />}
                  onClick={() => onSendImproved(improvedPromptValue)}
                  disabled={!canSendImproved}
                >
                  {t("tutor.sendImproved")}
                </Button>
              </div>
            </div>
          </DialogFooter>
        )}

        {!showLoading && errorMessage && (
          <DialogFooter>
            <div className="flex items-center justify-between w-full">
              <Button type="button" variant="secondary" onClick={onCancel}>
                {t("tutor.close")}
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onSendOriginal}
                >
                  {t("tutor.sendOriginal")}
                </Button>

                <Button
                  type="button"
                  variant="default"
                  leftIcon={<RefreshCcw size={14} strokeWidth={2} />}
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
