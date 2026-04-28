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

interface ConfirmActionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  isSubmitting?: boolean;
  onConfirm: () => Promise<void> | void;
}

export function ConfirmActionModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  isSubmitting = false,
  onConfirm,
}: ConfirmActionModalProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader withSeparator={false} className="px-6 pt-6 pb-2">
          <DialogTitle>
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-5">
          <DialogDescription>
            {description}
          </DialogDescription>
        </div>

        <DialogFooter
          withSeparator={false}
          className="flex justify-end gap-2 px-6 pt-0 pb-6"
        >
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t("settings.cancel")}
          </Button>
          <Button
            type="button"
            variant="error"
            size="sm"
            isLoading={isSubmitting}
            disabled={isSubmitting}
            onClick={() => {
              void onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
