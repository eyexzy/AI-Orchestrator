"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/store/i18nStore";

export default function ChatLoading() {
  const { t } = useTranslation();
  const rows = [
    { align: "end", bubbleW: 320 },
    { align: "start", bubbleW: 520 },
    { align: "end", bubbleW: 260 },
    { align: "start", bubbleW: 480 },
  ] as const;

  return (
    <main className="flex flex-1 overflow-hidden px-0 pt-0 pb-0">
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="chat-body">
            <div className="chat-top-overlay">
              <Skeleton height={32} width={180} className="rounded-lg" />
            </div>
            <div className="message-scroll">
              <div
                className="mx-auto flex w-full max-w-[42rem] flex-col gap-6 px-6 py-6"
                style={{ paddingTop: "calc(1.5rem + 74px)" }}
              >
                {rows.map((row, i) => (
                  <div
                    key={i}
                    className={row.align === "end" ? "flex justify-end" : "flex justify-start"}
                  >
                    <Skeleton
                      height={row.align === "end" ? 52 : 76}
                      width={row.bubbleW}
                      className="rounded-2xl"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-gray-alpha-200 bg-background px-6 py-4">
            <div className="mx-auto w-full max-w-[42rem] rounded-2xl border border-gray-alpha-200 bg-background-100 px-4 py-4 text-[15px] text-ds-text-tertiary">
              {t("placeholder.default")}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
