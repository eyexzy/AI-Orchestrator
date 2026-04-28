"use client";

import { UserRound } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/lib/store/i18nStore";

export default function DashboardLoading() {
  const { t } = useTranslation();

  return (
    <>
      <header className="sticky top-0 z-50 flex shrink-0 items-center justify-start border-b border-gray-alpha-300 bg-background px-6 py-3.5">
        <div className="flex items-center gap-2.5">
          <UserRound size={18} strokeWidth={2} className="text-ds-text-tertiary" />
          <h1 className="text-[15px] font-semibold text-ds-text">{t("menu.profile")}</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl py-6">
          <div className="space-y-5 px-5 py-4">
            <div className="flex items-center gap-3">
              <Skeleton width={40} height={40} className="rounded-xl" />
              <Skeleton width={156} height={24} />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-gray-alpha-200 bg-gray-alpha-100 p-3"
                >
                  <Skeleton height={56} width="100%" className="rounded-lg" />
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-2">
              <Skeleton height={18} width={112} />
              <Skeleton height={10} width="100%" shape="pill" />
            </div>

            <Skeleton height={72} width="100%" className="rounded-xl" />
            <Skeleton height={136} width="100%" className="rounded-xl" />
            <Skeleton height={120} width="100%" className="rounded-xl" />
          </div>
        </div>
      </main>
    </>
  );
}
