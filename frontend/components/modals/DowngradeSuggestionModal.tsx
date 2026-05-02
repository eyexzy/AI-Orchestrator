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
import { useTranslation } from "@/lib/store/i18nStore";
import type { UserLevel } from "@/lib/store/userLevelStore";

interface DowngradeSuggestionModalProps {
  open: boolean;
  fromLevel?: UserLevel;
  toLevel?: UserLevel;
  onKeepCurrent: () => void;
  onAccept: () => void;
}

export function DowngradeSuggestionModal({
  open,
  fromLevel: _fromLevel = 3,
  toLevel = 2,
  onKeepCurrent,
  onAccept,
}: DowngradeSuggestionModalProps) {
  const { t } = useTranslation();
  const target = toLevel === 1 ? "guided" : "constructor";

  return (
    <Dialog open={open} dismissible={false}>
      <DialogContent className="max-w-[500px]">
        <DialogHeader withSeparator={false} className="px-6 pb-5 pt-6">
          <DialogTitle>{t(`downgradeSuggestion.${target}.title`)}</DialogTitle>
          <DialogDescription>
            {t(`downgradeSuggestion.${target}.description`)}
          </DialogDescription>
          <p className="mt-2 text-[13px] leading-5 text-ds-text-tertiary">
            {t("downgradeSuggestion.note")}
          </p>
        </DialogHeader>

        <DialogFooter withSeparator={false} className="flex justify-end gap-2 px-6 pb-6 pt-0">
          <Button type="button" variant="secondary" size="sm" onClick={onKeepCurrent}>
            {t("downgradeSuggestion.keep")}
          </Button>
          <Button type="button" variant="default" size="sm" onClick={onAccept}>
            {t(`downgradeSuggestion.${target}.accept`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
