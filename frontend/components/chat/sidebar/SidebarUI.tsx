"use client";

import React from "react";
import { type LucideIcon } from "lucide-react";

export { CollapseGroup, Collapse } from "@/components/ui/collapse";

export type GeistColor = "blue" | "amber" | "purple" | "teal";

export const GEIST_RGB: Record<GeistColor, string> = {
  blue: "0,112,243",
  amber: "245,166,35",
  purple: "121,40,202",
  teal: "57,142,74",
};

export function Divider() {
  return <div className="h-px bg-gray-alpha-200 opacity-40" />;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[15px] font-semibold leading-none text-ds-text">
      {children}
    </p>
  );
}

export function SectionHeader({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon size={16} strokeWidth={2} className="shrink-0 text-ds-text-secondary" />
      <SectionLabel>{children}</SectionLabel>
    </div>
  );
}