"use client";

import { useUserLevelStore, type UserLevel } from "@/lib/store/userLevelStore";

const LEVELS: { value: UserLevel; label: string; activeClass: string }[] = [
  { value: 1, label: "L1", activeClass: "badge-l1" },
  { value: 2, label: "L2", activeClass: "badge-l2" },
  { value: 3, label: "L3", activeClass: "badge-l3" },
];

export function UserLevelToggle() {
  const level = useUserLevelStore((s) => s.level);
  const setLevel = useUserLevelStore((s) => s.setLevel);

  return (
    <div
      className="inline-flex items-center rounded-lg p-0.5 gap-0.5"
      style={{ background: "rgba(255,255,255,0.04)" }}
    >
      {LEVELS.map((l) => {
        const isActive = level === l.value;
        return (
          <button
            key={l.value}
            onClick={() => setLevel(l.value)}
            className={`rounded-md border px-3 py-1 text-[12px] font-medium transition-all duration-200 ${
              isActive ? l.activeClass : "border-transparent text-[rgb(var(--text-3))] hover:text-[rgb(var(--text-2))]"
            }`}
            style={isActive ? {} : { background: "transparent" }}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}