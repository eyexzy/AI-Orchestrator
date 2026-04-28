"use client";

import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getChatListGrid } from "@/components/ChatListItem";
import { useTranslation } from "@/lib/store/i18nStore";
import { useUserLevelStore } from "@/lib/store/userLevelStore";

function ChatsListSkeleton({ showProject, count = 8 }: { showProject: boolean; count?: number }) {
  const gridClass = getChatListGrid(showProject);

  return (
    <div className="space-y-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`grid items-center gap-4 rounded-xl px-4 py-3 ${gridClass}`}>
          <Skeleton height={18} width={`${48 + (i % 3) * 12}%`} />
          {showProject && <Skeleton height={18} width={`${58 + (i % 2) * 10}%`} />}
          <Skeleton height={18} width={i % 2 === 0 ? 96 : 116} />
          <Skeleton height={32} width={32} className="rounded-md" />
        </div>
      ))}
    </div>
  );
}

export default function ChatsLoading() {
  const { t } = useTranslation();
  const showProject = useUserLevelStore((s) => s.level >= 2);

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
        <div className="space-y-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-[28px] font-semibold text-ds-text sm:text-[32px]">
              {t("chats.title")}
            </h1>
            <Button
              type="button"
              variant="default"
              size="md"
              leftIcon={<Plus size={16} strokeWidth={2} />}
              disabled
              className="w-fit"
            >
              {t("chats.newChat")}
            </Button>
          </div>

          <Input
            variant="default"
            size="lg"
            value=""
            readOnly
            placeholder={t("chats.searchPlaceholder")}
            leftIcon={<Search size={17} strokeWidth={2} className="text-ds-text-tertiary" />}
            className="bg-background-100"
          />

          <div className="mt-6 flex flex-1 min-h-0 flex-col">
            <div className={`grid items-center gap-4 px-4 pb-2 ${getChatListGrid(showProject)}`}>
              <span className="text-[14px] font-medium text-ds-text-tertiary">
                {t("chats.columnName")}
              </span>
              <span className="text-[14px] font-medium text-ds-text-tertiary">
                {t("chats.columnProject")}
              </span>
              <span className="text-[14px] font-medium text-ds-text-tertiary">
                {t("chats.columnUpdated")}
              </span>
              <div />
            </div>
            <div className="mt-0.5 flex-1 min-h-0 overflow-hidden px-1 -mx-1">
              <ChatsListSkeleton showProject={showProject} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
