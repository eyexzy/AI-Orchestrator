"use client";

import { UserRound } from "lucide-react";
import { ScoreDashboard } from "@/components/ScoreDashboard";
import { useTranslation } from "@/lib/store/i18nStore";

export default function DashboardPage() {
  const { t } = useTranslation();

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-50 flex shrink-0 items-center justify-start border-b border-gray-alpha-300 bg-background px-6 py-3.5">
        <div className="flex items-center gap-2.5">
          <UserRound size={18} strokeWidth={2} className="text-ds-text-tertiary" />
          <h1 className="text-[15px] font-semibold text-ds-text">{t("menu.profile")}</h1>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl py-6">
          <ScoreDashboard />
        </div>
      </main>
    </>
  );
}