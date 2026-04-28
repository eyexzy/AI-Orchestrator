"use client";

import { useState, useMemo, useRef } from "react";
import { Pencil, Trash2, Plus, ArrowLeft, Star, GripVertical, Search, MoreHorizontal, ArrowUpDown, FileText } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TemplateCardContent, TEMPLATE_BADGE_VARIANTS, getTemplateBadgeVariant } from "./TemplateCard";
import { useTemplatesStore, getMergedTemplates, isVirtualTemplate, type PromptTemplate } from "@/lib/store/templatesStore";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { useTranslation } from "@/lib/store/i18nStore";
import { Material } from "@/components/ui/material";
import { ActionMenu } from "@/components/ui/action-menu";

/* Color palette */
const COLOR_OPTIONS = [
  "gray", "blue", "purple", "pink", "red", "amber", "green", "teal",
] as const;

const COLOR_BG: Record<string, string> = {
  gray: "bg-black dark:bg-white shadow-[0_0_0_1px_var(--ds-gray-alpha-400)]",
  blue: "bg-blue-700",
  purple: "bg-purple-700",
  pink: "bg-pink-700",
  red: "bg-red-700",
  amber: "bg-amber-700",
  green: "bg-green-700",
  teal: "bg-teal-700",
};

const COLOR_RING: Record<string, string> = {
  gray: "ring-black dark:ring-white",
  blue: "ring-blue-700",
  purple: "ring-purple-700",
  pink: "ring-pink-700",
  red: "ring-red-700",
  amber: "ring-amber-700",
  green: "ring-green-700",
  teal: "ring-teal-700",
};



function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {COLOR_OPTIONS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`h-6 w-6 shrink-0 rounded-full transition-all ${COLOR_BG[c]} ${value === c
            ? `ring-2 ring-offset-2 ring-offset-background ${COLOR_RING[c]}`
            : "hover:ring-1 hover:ring-gray-alpha-400 hover:ring-offset-1 hover:ring-offset-background"
            }`}
          aria-label={c}
        ></button>
      ))}
    </div>
  );
}

/* Form state */
interface FormState {
  title: string;
  description: string;
  category_name: string;
  category_color: string;
  prompt: string;
  system_message: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  category_name: "",
  category_color: "blue",
  prompt: "",
  system_message: "",
};

function formFromTemplate(tpl: PromptTemplate): FormState {
  return {
    title: tpl.title,
    description: tpl.description,
    category_name: tpl.category_name,
    category_color: tpl.category_color,
    prompt: tpl.prompt,
    system_message: tpl.system_message,
  };
}

// Same extraction logic as ChatLayout (supports escaped \{{var}} and overlapping matches).
const VAR_REGEX = /(^|[^\\])\{\{([^{}]+)\}\}/g;

function extractVariableNames(...texts: string[]): string[] {
  const seen = new Set<string>();
  for (const text of texts) {
    let match: RegExpExecArray | null;
    VAR_REGEX.lastIndex = 0;
    while ((match = VAR_REGEX.exec(text)) !== null) {
      const name = match[2].trim();
      if (name) seen.add(name);
      VAR_REGEX.lastIndex = match.index + match[0].length - 1;
    }
  }
  return Array.from(seen);
}

/* Field helpers */
const labelCls = "block text-[13px] font-medium text-ds-text mb-1.5";
const textareaCls = "min-h-[80px] font-mono text-xs leading-relaxed";

/* Sortable template item */
function SortableTemplateItem({
  tpl,
  reorderMode,
  onEdit,
  onDelete,
  onToggleFavorite,
}: {
  tpl: PromptTemplate;
  reorderMode: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tpl.id, disabled: !reorderMode });

  const dotsRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <Material
      variant="base"
      ref={setNodeRef as React.Ref<HTMLDivElement>}
      style={style}
      className={`group flex items-center gap-3 px-4 py-3 ${isDragging ? "opacity-50" : "hover:bg-gray-alpha-200"}`}
    >
      {/* Drag handle вЂ” only in reorder mode */}
      {reorderMode && (
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          iconOnly
          className="shrink-0 cursor-grab text-ds-text-tertiary hover:bg-gray-alpha-200 hover:text-ds-text active:cursor-grabbing shadow-none"
          {...attributes}
          {...listeners}
          aria-label={t("templateManager.dragToReorder")}
          leftIcon={<GripVertical size={16} strokeWidth={1.5} />}
        />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <TemplateCardContent tpl={tpl} />
      </div>

      {/* Actions вЂ” hidden in reorder mode */}
      {!reorderMode && (
        <div className="shrink-0">
          <Button
            ref={dotsRef}
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            variant="tertiary"
            size="sm"
            iconOnly
            className="opacity-0 transition-all group-hover:opacity-100 text-ds-text-tertiary hover:bg-gray-alpha-200 hover:text-ds-text shadow-none"
            aria-label={t("templateManager.templateActions")}
            leftIcon={<MoreHorizontal size={16} strokeWidth={2} />}
          />
          {menuOpen && (
            <ActionMenu
              align="end"
              anchorEl={dotsRef.current}
              onClose={() => setMenuOpen(false)}
              items={[
                {
                  label: tpl.is_favorite ? t("templateManager.unstar") : t("templateManager.star"),
                  icon: <Star size={14} strokeWidth={2} fill={tpl.is_favorite ? "currentColor" : "none"} />,
                  onClick: onToggleFavorite,
                },
                {
                  label: t("templateManager.editTemplate"),
                  icon: <Pencil size={14} strokeWidth={2} />,
                  onClick: onEdit,
                },
                {
                  label: t("sidebar.delete"),
                  icon: <Trash2 size={14} strokeWidth={2} />,
                  onClick: onDelete,
                  confirm: {
                    title: t("confirm.deleteTemplateTitle"),
                    description: t("confirm.deleteTemplateDescription"),
                    actionLabel: t("sidebar.delete"),
                  },
                  variant: "danger",
                },
              ]}
            />
          )}
        </div>
      )}
    </Material>
  );
}

/* Modal */
interface TemplateManagerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TemplateManagerModal({ open, onOpenChange }: TemplateManagerModalProps) {
  const { t, language } = useTranslation();
  const {
    templates: customTemplates, createTemplate, updateTemplate,
    deleteTemplate, reorderTemplates, toggleFavorite,
  } = useTemplatesStore();

  const level = useUserLevelStore((s) => s.level);
  const hiddenTemplates = useUserLevelStore((s) => s.hiddenTemplates);
  const hideTemplate = useUserLevelStore((s) => s.hideTemplate);

  const [view, setView] = useState<"list" | "edit">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [reorderMode, setReorderMode] = useState(false);

  /* DnD sensors */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /* Merged virtual + custom templates */
  const templates = useMemo(
    () => getMergedTemplates(customTemplates, level, language, hiddenTemplates),
    [customTemplates, level, language, hiddenTemplates],
  );

  /* Filtered templates */
  const filteredTemplates = useMemo(() => {
    if (!searchQuery.trim()) return templates;
    const q = searchQuery.toLowerCase();
    return templates.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category_name.toLowerCase().includes(q),
    );
  }, [templates, searchQuery]);

  const resetToList = () => {
    setView("list");
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setView("edit");
  };

  const openEdit = (tpl: PromptTemplate) => {
    setEditingId(tpl.id);
    setForm(formFromTemplate(tpl));
    setView("edit");
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.prompt.trim()) return;
    setSaving(true);

    const variables = extractVariableNames(form.prompt, form.system_message);

    const payload = {
      title: form.title,
      description: form.description,
      category_name: form.category_name,
      category_color: form.category_color,
      prompt: form.prompt,
      system_message: form.system_message,
      variables,
      is_favorite: editingId
        ? (templates.find((t) => t.id === editingId)?.is_favorite ?? false)
        : false,
      order_index: editingId
        ? (templates.find((t) => t.id === editingId)?.order_index ?? 0)
        : customTemplates.length,
    };

    if (editingId && isVirtualTemplate(editingId)) {
      // Fork: create a new custom template and hide the virtual original
      await createTemplate(payload);
      await hideTemplate(editingId);
    } else if (editingId) {
      await updateTemplate(editingId, payload);
    } else {
      await createTemplate(payload);
    }

    setSaving(false);
    resetToList();
  };

  const handleDelete = async (id: string) => {
    if (isVirtualTemplate(id)) {
      await hideTemplate(id);
    } else {
      await deleteTemplate(id);
    }
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      resetToList();
      setSearchQuery("");
      setReorderMode(false);
    }
    onOpenChange(v);
  };

  /* All templates are reorderable */
  const reorderableTemplates = useMemo(
    () => filteredTemplates,
    [filteredTemplates],
  );

  const sortableIds = useMemo(
    () => reorderableTemplates.map((t) => t.id),
    [reorderableTemplates],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = reorderableTemplates.findIndex((t) => t.id === active.id);
    const newIndex = reorderableTemplates.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...reorderableTemplates];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    const items = reordered.map((t, i) => ({ id: t.id, order_index: i }));
    reorderTemplates(items);
  };

  const setField = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        {/* List View */}
        {view === "list" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("templateManager.title")}</DialogTitle>
            </DialogHeader>

            <div className="px-5 py-3 space-y-3 h-[480px] overflow-y-auto flex flex-col">
              {/* Top controls: Search & Reorder Toggle */}
              <div className="flex items-center gap-2 mb-4">
                {!reorderMode ? (
                  <>
                    <div className="flex-1">
                      <Input
                        type="search"
                        variant="default"
                        size="md"
                        leftIcon={<Search size={16} strokeWidth={2} className="text-ds-text-tertiary" />}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t("templateManager.searchPlaceholder")}
                        inputClassName="text-[15px]"
                      />
                    </div>
                    <Button
                      variant="tertiary"
                      size="md"
                      iconOnly
                      className="group"
                      onClick={() => {
                        setSearchQuery("");
                        setReorderMode(true);
                      }}
                      title={t("templateManager.reorder")}
                    >
                      <ArrowUpDown size={18} strokeWidth={2} className="text-ds-text-secondary transition-colors group-hover:text-ds-text" />
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 pl-1">
                      <p className="text-[14px] text-ds-text-secondary font-medium">
                        {t("templateManager.dragToReorder")}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() => {
                        setReorderMode(false);
                        setSearchQuery("");
                      }}
                    >
                      {t("templateManager.done")}
                    </Button>
                  </>
                )}
              </div>

              {/* Template lists */}
              {filteredTemplates.length === 0 && (
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-center text-sm text-ds-text-tertiary">
                    {searchQuery.trim()
                      ? `${t("templateManager.noResultsDesc")} "${searchQuery}".`
                      : t("templateManager.noTemplatesDesc")}
                  </p>
                </div>
              )}

              {reorderMode ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2 py-1">
                      {reorderableTemplates.map((tpl) => (
                        <SortableTemplateItem
                          key={tpl.id}
                          tpl={tpl}
                          reorderMode
                          onEdit={() => openEdit(tpl)}
                          onDelete={() => handleDelete(tpl.id)}
                          onToggleFavorite={() => toggleFavorite(tpl.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <>
                  {/* Favorites section */}
                  {filteredTemplates.filter((t) => t.is_favorite).length > 0 && (
                    <div>
                      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ds-text-tertiary font-mono">{t("templateManager.starred")}</h4>
                      <div className="space-y-2 py-1">
                        {filteredTemplates
                          .filter((t) => t.is_favorite)
                          .map((tpl) => (
                            <SortableTemplateItem
                              key={tpl.id}
                              tpl={tpl}
                              reorderMode={false}
                              onEdit={() => openEdit(tpl)}
                              onDelete={() => handleDelete(tpl.id)}
                              onToggleFavorite={() => toggleFavorite(tpl.id)}
                            />
                          ))}
                      </div>
                    </div>
                  )}

                  {/* All Templates section */}
                  {filteredTemplates.filter((t) => !t.is_favorite).length > 0 && (
                    <div>
                      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ds-text-tertiary font-mono">{t("templateManager.allTemplates")}</h4>
                      <div className="space-y-2 py-1">
                        {filteredTemplates
                          .filter((t) => !t.is_favorite)
                          .map((tpl) => (
                            <SortableTemplateItem
                              key={tpl.id}
                              tpl={tpl}
                              reorderMode={false}
                              onEdit={() => openEdit(tpl)}
                              onDelete={() => handleDelete(tpl.id)}
                              onToggleFavorite={() => toggleFavorite(tpl.id)}
                            />
                          ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <DialogFooter>
              <div className="flex items-center justify-between w-full">
                <Button variant="secondary" size="sm" onClick={() => handleClose(false)}>
                  {t("templateManager.close")}
                </Button>
                <Button variant="default" size="sm" onClick={openCreate} leftIcon={<Plus size={14} strokeWidth={2} />}>
                  {t("templateManager.newTemplate")}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}

        {/* Edit / Create View */}
        {view === "edit" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button
                  variant="tertiary"
                  size="sm"
                  iconOnly
                  onClick={resetToList}
                >
                  <ArrowLeft size={16} strokeWidth={1.5} />
                </Button>
                <DialogTitle>
                  {editingId
                    ? isVirtualTemplate(editingId) ? t("templateManager.forkTemplate") : t("templateManager.editTemplate")
                    : t("templateManager.newTemplate")}
                </DialogTitle>
              </div>
            </DialogHeader>

            <div className="px-5 py-4 space-y-4">
              {/* Title */}
              <div>
                <label className={labelCls}>{t("templateManager.fieldTitle")}</label>
                <Input
                  variant="default"
                  size="md"
                  value={form.title}
                  onChange={(e) => setField("title", e.target.value)}
                  placeholder={t("templateManager.fieldTitlePlaceholder")}
                  maxLength={60}
                />
              </div>

              {/* Description */}
              <div>
                <label className={labelCls}>{t("templateManager.fieldDesc")}</label>
                <Input
                  variant="default"
                  size="md"
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value)}
                  placeholder={t("templateManager.fieldDescPlaceholder")}
                  maxLength={120}
                />
              </div>

              {/* Category row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>{t("templateManager.fieldCategoryName")}</label>
                  <Input
                    variant="default"
                    size="md"
                    value={form.category_name}
                    onChange={(e) => setField("category_name", e.target.value)}
                    placeholder={t("templateManager.fieldCategoryNamePlaceholder")}
                    maxLength={20}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t("templateManager.fieldCategoryColor")}</label>
                  <div className="pt-1.5">
                    <ColorPicker
                      value={form.category_color}
                      onChange={(c) => setField("category_color", c)}
                    />
                  </div>
                </div>
              </div>

              {/* Prompt */}
              <div>
                <label className={labelCls}>{t("templateManager.fieldPrompt")}</label>
                <Textarea
                  variant="default"
                  value={form.prompt}
                  onChange={(e) => setField("prompt", e.target.value)}
                  placeholder={t("templateManager.fieldPromptPlaceholder")}
                  rows={4}
                  textareaClassName={textareaCls}
                />
                <p className="mt-1.5 text-[11px] text-ds-text-tertiary">
                  {t("templateManager.escapeVariableHelp")} <code className="bg-transparent px-0 py-0 font-mono text-blue-900">{"\\{{text}}"}</code>
                </p>
              </div>

              {/* System Message */}
              <div>
                <label className={labelCls}>{t("templateManager.fieldSystem")}</label>
                <Textarea
                  variant="default"
                  value={form.system_message}
                  onChange={(e) => setField("system_message", e.target.value)}
                  placeholder={t("templateManager.fieldSystemPlaceholder")}
                  rows={3}
                  textareaClassName={textareaCls}
                />
              </div>

            </div>

            <DialogFooter>
              <div className="flex items-center justify-between w-full">
                <Button variant="secondary" size="sm" onClick={resetToList}>
                  {t("templateManager.cancel")}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || !form.title.trim() || !form.prompt.trim()}
                >
                  {saving
                    ? t("templateManager.saving")
                    : editingId
                      ? isVirtualTemplate(editingId) ? t("templateManager.forkAndSave") : t("templateManager.update")
                      : t("templateManager.create")}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
