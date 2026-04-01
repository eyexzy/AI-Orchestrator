"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Frown, Meh, Smile, ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@/lib/store/i18nStore";
import { getErrorMessage } from "@/lib/request";
import { useUserLevelStore } from "@/lib/store/userLevelStore";

export function FeedbackModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const level = useUserLevelStore((s) => s.level);
  const sessionId = useUserLevelStore((s) => s.sessionId);

  const [mood, setMood] = useState<"sad" | "neutral" | "smile" | null>(null);
  const [text, setText] = useState("");
  const [levelAgree, setLevelAgree] = useState<"agree" | "disagree" | null>(null);
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim() && !mood && !levelAgree) return;

    setSending(true);
    try {
      const promises: Promise<Response>[] = [];

      // 1) Product feedback — mood + text → dedicated table, NOT ml_feedback
      if (text.trim() || mood) {
        promises.push(
          fetch("/api/product-feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mood,
              feedback_text: text.trim(),
              session_id: sessionId,
            }),
          }),
        );
      }

      // 2) Adaptation feedback — explicit label for the adaptation engine
      if (levelAgree) {
        promises.push(
          fetch("/api/adaptation-feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session_id: sessionId,
              ui_level_at_time: level,
              question_type: "periodic_level_check",
              answer_value: levelAgree,
              feature_snapshot: {},
            }),
          }),
        );
      }

      const results = await Promise.all(promises);
      for (const res of results) {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? `HTTP ${res.status}`);
        }
      }

      toast.success(t("feedback.success"));
      setText("");
      setMood(null);
      setLevelAgree(null);
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, t("feedback.error")));
    } finally {
      setSending(false);
    }
  };

  const handleCancel = () => {
    setText("");
    setMood(null);
    setLevelAgree(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} onCancel={handleCancel}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader className="pb-4">
          <DialogTitle>{t("feedback.title")}</DialogTitle>
          <DialogDescription>{t("feedback.description")}</DialogDescription>
        </DialogHeader>

        <div className="p-6 pt-2 pb-4 space-y-4">
          <Textarea
            variant="default"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("feedback.placeholder")}
            rows={4}
            wrapperClassName="rounded-xl"
            textareaClassName="min-h-[120px] resize-none p-3 text-[14px]"
          />

          {/* Level agreement — adaptation feedback */}
          <div className="flex items-center justify-between rounded-lg border border-gray-alpha-200 px-3 py-2">
            <span className="text-[13px] text-ds-text-secondary">
              {t("feedback.levelQuestion")}
            </span>
            <div className="flex items-center gap-1 rounded-full border border-gray-alpha-200 bg-gray-alpha-100 p-0.5">
              {[
                { id: "agree" as const, icon: ThumbsUp },
                { id: "disagree" as const, icon: ThumbsDown },
              ].map(({ id, icon: Icon }) => (
                <Button
                  key={id}
                  type="button"
                  variant="tertiary"
                  size="sm"
                  iconOnly
                  leftIcon={<Icon size={14} strokeWidth={2} />}
                  onClick={() => setLevelAgree(levelAgree === id ? null : id)}
                  className={`h-7 w-7 rounded-full p-0 shadow-none ${
                    levelAgree === id
                      ? "bg-background shadow-sm text-ds-text"
                      : "text-ds-text-tertiary hover:text-ds-text-secondary hover:bg-gray-alpha-200"
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 rounded-full border border-gray-alpha-200 bg-gray-alpha-100 p-1">
              {[
                { id: "sad", icon: Frown },
                { id: "neutral", icon: Meh },
                { id: "smile", icon: Smile },
              ].map(({ id, icon: Icon }) => (
                <Button
                  key={id}
                  type="button"
                  variant="tertiary"
                  size="sm"
                  iconOnly
                  leftIcon={<Icon size={16} strokeWidth={2} />}
                  onClick={() => setMood(id as "sad" | "neutral" | "smile")}
                  className={`h-8 w-8 rounded-full p-0 shadow-none ${
                    mood === id
                      ? "bg-background shadow-sm text-ds-text"
                      : "text-ds-text-tertiary hover:text-ds-text-secondary hover:bg-gray-alpha-200"
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={handleCancel}>
                {t("feedback.cancel")}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleSubmit}
                disabled={(!text.trim() && !mood && !levelAgree) || sending}
                isLoading={sending}
              >
                {t("feedback.submit")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
