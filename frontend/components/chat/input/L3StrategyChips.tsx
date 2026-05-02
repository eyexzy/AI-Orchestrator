"use client";

import { useTranslation } from "@/lib/store/i18nStore";
import { Button } from "@/components/ui/button";
import { actionToast } from "@/components/ui/action-toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Plus } from "lucide-react";

interface L3StrategyChipsProps {
  onInjectCoT: () => void;
  onInjectStepBack: () => void;
}

export function L3StrategyChips({
  onInjectCoT,
  onInjectStepBack,
}: L3StrategyChipsProps) {
  const { t } = useTranslation();

  const handleCoT = () => {
    onInjectCoT();
    actionToast.saved(t("chips.cotAdded"));
  };

  const handleStepBack = () => {
    onInjectStepBack();
    actionToast.saved(t("chips.stepBackAdded"));
  };

  return (
    <>
      <Tooltip content={t("tooltip.l3Cot")} trackingId="l3_cot_chip">
        <Button
          type="button"
          variant="chip"
          shape="rounded"
          size="sm"
          onClick={handleCoT}
          leftIcon={<Plus size={14} strokeWidth={2.2} className="text-current" />}
        >
          CoT
        </Button>
      </Tooltip>

      <Tooltip content={t("tooltip.l3StepBack")} trackingId="l3_step_back_chip">
        <Button
          type="button"
          variant="chip"
          shape="rounded"
          size="sm"
          onClick={handleStepBack}
          leftIcon={<Plus size={14} strokeWidth={2.2} className="text-current" />}
        >
          Step-Back
        </Button>
      </Tooltip>
    </>
  );
}
