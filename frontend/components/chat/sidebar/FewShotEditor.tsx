"use client";

import { useState, useRef } from "react";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Material } from "@/components/ui/material";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useTranslation } from "@/lib/store/i18nStore";
import type { FewShotExample } from "./config";

function FewShotCard({
  ex,
  index,
  onEdit,
  onDelete,
}: {
  ex: FewShotExample;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const dotsRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Material
      className="group relative flex w-full cursor-default flex-col px-3.5 py-3 text-left shadow-geist-sm hover:bg-gray-alpha-200"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[14px] font-semibold leading-snug text-ds-text">
          {t("config.fewShotExample")} {index + 1}
        </span>
        <button
          ref={dotsRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-0 bg-transparent p-0 leading-none text-ds-text-tertiary hover:bg-gray-alpha-300 hover:text-ds-text -mr-1 ${
            menuOpen ? "opacity-100" : "opacity-0 transition-opacity group-hover:opacity-100"
          }`}
          aria-label={t("fewShotEditor.exampleActions")}
        >
          <MoreHorizontal size={14} strokeWidth={2} />
        </button>
      </div>

      <div className="flex flex-col gap-2 leading-relaxed">
        {ex.input ? (
          <div className="flex items-start gap-2">
            <Badge variant="blue-subtle" size="sm" className="mt-0.5 shrink-0 text-[10px] font-medium">
              {t("config.fewShotInputLabel")}
            </Badge>
            <span className="line-clamp-1 break-all text-[12px] text-ds-text-secondary mt-0.5">
              {ex.input}
            </span>
          </div>
        ) : null}
        <div className="flex items-start gap-2">
          <Badge variant="green-subtle" size="sm" className="mt-0.5 shrink-0 text-[10px] font-medium">
            {t("config.fewShotOutputLabel")}
          </Badge>
          <span className="line-clamp-1 break-all text-[12px] text-ds-text-secondary mt-0.5">
            {ex.output || <span className="italic opacity-50">{t("fewShotEditor.empty")}</span>}
          </span>
        </div>
      </div>

      {menuOpen && (
        <ActionMenu
          align="end"
          anchorEl={dotsRef.current}
          onClose={() => setMenuOpen(false)}
          items={[
            { label: t("config.fewShotEdit"), icon: <Pencil size={14} />, onClick: onEdit },
            { label: t("config.fewShotDelete"), icon: <Trash2 size={14} />, onClick: onDelete, variant: "danger" },
          ]}
        />
      )}
    </Material>
  );
}

export function FewShotEditor({
  examples,
  onChange,
}: {
  examples: FewShotExample[];
  onChange: (v: FewShotExample[]) => void;
}) {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftInput, setDraftInput] = useState("");
  const [draftOutput, setDraftOutput] = useState("");

  const openCreate = () => {
    setDraftInput("");
    setDraftOutput("");
    setEditingIndex(null);
    setIsModalOpen(true);
  };

  const openEdit = (idx: number) => {
    setDraftInput(examples[idx].input);
    setDraftOutput(examples[idx].output);
    setEditingIndex(idx);
    setIsModalOpen(true);
  };

  const removeExample = (idx: number) => {
    onChange(examples.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    if (!draftOutput.trim()) return;

    if (editingIndex !== null) {
      onChange(
        examples.map((ex, i) =>
          i === editingIndex ? { input: draftInput, output: draftOutput } : ex
        )
      );
    } else {
      onChange([...examples, { input: draftInput, output: draftOutput }]);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="w-full space-y-3">
      {examples.length === 0 ? (
        <Material className="flex w-full flex-col gap-1 p-4 text-center shadow-geist-sm">
          <p className="text-[13px] font-semibold text-ds-text-secondary">
            {t("config.fewShotEmptyTitle")}
          </p>
          <p className="text-[11px] leading-relaxed text-ds-text-tertiary">
            {t("config.fewShotEmptyDescription")}
          </p>
        </Material>
      ) : (
        <div className="flex w-full flex-col gap-2">
          {examples.map((ex, idx) => (
            <FewShotCard
              key={idx}
              ex={ex}
              index={idx}
              onEdit={() => openEdit(idx)}
              onDelete={() => removeExample(idx)}
            />
          ))}
        </div>
      )}

      <Button
        variant="secondary"
        size="sm"
        className="w-full"
        onClick={openCreate}
        leftIcon={<Plus size={14} strokeWidth={2} />}
      >
        {t("config.fewShotAddExample")}
      </Button>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingIndex !== null ? t("fewShotEditor.editExample") : t("fewShotEditor.newExample")}
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
                <p className="text-[13px] font-medium text-ds-text">
                  {t("config.fewShotInputLabel")}
                </p>
              <Textarea
                value={draftInput}
                onChange={(e) => setDraftInput(e.target.value)}
                placeholder={t("config.fewShotInputPlaceholder")}
                className="min-h-[100px] font-mono text-[13px] leading-relaxed"
              />
            </div>

            <div className="space-y-2">
                <p className="text-[13px] font-medium text-ds-text">
                  {t("config.fewShotOutputLabel")}
                </p>
              <Textarea
                value={draftOutput}
                onChange={(e) => setDraftOutput(e.target.value)}
                placeholder={t("config.fewShotOutputPlaceholder")}
                className="min-h-[160px] font-mono text-[13px] leading-relaxed"
              />
            </div>
          </div>

          <DialogFooter>
            <div className="flex items-center justify-end w-full gap-2">
              <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
                {t("fewShotEditor.cancel")}
              </Button>
              <Button
                variant="default"
                onClick={handleSave}
                disabled={!draftOutput.trim()}
              >
                {t("fewShotEditor.saveExample")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}