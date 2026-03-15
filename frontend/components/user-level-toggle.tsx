"use client";

import { useUserLevelStore, type UserLevel } from "@/lib/store/userLevelStore";
import { Button } from "@/components/ui/button";

const LEVELS: { value: UserLevel; label: string; activeClass: string }[] = [
  { value: 1, label: "L1", activeClass: "bg-background border-green-700/30 text-green-700 shadow-geist-sm" },
  { value: 2, label: "L2", activeClass: "bg-background border-blue-700/30 text-blue-700 shadow-geist-sm" },
  { value: 3, label: "L3", activeClass: "bg-background border-amber-700/30 text-amber-700 shadow-geist-sm" },
];

export function UserLevelToggle() {
  const level = useUserLevelStore((s) => s.level);
  const setLevel = useUserLevelStore((s) => s.setLevel);

  return (
    <div className="inline-flex items-center rounded-md border border-gray-alpha-200 p-1 gap-0.5 bg-gray-alpha-100">
      {LEVELS.map((l) => {
        const isActive = level === l.value;
        return (
          <button
            key={l.value}
            type="button"
           
            onClick={() => setLevel(l.value)}
            className={`rounded-[5px] border px-3.5 py-1.5 text-sm font-semibold transition-all duration-200 ${isActive
              ? l.activeClass
              : "border-transparent bg-transparent text-ds-text-tertiary hover:text-ds-text-secondary hover:bg-gray-alpha-200"
              }`}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}