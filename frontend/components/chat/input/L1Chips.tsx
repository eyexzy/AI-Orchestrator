"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { User, Smile, FileText } from "lucide-react";
import { useTemplatesStore } from "@/lib/store/templatesStore";
import { useTranslation } from "@/lib/store/i18nStore";
import { Button } from "@/components/ui/button";
import { DropdownMenu, MenuBtn } from "./DropdownMenu";

const SUGGESTION_KEYS = [
  "chips.sug0", "chips.sug1", "chips.sug2", "chips.sug3",
  "chips.sug4", "chips.sug5", "chips.sug6", "chips.sug7",
] as const;

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface L1ChipsProps {
  input: string;
  setInput: (v: string) => void;
  onSendSuggestion: (text: string) => void;
}

export function L1Chips({ input, setInput, onSendSuggestion }: L1ChipsProps) {
  const { t } = useTranslation();
  const [activeMenu, setActiveMenu] = useState<"role" | "tone" | "templates" | null>(null);
  const roleRef = useRef<HTMLElement>(null);
  const toneRef = useRef<HTMLElement>(null);
  const templatesRef = useRef<HTMLElement>(null);
  const templates = useTemplatesStore((s) => s.templates);
  const fetchTemplates = useTemplatesStore((s) => s.fetchTemplates);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const [pickKeys, setPickKeys] = useState<string[]>(SUGGESTION_KEYS.slice(0, 2));
  useEffect(() => { setPickKeys(shuffled([...SUGGESTION_KEYS]).slice(0, 2)); }, []);

  const roleOptions = useMemo(() => [
    { label: t("chips.roleTeacher"), value: t("chips.roleTeacherVal") },
    { label: t("chips.roleDeveloper"), value: t("chips.roleDeveloperVal") },
    { label: t("chips.roleScientist"), value: t("chips.roleScientistVal") },
    { label: t("chips.roleWriter"), value: t("chips.roleWriterVal") },
  ], [t]);

  const toneOptions = useMemo(() => [
    { label: t("chips.toneFormal"), value: t("chips.toneFormalVal") },
    { label: t("chips.toneSimple"), value: t("chips.toneSimpleVal") },
    { label: t("chips.toneConcise"), value: t("chips.toneConciseVal") },
    { label: t("chips.toneDetailed"), value: t("chips.toneDetailedVal") },
  ], [t]);

  const getAnchor = () => {
    if (activeMenu === "role") return roleRef.current;
    if (activeMenu === "tone") return toneRef.current;
    if (activeMenu === "templates") return templatesRef.current;
    return null;
  };

  const applyPrefix = (prefix: string) => { setInput(input.trim() ? `${prefix}${input}` : prefix); setActiveMenu(null); };
  const applySuffix = (suffix: string) => { setInput(input.trim() ? `${input}${suffix}` : suffix.trimStart()); setActiveMenu(null); };

  const chipActive = "bg-[var(--ds-blue-200)] text-[var(--ds-blue-900)] shadow-[0_0_0_1px_var(--ds-blue-400)] hover:bg-[var(--ds-blue-300)] hover:text-[var(--ds-blue-900)]";

  return (
    <>
      <>
        <Button
          ref={roleRef}
          type="button"
          variant="chip"
          shape="rounded"
          size="sm"
          leftIcon={<User size={14} strokeWidth={2} />}
          onClick={() => setActiveMenu((p) => p === "role" ? null : "role")}
          className={activeMenu === "role" ? chipActive : ""}
        >
          {t("chips.role")}
        </Button>
        <Button
          ref={toneRef}
          type="button"
          variant="chip"
          shape="rounded"
          size="sm"
          leftIcon={<Smile size={14} strokeWidth={2} />}
          onClick={() => setActiveMenu((p) => p === "tone" ? null : "tone")}
          className={activeMenu === "tone" ? chipActive : ""}
        >
          {t("chips.tone")}
        </Button>
        <Button
          ref={templatesRef}
          type="button"
          variant="chip"
          shape="rounded"
          size="sm"
          leftIcon={<FileText size={14} strokeWidth={2} />}
          onClick={() => setActiveMenu((p) => p === "templates" ? null : "templates")}
          className={activeMenu === "templates" ? chipActive : ""}
        >
          {t("chips.templates")}
        </Button>
        {pickKeys.map((key) => (
          <Button
            key={key}
            type="button"
            variant="chip"
            shape="rounded"
            size="sm"
            onClick={() => onSendSuggestion(t(key))}
          >
            {t(key)}
          </Button>
        ))}
      </>

      {activeMenu === "role" && (
        <DropdownMenu anchorEl={getAnchor()} onClose={() => setActiveMenu(null)} minWidth={220}>
          {roleOptions.map((o) => <MenuBtn key={o.label} onClick={() => applyPrefix(o.value)}>{o.label}</MenuBtn>)}
        </DropdownMenu>
      )}
      {activeMenu === "tone" && (
        <DropdownMenu anchorEl={getAnchor()} onClose={() => setActiveMenu(null)} minWidth={240}>
          {toneOptions.map((o) => <MenuBtn key={o.label} onClick={() => applySuffix(o.value)}>{o.label}</MenuBtn>)}
        </DropdownMenu>
      )}
      {activeMenu === "templates" && (
        <DropdownMenu anchorEl={getAnchor()} onClose={() => setActiveMenu(null)} minWidth={280}>
          {templates.length === 0 ? (
            <p className="px-3.5 py-3 text-sm text-ds-text-tertiary">{t("chips.noTemplates")}</p>
          ) : (
            templates.map((tpl) => (
              <MenuBtn key={tpl.id} column onClick={() => { setInput(tpl.prompt); setActiveMenu(null); }}>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-ds-text">{tpl.title}</span>
                  <span className="rounded px-1.5 py-0.5 font-mono text-[10px] bg-gray-alpha-200 text-ds-text-tertiary">
                    {tpl.category_name}
                  </span>
                </div>
                <span className="text-xs text-ds-text-tertiary">{tpl.description}</span>
              </MenuBtn>
            ))
          )}
        </DropdownMenu>
      )}
    </>
  );
}
