"use client";

import { useState, useEffect } from "react";

/* ── Variable Card ────────────────────────────────────────────── */
function VarCard({
  varKey,
  value,
  onRenameKey,
  onChangeValue,
}: {
  varKey: string;
  value: string;
  onRenameKey: (oldKey: string, newKey: string) => void;
  onChangeValue: (key: string, value: string) => void;
}) {
  const [draftKey, setDraftKey] = useState(varKey);
  useEffect(() => { setDraftKey(varKey); }, [varKey]);

  const commitKey = () => {
    const clean =
      draftKey.trim().replace(/\s/g, "_").replace(/[{}]/g, "") || varKey;
    setDraftKey(clean);
    if (clean !== varKey) onRenameKey(varKey, clean);
  };

  return (
    <div
      className="space-y-2 rounded-xl p-2.5"
      style={{
        background: "rgba(0,0,0,0.22)",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="font-mono text-[10px] shrink-0 select-none"
          style={{ color: "rgba(123,147,255,0.55)" }}
        >
          {"{{"}
        </span>
        <input
          type="text"
          value={draftKey}
          onChange={(e) => setDraftKey(e.target.value)}
          onBlur={commitKey}
          onKeyDown={(e) => { if (e.key === "Enter") commitKey(); }}
          placeholder="variable_name"
          className="input-field flex-1 px-2 py-1 font-mono text-[11px]"
          style={{
            height: 24,
            borderRadius: 6,
            background: "rgba(123,147,255,0.07)",
            borderColor: "rgba(123,147,255,0.16)",
          }}
        />
        <span
          className="font-mono text-[10px] shrink-0 select-none"
          style={{ color: "rgba(123,147,255,0.55)" }}
        >
          {"}}"}
        </span>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChangeValue(varKey, e.target.value)}
        placeholder="значення..."
        className="input-field w-full px-2 py-1.5 text-[11px]"
        style={{ borderRadius: 6, minHeight: 26 }}
      />
    </div>
  );
}

/* ── Variable Editor ─────────────────────────────────────────── */
export function VariableEditor({
  variables,
  onChange,
}: {
  variables: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  const keys = Object.keys(variables);
  return (
    <div className="space-y-2">
      {keys.length === 0 ? (
        <div
          className="rounded-xl p-3.5 text-center"
          style={{
            background: "rgba(0,0,0,0.20)",
            border: "1px dashed rgba(255,255,255,0.07)",
          }}
        >
          <p
            className="font-mono text-[10px] leading-relaxed"
            style={{ color: "rgb(var(--text-3))" }}
          >
            Використайте{" "}
            <span style={{ color: "rgb(123,147,255)" }}>{"{{змінна}}"}</span>{" "}
            у тексті — поля з&apos;являться автоматично
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {keys.map((key) => (
            <VarCard
              key={key}
              varKey={key}
              value={variables[key]}
              onRenameKey={(old, n) =>
                onChange(
                  Object.fromEntries(
                    Object.entries(variables).map(([k, v]) =>
                      k === old ? [n, v] : [k, v]
                    )
                  )
                )
              }
              onChangeValue={(k, val) => onChange({ ...variables, [k]: val })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
