"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Frown, Meh, Smile } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@/lib/store/i18nStore";

export function FeedbackModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const [mood, setMood] = useState<"sad" | "neutral" | "smile" | null>(null);
  const [text, setText] = useState("");

  const handleSubmit = () => {
    toast.success(t("feedback.success") ?? "Feedback sent! (UI Dummy)");
    setText("");
    setMood(null);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setText("");
    setMood(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} onCancel={handleCancel}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader className="pb-4">
          <DialogTitle>{t("feedback.title")}</DialogTitle>
          <DialogDescription>{t("feedback.description")}</DialogDescription>
        </DialogHeader>
        
        <div className="p-6 pt-2 pb-4">
          <Textarea
            variant="default"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("feedback.placeholder")}
            rows={4}
            wrapperClassName="rounded-xl"
            textareaClassName="min-h-[120px] resize-none p-3 text-[14px]"
          />
          
          <div className="mt-4 flex items-center justify-between">
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
                  onClick={() => setMood(id as any)}
                  className={`h-8 w-8 rounded-full p-0 shadow-none ${
                    mood === id 
                      ? "bg-background shadow-sm text-ds-text" 
                      : "text-ds-text-tertiary hover:text-ds-text-secondary hover:bg-gray-alpha-200"
                  }`}
                >
                </Button>
              ))}
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={handleCancel}>
                {t("feedback.cancel")}
              </Button>
              <Button variant="default" size="sm" onClick={handleSubmit} disabled={!text.trim() && !mood}>
                {t("feedback.submit")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}