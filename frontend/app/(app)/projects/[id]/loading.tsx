"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/store/i18nStore";

export default function ProjectDetailLoading() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full min-h-0 gap-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-5 pt-6 [scrollbar-gutter:stable]">
          <div className="mb-5 inline-flex h-8 items-center text-[15px] font-medium text-ds-text">
            {t("projects.backToProjects")}
          </div>

          <div className="mx-auto flex w-full max-w-3xl flex-col">
            <div className="shrink-0">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <Skeleton width={36} height={36} className="rounded-lg" />
                    <div className="min-w-0 flex-1 py-2">
                      <Skeleton height={28} width="42%" />
                    </div>
                  </div>
                  <div className="mt-1 pl-[60px]">
                    <Skeleton height={16} width="56%" />
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <div className="h-8 w-8 rounded-md bg-gray-alpha-100 shadow-[0_0_0_1px_var(--ds-gray-alpha-300)]" />
                  <div className="h-8 w-8 rounded-md bg-gray-alpha-100 shadow-[0_0_0_1px_var(--ds-gray-alpha-300)]" />
                </div>
              </div>

              <div className="rounded-2xl border border-gray-alpha-200 bg-background-100 px-5 py-4">
                <div className="min-h-[148px] rounded-xl border border-gray-alpha-200 bg-background px-4 py-4 text-[15px] text-ds-text-tertiary">
                  {t("placeholder.default")}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-col">
              <div className="flex items-center gap-5 border-b border-gray-alpha-200 pb-2 text-[15px] font-medium">
                <span className="text-ds-text">Chats</span>
                <span className="text-ds-text-tertiary">Sources</span>
              </div>

              <div className="mt-4 space-y-0.5 px-1 -mx-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[minmax(0,1fr)_36px] items-center gap-4 rounded-xl px-4 py-3"
                  >
                    <div className="space-y-2">
                      <Skeleton height={18} width={`${48 + (i % 3) * 14}%`} />
                      <Skeleton height={14} width={i % 2 === 0 ? 104 : 124} />
                    </div>
                    <div className="h-8 w-8 rounded-md bg-gray-alpha-100 shadow-[0_0_0_1px_var(--ds-gray-alpha-300)]" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden w-[320px] shrink-0 border-l border-gray-alpha-200 bg-background-100 xl:block" />
    </div>
  );
}
