"use client";

import { useState } from "react";

interface L3StrategyChipsProps {
  onInjectCoT: () => void;
  onInjectStepBack: () => void;
}

export function L3StrategyChips({
  onInjectCoT,
  onInjectStepBack,
}: L3StrategyChipsProps) {
  const [cotActive,  setCotActive]  = useState(false);
  const [sbActive,   setSbActive]   = useState(false);

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

  const baseChip: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.09)",
    color: "rgb(var(--text-2))",
    background: "rgba(255,255,255,0.03)",
    transition: "all 0.15s",
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleCoT}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px]"
        style={{
          ...baseChip,
          ...(cotActive ? { background: "rgba(123,147,255,0.15)", borderColor: "rgba(123,147,255,0.35)", color: "rgb(163,178,255)" } : {}),
        }}
        title="Додати Chain-of-Thought до System Message"
      >
        <span className="font-mono text-[11px] font-bold" style={{ color: cotActive ? "rgb(163,178,255)" : "rgb(var(--text-3))" }}>+</span>
        <span>CoT</span>
      </button>

      <button
        type="button"
        onClick={handleStepBack}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px]"
        style={{
          ...baseChip,
          ...(sbActive ? { background: "rgba(52,211,153,0.12)", borderColor: "rgba(52,211,153,0.30)", color: "rgb(52,211,153)" } : {}),
        }}
        title="Додати Step-Back prompting до початку промпту"
      >
        <span className="font-mono text-[11px] font-bold" style={{ color: sbActive ? "rgb(52,211,153)" : "rgb(var(--text-3))" }}>+</span>
        <span>Step-Back</span>
      </button>

      <span className="font-mono text-[10px] select-none" style={{ color: "rgb(var(--text-3))", opacity: 0.5 }}>
        {cotActive ? "✓ CoT додано до system prompt" : sbActive ? "✓ Step-Back додано до промпту" : ""}
      </span>
    </div>
  );
}
