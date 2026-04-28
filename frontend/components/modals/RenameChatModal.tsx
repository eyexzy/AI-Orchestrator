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
          <DialogHeader withSeparator={false} className="px-6 pt-6 pb-2">
            <DialogTitle>{t("renameChat.title")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2 px-6 pb-4">
            <label className="block text-[13.5px] text-ds-text-secondary">
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

          <DialogFooter withSeparator={false} className="px-6 pt-1 pb-6">
            <div className="flex w-full items-center justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={handleClose} disabled={isSaving}>
                {t("renameChat.cancel")}
              </Button>
              <Button type="submit" variant="default" size="sm" disabled={!canSave}>
                {isSaving ? t("renameChat.saving") : t("renameChat.save")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
