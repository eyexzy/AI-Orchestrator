"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { trackEvent } from "@/lib/eventTracker";
import { useUserLevelStore } from "@/lib/store/userLevelStore";

export type ActivityHeatmapDatum = {
  date: string;
  count: number;
};

const GRID_DAYS = 364;
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

type ActivityCell = {
  key: string;
  count: number;
  intensity: number;
};

type TooltipState = {
  cell: ActivityCell;
  top: number;
  left: number;
};

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDayKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function getIntensity(count: number, thresholds: number[]): number {
  if (count <= 0) return 0;
  if (count <= thresholds[0]) return 1;
  if (count <= thresholds[1]) return 2;
  if (count <= thresholds[2]) return 3;
  return 4;
}

function toneClass(level: number): string {
  switch (level) {
    case 1:
      return "border bg-gray-500";
    case 2:
      return "border bg-gray-700";
    case 3:
      return "border bg-gray-900";
    case 4:
      return "border bg-black dark:bg-gray-1000";
    default:
      return "bg-gray-100";
  }
}

function tooltipLabel(cell: ActivityCell): string {
  if (cell.count === 0) {
    return `No messages on ${dateFormatter.format(parseDayKey(cell.key))}.`;
  }

  const unit = cell.count === 1 ? "message" : "messages";
  return `${cell.count} ${unit} on ${dateFormatter.format(parseDayKey(cell.key))}.`;
}

export function ActivityHeatmap({
  data,
  loading = false,
  className,
}: {
  data: ActivityHeatmapDatum[];
  loading?: boolean;
  emptyLabel?: string;
  className?: string;
}) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const trackedTooltipKeyRef = useRef<string | null>(null);
  const cells = useMemo(() => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - (GRID_DAYS - 1));

    const counts = new Map(data.map((item) => [item.date, item.count]));
    const nonZero = data.map((item) => item.count).filter((count) => count > 0).sort((a, b) => a - b);
    const thresholds =
      nonZero.length === 0
        ? [1, 2, 4]
        : [
            nonZero[Math.min(nonZero.length - 1, Math.floor(nonZero.length * 0.25))],
            nonZero[Math.min(nonZero.length - 1, Math.floor(nonZero.length * 0.6))],
            nonZero[Math.min(nonZero.length - 1, Math.floor(nonZero.length * 0.85))],
          ];

    return Array.from({ length: GRID_DAYS }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);
      const key = dayKey(date);
      const count = counts.get(key) ?? 0;
      return {
        key,
        count,
        intensity: getIntensity(count, thresholds),
      };
    });
  }, [data]);

  const showTooltip = useCallback((cell: ActivityCell, element: HTMLDivElement) => {
    const rect = element.getBoundingClientRect();
    if (trackedTooltipKeyRef.current !== cell.key) {
      trackedTooltipKeyRef.current = cell.key;
      useUserLevelStore.getState().trackTooltipClick();
      trackEvent("tooltip_opened", {
        tooltip_id: "activity_heatmap_day",
        date: cell.key,
        count: cell.count,
      });
    }
    setTooltip({
      cell,
      top: rect.top,
      left: rect.left + rect.width / 2,
    });
  }, []);

  const backgroundCells = Array.from({ length: GRID_DAYS });
  const shellClassName =
    "w-fit max-w-full overflow-hidden rounded-xl border border-gray-alpha-200 bg-background-100";
  const gridClassName =
    "m-2 grid w-max max-w-full grid-flow-col grid-cols-[repeat(52,10px)] grid-rows-[repeat(7,10px)] gap-1";
  const cellClassName = "h-2.5 w-2.5 rounded-[2px]";

  if (loading) {
    return (
      <div className={cn(shellClassName, className)}>
        <div className={gridClassName}>
          {backgroundCells.map((_, index) => (
            <Skeleton key={index} className={cellClassName} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(shellClassName, className)}>
      <div className="relative">
        <div className={cn(gridClassName, "relative z-10 opacity-100")}>
          {cells.map((cell) => (
            <div
              key={cell.key}
              className={cn(
                "flex select-none items-center justify-center",
                cellClassName,
                toneClass(cell.intensity),
              )}
              data-state="closed"
              onMouseEnter={(event) => showTooltip(cell, event.currentTarget)}
              onMouseLeave={() => {
                trackedTooltipKeyRef.current = null;
                setTooltip(null);
              }}
              onFocus={(event) => showTooltip(cell, event.currentTarget)}
              onBlur={() => {
                trackedTooltipKeyRef.current = null;
                setTooltip(null);
              }}
              style={{ opacity: 1 }}
              tabIndex={0}
            />
          ))}
        </div>
        <div className={cn(gridClassName, "absolute inset-0 -z-10 opacity-100")}>
          {backgroundCells.map((_, index) => (
            <div key={index} className={cn(cellClassName, "bg-gray-300 opacity-20")} />
          ))}
        </div>
      </div>
      {tooltip
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[99999]"
              style={{
                top: tooltip.top,
                left: tooltip.left,
                transform: "translate(-50%, calc(-100% - 8px))",
              }}
            >
              <div className="w-max max-w-[280px] rounded-md border border-gray-alpha-200 bg-background-100 px-3 py-2 text-[14px] font-normal leading-5 text-ds-text shadow-geist-lg">
                {tooltipLabel(tooltip.cell)}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
