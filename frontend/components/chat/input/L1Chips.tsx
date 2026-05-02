"use client";

import { useRef, useState, useMemo } from "react";
import { User, Smile } from "lucide-react";
import { useTranslation } from "@/lib/store/i18nStore";
import { Button } from "@/components/ui/button";
import { DropdownMenu, MenuBtn } from "./DropdownMenu";
import { Tooltip } from "@/components/ui/tooltip";

interface L1ChipsProps {
  input: string;
  setInput: (v: string) => void;
  onSendSuggestion: (text: string) => void;
  suggestions?: string[];
}

export function L1Chips({ input, setInput, onSendSuggestion, suggestions = [] }: L1ChipsProps) {
  const { t } = useTranslation();
  const [activeMenu, setActiveMenu] = useState<"role" | "tone" | null>(null);
  const roleRef = useRef<HTMLElement>(null);
  const toneRef = useRef<HTMLElement>(null);

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
    return null;
  };

  const applyPrefix = (prefix: string) => { setInput(input.trim() ? `${prefix}${input}` : prefix); setActiveMenu(null); };
  const applySuffix = (suffix: string) => { setInput(input.trim() ? `${input}${suffix}` : suffix.trimStart()); setActiveMenu(null); };

  return (
    <>
      <>
        <Tooltip content={t("tooltip.l1Role")} trackingId="l1_role_chip" disabled={activeMenu === "role"}>
          <Button
            ref={roleRef}
            type="button"
            variant="chip"
            shape="rounded"
            size="sm"
            leftIcon={<User size={14} strokeWidth={2} />}
            onClick={() => setActiveMenu((p) => p === "role" ? null : "role")}
          >
            {t("chips.role")}
          </Button>
        </Tooltip>
        <Tooltip content={t("tooltip.l1Tone")} trackingId="l1_tone_chip" disabled={activeMenu === "tone"}>
          <Button
            ref={toneRef}
            type="button"
            variant="chip"
            shape="rounded"
            size="sm"
            leftIcon={<Smile size={14} strokeWidth={2} />}
            onClick={() => setActiveMenu((p) => p === "tone" ? null : "tone")}
          >
            {t("chips.tone")}
          </Button>
        </Tooltip>
        {suggestions.slice(0, 4).map((suggestion) => (
          <Tooltip key={suggestion} content={t("tooltip.l1Suggestion")} trackingId="prompt_suggestion_chip">
            <Button
              type="button"
              variant="chip"
              shape="rounded"
              size="sm"
              onClick={() => onSendSuggestion(suggestion)}
            >
              {suggestion}
            </Button>
          </Tooltip>
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
    </>
  );
}
