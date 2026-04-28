"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/store/i18nStore";
import type { FormEvent } from "react";

interface DeleteAllChatsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatCount: number;
  isSubmitting: boolean;
  onConfirm: () => Promise<void> | void;
}

export function DeleteAllChatsModal({
  open,
  onOpenChange,
  chatCount,
  isSubmitting,
  onConfirm,
}: DeleteAllChatsModalProps) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");
  const keyword = t("settings.deleteChatsTypeKeyword");
  const matches = typed.trim().toLowerCase() === keyword.toLowerCase();

  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const description = t("settings.deleteChatsConfirmDescription").replace(
    "{count}",
    String(chatCount),
  );
  const hint = t("settings.deleteChatsTypeHint").replace("{keyword}", keyword);

  const handleClose = () => {
    if (isSubmitting) return;
    onOpenChange(false);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!matches || isSubmitting) return;
    void onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} onCancel={handleClose}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader withSeparator={false} className="px-6 pt-6 pb-3">
            <DialogTitle>
              {t("settings.deleteChatsConfirmTitle")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 px-6 pb-4">
            <DialogDescription>
              {description}
            </DialogDescription>

            <div className="space-y-2">
              <label className="text-[13.5px] text-ds-text-tertiary">{hint}</label>
              <Input
                variant="default"
                size="md"
                value={typed}
                autoFocus
                placeholder={keyword}
                onChange={(event) => setTyped(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter withSeparator={false} className="px-6 pt-1 pb-6">
            <div className="flex w-full items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                {t("settings.cancel")}
              </Button>
              <Button
                type="submit"
                variant="error"
                size="sm"
                isLoading={isSubmitting}
                disabled={!matches || isSubmitting}
              >
                {t("settings.deleteChatsAction")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
