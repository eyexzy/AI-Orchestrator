"use client";

import { Plus, Trash2 } from "lucide-react";
import type { FewShotExample } from "./config";

export function FewShotEditor({
  examples,
  onChange,
}: {
  examples: FewShotExample[];
  onChange: (v: FewShotExample[]) => void;
}) {
  const addExample = () => {
    onChange([...examples, { input: "", output: "" }]);
  };

  const removeExample = (idx: number) => {
    onChange(examples.filter((_, i) => i !== idx));
  };

  const updateExample = (
    idx: number,
    field: "input" | "output",
    value: string
  ) => {
    onChange(
      examples.map((ex, i) => (i === idx ? { ...ex, [field]: value } : ex))
    );
  };

  return (
    <div className="space-y-2">
      {examples.length === 0 ? (
        <div
          className="rounded-xl p-3 text-center"
          style={{
            background: "rgba(0,0,0,0.20)",
            border: "1px dashed rgba(255,255,255,0.07)",
          }}
        >
          <p
            className="font-mono text-[10px]"
            style={{ color: "rgb(var(--text-3))" }}
          >
            Приклади автоматично додаються до system message
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {examples.map((ex, idx) => (
            <div
              key={idx}
              className="rounded-xl p-2.5 space-y-1.5"
              style={{
                background: "rgba(0,0,0,0.22)",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className="font-mono text-[9px] font-bold uppercase tracking-wider"
                  style={{ color: "rgb(var(--text-3))" }}
                >
                  #{idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeExample(idx)}
                  className="flex h-5 w-5 items-center justify-center rounded transition-colors hover:text-red-400"
                  style={{ color: "rgb(var(--text-3))" }}
                >
                  <Trash2 size={10} strokeWidth={2.2} />
                </button>
              </div>
              <div>
                <p
                  className="mb-1 font-mono text-[9px]"
                  style={{ color: "rgba(123,147,255,0.65)" }}
                >
                  User
                </p>
                <input
                  type="text"
                  value={ex.input}
                  onChange={(e) => updateExample(idx, "input", e.target.value)}
                  placeholder="Вхідний приклад..."
                  className="input-field w-full px-2 py-1.5 text-[11px]"
                  style={{ borderRadius: 6, minHeight: 26 }}
                />
              </div>
              <div>
                <p
                  className="mb-1 font-mono text-[9px]"
                  style={{ color: "rgba(52,211,153,0.65)" }}
                >
                  Assistant
                </p>
                <input
                  type="text"
                  value={ex.output}
                  onChange={(e) =>
                    updateExample(idx, "output", e.target.value)
                  }
                  placeholder="Відповідь-приклад..."
                  className="input-field w-full px-2 py-1.5 text-[11px]"
                  style={{ borderRadius: 6, minHeight: 26 }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={addExample}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] transition-all"
        style={{
          border: "1px dashed rgba(255,255,255,0.10)",
          color: "rgb(var(--text-3))",
          background: "transparent",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "rgba(255,255,255,0.04)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = "transparent")
        }
      >
        <Plus size={11} strokeWidth={2.2} />
        Додати приклад
      </button>
    </div>
  );
}
