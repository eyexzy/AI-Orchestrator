"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProjectIconPicker } from "@/components/projects/ProjectIconPicker";
import {
  getProjectColor,
  getProjectIconName,
} from "@/components/projects/projectTheme";
import { useTranslation } from "@/lib/store/i18nStore";
import type { ProjectDraft } from "@/lib/store/projectStore";

interface ProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initialName?: string;
  initialDescription?: string;
  initialAccentColor?: string;
  initialIconName?: string;
  initialSystemHint?: string;
  onSave: (payload: ProjectDraft) => Promise<void> | void;
}

export function ProjectModal({
  open,
  onOpenChange,
  mode,
  initialName = "",
  initialDescription = "",
  initialAccentColor = "blue",
  initialIconName = "folder",
  initialSystemHint = "",
  onSave,
}: ProjectModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [accentColor, setAccentColor] = useState(getProjectColor(initialAccentColor));
  const [iconName, setIconName] = useState(getProjectIconName(initialIconName));
  const [systemHint, setSystemHint] = useState(initialSystemHint);
  const [isSaving, setIsSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setDescription(initialDescription);
    setAccentColor(getProjectColor(initialAccentColor));
    setIconName(getProjectIconName(initialIconName));
    setSystemHint(initialSystemHint);
    const timeoutId = window.setTimeout(() => {
      nameRef.current?.focus();
      nameRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [initialAccentColor, initialDescription, initialIconName, initialName, initialSystemHint, open]);

  const normalizedName = name.trim();
  const normalizedDescription = description.trim();
  const normalizedSystemHint = systemHint.trim();

  const canSave = useMemo(() => {
    if (!normalizedName || isSaving) return false;
    if (mode === "create") return true;
    return (
      normalizedName !== initialName.trim()
      || normalizedDescription !== initialDescription.trim()
      || accentColor !== getProjectColor(initialAccentColor)
      || iconName !== getProjectIconName(initialIconName)
      || normalizedSystemHint !== initialSystemHint.trim()
    );
  }, [
    accentColor,
    iconName,
    initialAccentColor,
    initialDescription,
    initialIconName,
    initialName,
    initialSystemHint,
    isSaving,
    mode,
    normalizedDescription,
    normalizedName,
    normalizedSystemHint,
  ]);

  const handleClose = () => {
    if (isSaving) return;
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setIsSaving(true);
    try {
      await onSave({
        name: normalizedName,
        description: normalizedDescription,
        accent_color: accentColor,
        icon_name: iconName,
        system_hint: normalizedSystemHint,
      });
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
            <DialogTitle>
              {mode === "create" ? t("projects.createTitle") : t("projects.editTitle")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 px-6 py-4">
            <div className="space-y-1.5">
              <label className="mb-1.5 block text-[13.5px] font-medium text-ds-text">
                {t("projects.nameLabel")}
              </label>
              <div className="flex items-center gap-3">
                <ProjectIconPicker
                  iconName={iconName}
                  color={accentColor}
                  onIconChange={setIconName}
                  onColorChange={setAccentColor}
                  disabled={isSaving}
                  variant="ghost"
                  size="md"
                  iconSize={18}
                  ariaLabel={t("projects.chooseIcon")}
                />
                <Input
                  ref={nameRef}
                  variant="default"
                  size="md"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("projects.namePlaceholder")}
                  maxLength={255}
                  className="flex-1"
                  inputClassName="text-[14px]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[13.5px] font-medium text-ds-text">
                {t("projects.descriptionLabel")}
              </label>
              <Textarea
                variant="default"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                wrapperClassName="rounded-xl"
                textareaClassName="min-h-[72px] resize-none p-3 text-[14px]"
                placeholder={t("projects.descriptionPlaceholder")}
                maxLength={2000}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[13.5px] font-medium text-ds-text">
                {t("projects.instructionsLabel")}
              </label>
              <p className="text-[13px] leading-5 text-ds-text-tertiary">
                {t("projects.instructionsModalHint")}
              </p>
              <Textarea
                variant="default"
                value={systemHint}
                onChange={(e) => setSystemHint(e.target.value)}
                rows={5}
                wrapperClassName="rounded-xl"
                textareaClassName="min-h-[140px] resize-none p-3 text-[14px]"
                placeholder={t("projects.instructionsPlaceholder")}
                maxLength={4000}
              />
            </div>
          </div>

          <DialogFooter>
            <div className="flex w-full items-center justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={handleClose} disabled={isSaving}>
                {t("projects.cancel")}
              </Button>
              <Button type="submit" variant="default" size="sm" disabled={!canSave}>
                {isSaving
                  ? t("projects.saving")
                  : mode === "create"
                    ? t("projects.create")
                    : t("projects.update")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
