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

interface DeleteAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string | null;
  isSubmitting: boolean;
  onConfirm: () => Promise<void> | void;
}

export function DeleteAccountModal({
  open,
  onOpenChange,
  email,
  isSubmitting,
  onConfirm,
}: DeleteAccountModalProps) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const matches = Boolean(email) && typed.trim().toLowerCase() === (email ?? "").toLowerCase();

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
              {t("settings.deleteAccountConfirmTitle")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 px-6 pb-4">
            <DialogDescription>
              {t("settings.deleteAccountConfirmDescription")}
            </DialogDescription>

            <div className="space-y-2">
              <label className="text-[13.5px] text-ds-text-tertiary">
                {t("settings.deleteAccountTypeHint")}
              </label>
              <Input
                variant="default"
                size="md"
                value={typed}
                autoFocus
                placeholder={email ?? ""}
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
                {t("settings.deleteAccountAction")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
