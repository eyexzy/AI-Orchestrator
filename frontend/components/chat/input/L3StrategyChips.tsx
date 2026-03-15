"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/store/i18nStore";
import { Button } from "@/components/ui/button";

interface L3StrategyChipsProps {
  onInjectCoT: () => void;
  onInjectStepBack: () => void;
}

export function L3StrategyChips({
  onInjectCoT,
  onInjectStepBack,
}: L3StrategyChipsProps) {
  const { t } = useTranslation();
  const [cotActive, setCotActive] = useState(false);
  const [sbActive, setSbActive] = useState(false);

  const handleCoT = () => {
    onInjectCoT();
    setCotActive(true);
    setTimeout(() => setCotActive(false), 2000);
  };

  const handleStepBack = () => {
    onInjectStepBack();
    setSbActive(true);
    setTimeout(() => setSbActive(false), 2000);
  };

  return (
    <>
      <Button
        type="button"
        variant="chip"
        shape="rounded"
        size="sm"
        onClick={handleCoT}
        leftIcon={<span className={cn("font-mono text-xs font-bold", cotActive ? "text-amber-700" : "text-ds-text-tertiary")}>+</span>}
        className={cn(
          cotActive && "bg-[var(--ds-amber-200)] text-[var(--ds-amber-900)] shadow-[0_0_0_1px_var(--ds-amber-400)] hover:bg-[var(--ds-amber-300)] hover:text-[var(--ds-amber-900)]",
        )}
        title={t("chips.cotTitle")}
      >
        CoT
      </Button>

      <Button
        type="button"
        variant="chip"
        shape="rounded"
        size="sm"
        onClick={handleStepBack}
        leftIcon={<span className={cn("font-mono text-xs font-bold", sbActive ? "text-teal-700" : "text-ds-text-tertiary")}>+</span>}
        className={cn(
          sbActive && "bg-[var(--ds-teal-200)] text-[var(--ds-teal-900)] shadow-[0_0_0_1px_var(--ds-teal-400)] hover:bg-[var(--ds-teal-300)] hover:text-[var(--ds-teal-900)]",
        )}
        title={t("chips.stepBackTitle")}
      >
        Step-Back
      </Button>

      <span className="font-mono text-xs select-none text-ds-text-tertiary opacity-60">
        {cotActive ? `\u2713 ${t("chips.cotAdded")}` : sbActive ? `\u2713 ${t("chips.stepBackAdded")}` : ""}
      </span>
    </>
  );
}
