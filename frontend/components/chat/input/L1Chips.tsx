"use client";

import { useRef, useState } from "react";
import { TEMPLATES, CATEGORY_LABELS } from "@/lib/templates";
import { DropdownMenu, MenuBtn } from "./DropdownMenu";

interface L1ChipsProps {
  input: string;
  setInput: (v: string) => void;
  onSendSuggestion: (text: string) => void;
}

export function L1Chips({ input, setInput, onSendSuggestion }: L1ChipsProps) {
  const [activeMenu, setActiveMenu] = useState<"role" | "tone" | "templates" | null>(null);
  const roleRef      = useRef<HTMLButtonElement>(null);
  const toneRef      = useRef<HTMLButtonElement>(null);
  const templatesRef = useRef<HTMLButtonElement>(null);

  const getAnchor = () => {
    if (activeMenu === "role")      return roleRef.current;
    if (activeMenu === "tone")      return toneRef.current;
    if (activeMenu === "templates") return templatesRef.current;
    return null;
  };

  const applyPrefix = (prefix: string) => { setInput(input.trim() ? `${prefix}${input}` : prefix); setActiveMenu(null); };
  const applySuffix = (suffix: string) => { setInput(input.trim() ? `${input}${suffix}` : suffix.trimStart()); setActiveMenu(null); };

  const chip: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.09)", color: "rgb(var(--text-2))", background: "rgba(255,255,255,0.03)" };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button ref={roleRef} type="button" onClick={() => setActiveMenu((p) => p === "role" ? null : "role")}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition-all"
          style={{ ...chip, background: activeMenu === "role" ? "rgba(255,255,255,0.06)" : chip.background }}>
          <span>🎭</span> Роль
        </button>
        <button ref={toneRef} type="button" onClick={() => setActiveMenu((p) => p === "tone" ? null : "tone")}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition-all"
          style={{ ...chip, background: activeMenu === "tone" ? "rgba(255,255,255,0.06)" : chip.background }}>
          <span>🎯</span> Тон
        </button>
        <button ref={templatesRef} type="button" onClick={() => setActiveMenu((p) => p === "templates" ? null : "templates")}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition-all"
          style={{ ...chip, background: activeMenu === "templates" ? "rgba(255,255,255,0.06)" : chip.background }}>
          <span>📋</span> Шаблони
        </button>
        {[
          { label: "Як працює ChatGPT?", text: "Як працює ChatGPT?" },
          { label: "Що таке prompt engineering?", text: "Що таке prompt engineering?" },
        ].map((s) => (
          <button key={s.label} type="button" onClick={() => onSendSuggestion(s.text)}
            className="rounded-full px-3.5 py-1.5 text-[12px] transition-all hover:bg-white/5" style={chip}>
            {s.label}
          </button>
        ))}
      </div>

      {activeMenu === "role" && (
        <DropdownMenu anchorEl={getAnchor()} onClose={() => setActiveMenu(null)} minWidth={220}>
          {[
            { label: "👨‍🏫 Вчитель",   value: "Поясни як досвідчений вчитель: " },
            { label: "👨‍💻 Розробник", value: "Як senior розробник, напиши: " },
            { label: "🔬 Науковець",  value: "З наукової точки зору поясни: " },
            { label: "✍️ Письменник", value: "Як досвідчений автор, створи: " },
          ].map((o) => <MenuBtn key={o.label} onClick={() => applyPrefix(o.value)}>{o.label}</MenuBtn>)}
        </DropdownMenu>
      )}
      {activeMenu === "tone" && (
        <DropdownMenu anchorEl={getAnchor()} onClose={() => setActiveMenu(null)} minWidth={240}>
          {[
            { label: "🎓 Формальний", value: " Відповідай формально." },
            { label: "😊 Простий",    value: " Поясни простими словами." },
            { label: "⚡ Короткий",   value: " Максимум 3 речення." },
            { label: "📝 Детальний",  value: " Дай розгорнуту відповідь з прикладами." },
          ].map((o) => <MenuBtn key={o.label} onClick={() => applySuffix(o.value)}>{o.label}</MenuBtn>)}
        </DropdownMenu>
      )}
      {activeMenu === "templates" && (
        <DropdownMenu anchorEl={getAnchor()} onClose={() => setActiveMenu(null)} minWidth={280}>
          {TEMPLATES.filter((t) => t.level === 1 && (t.category === "learning" || t.category === "code")).map((tpl) => (
            <MenuBtn key={tpl.id} column onClick={() => { setInput(tpl.prompt); setActiveMenu(null); }}>
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-medium" style={{ color: "rgb(var(--text-1))" }}>{tpl.title}</span>
                <span className="rounded px-1 py-0.5 font-mono text-[9px]"
                  style={{ background: "rgba(255,255,255,0.05)", color: "rgb(var(--text-3))" }}>
                  {CATEGORY_LABELS[tpl.category]}
                </span>
              </div>
              <span className="text-[11px]" style={{ color: "rgb(var(--text-3))" }}>{tpl.description}</span>
            </MenuBtn>
          ))}
        </DropdownMenu>
      )}
    </>
  );
}
