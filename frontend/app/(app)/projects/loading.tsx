"use client";

import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/store/i18nStore";

function ControlShell({ label }: { label: string }) {
  return (
    <div className="inline-flex h-10 items-center rounded-[6px] bg-background-100 px-3 text-[14px] text-ds-text-secondary shadow-[0_0_0_1px_var(--ds-gray-alpha-400)]">
      {label}
    </div>
  );
}

export default function ProjectsLoading() {
  const { t } = useTranslation();

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-[28px] font-semibold text-ds-text sm:text-[32px]">
              {t("nav.projects")}
            </h1>
            <Button
              type="button"
              variant="default"
              size="md"
              leftIcon={<Plus size={16} strokeWidth={2} />}
              disabled
              className="w-fit"
            >
              {t("projects.create")}
            </Button>
          </div>

          <div className="space-y-3">
            <Input
              variant="default"
              size="md"
              value=""
              readOnly
              placeholder={t("projects.searchPlaceholder")}
              leftIcon={<Search size={16} strokeWidth={2} className="text-ds-text-tertiary" />}
              className="bg-background-100"
            />
            <div className="flex items-center justify-end gap-3">
              <span className="text-[14px] text-ds-text-tertiary">{t("projects.sortBy")}</span>
              <ControlShell label={t("projects.sortActivity")} />
            </div>
          </div>

          <div className="pr-1 pb-1">
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex min-h-[168px] flex-col rounded-md bg-background-100 px-6 py-5 shadow-[0_0_0_1px_var(--ds-gray-alpha-400)] dark:shadow-[0_0_0_1px_#ffffff2b]"
                >
                  <div className="flex min-h-[128px] flex-col justify-between gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <Skeleton height={22} width="62%" />
                      <Skeleton width={32} height={32} className="rounded-md" />
                    </div>
                    <Skeleton height={54} width="100%" className="rounded-lg" />
                    <Skeleton height={14} width={112} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
