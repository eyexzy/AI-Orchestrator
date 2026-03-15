"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/store/i18nStore";

interface RenameChatModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTitle: string;
  onSave: (title: string) => Promise<void> | void;
}

export function RenameChatModal({
  open,
  onOpenChange,
  initialTitle,
  onSave,
}: RenameChatModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialTitle);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle);
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, initialTitle]);

  const normalizedInitial = useMemo(() => initialTitle.trim(), [initialTitle]);
  const normalizedTitle = title.trim();
  const canSave = normalizedTitle.length > 0 && normalizedTitle !== normalizedInitial && !isSaving;

  const handleClose = () => {
    if (isSaving) return;
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setIsSaving(true);
    try {
      await onSave(normalizedTitle);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} onCancel={handleClose}>
      <DialogContent className="max-w-[540px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("renameChat.title")}</DialogTitle>
          </DialogHeader>

          <div className="px-6 py-4">
            <label className="mb-1.5 block text-[13px] font-medium text-ds-text">
              {t("renameChat.label")}
            </label>
            <Input
              ref={inputRef}
              variant="default"
              size="md"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("renameChat.placeholder")}
              maxLength={255}
              inputClassName="text-[14px]"
            />
          </div>

          <DialogFooter>
            <div className="flex w-full items-center justify-end gap-2">
              <Button type="button" variant="secondary" onClick={handleClose} disabled={isSaving}>
                {t("renameChat.cancel")}
              </Button>
              <Button type="submit" variant="default" disabled={!canSave}>
                {isSaving ? t("renameChat.saving") : t("renameChat.save")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}