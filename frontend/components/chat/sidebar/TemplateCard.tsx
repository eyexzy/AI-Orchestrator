"use client";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Description } from "@/components/ui/description";
import type { PromptTemplate } from "@/lib/store/templatesStore";

/* ── Badge variant helpers ───────────────────────────────────────────── */
export const TEMPLATE_BADGE_VARIANTS = {
  gray: "gray-subtle",
  blue: "blue-subtle",
  purple: "purple-subtle",
  pink: "pink-subtle",
  red: "red-subtle",
  amber: "amber-subtle",
  green: "green-subtle",
  teal: "teal-subtle",
} satisfies Record<string, NonNullable<BadgeProps["variant"]>>;

function isTemplateBadgeColor(
  value: string,
): value is keyof typeof TEMPLATE_BADGE_VARIANTS {
  return value in TEMPLATE_BADGE_VARIANTS;
}

export function getTemplateBadgeVariant(
  color: string,
): NonNullable<BadgeProps["variant"]> {
  return isTemplateBadgeColor(color)
    ? TEMPLATE_BADGE_VARIANTS[color]
    : "gray-subtle";
}

/* ── Shared card content ─────────────────────────────────────────────── */
export function TemplateCardContent({ tpl }: { tpl: PromptTemplate }) {
  return (
    <>
      <div className="flex items-center gap-2 pb-1">
        <span className="min-w-0 truncate text-[14px] font-semibold leading-snug text-ds-text">
          {tpl.title}
        </span>
        <Badge
          variant={getTemplateBadgeVariant(tpl.category_color)}
          size="sm"
          className="shrink-0 max-w-[90px] overflow-hidden"
        >
          {tpl.category_name}
        </Badge>
      </div>

      <Description className="line-clamp-2 break-words">
        {tpl.description}
      </Description>

      {tpl.variables && tpl.variables.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tpl.variables.map((v: string) => (
            <span
              key={v}
              className="text-[13px] font-medium leading-none text-blue-900"
            >
              {`{{${v}}}`}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
