"use client";

import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <main className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
      <div className="mx-auto max-w-6xl px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
        <div className="space-y-8">
          <div className="space-y-2">
            <Skeleton height={36} width={180} />
            <Skeleton height={18} width={320} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
            <div className="space-y-6">
              <Skeleton height={294} width="100%" className="rounded-xl" />
              <Skeleton height={132} width="100%" className="rounded-xl" />
              <div className="grid grid-cols-2 gap-2">
                <Skeleton height={72} width="100%" className="rounded-lg" />
                <Skeleton height={72} width="100%" className="rounded-lg" />
              </div>
            </div>
            <Skeleton height={232} width="100%" className="rounded-xl" />
          </div>
        </div>
      </div>
    </main>
  );
}
