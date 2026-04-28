"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

/* ── Column definition ───────────────────────────────────────────────────── */

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
  className?: string;
}

/* ── Props ────────────────────────────────────────────────────────────────── */

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  keyExtractor: (row: T) => string | number;
  isLoading?: boolean;
  skeletonRows?: number;
  emptyMessage?: string;
  page?: number;
  pages?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  pageSizeLabel?: string;
  ofLabel?: string;
  toolbar?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

/* ── Component ────────────────────────────────────────────────────────────── */

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  isLoading = false,
  skeletonRows = 5,
  emptyMessage = "No data.",
  page = 1,
  pages = 1,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  pageSizeLabel = "Show",
  ofLabel = "of",
  toolbar,
  footer,
  className,
}: DataTableProps<T>) {
  const alignClass = { left: "text-left", right: "text-right", center: "text-center" };

  return (
    <div className={cn("space-y-3", className)}>
      {toolbar && <div>{toolbar}</div>}

      <div className="overflow-hidden rounded-lg border border-gray-alpha-200 bg-background-100 px-3.5 py-3">
        <div className="overflow-x-auto">
          <table
            className="w-full border-separate text-[14px] min-w-[460px] text-ds-text"
            style={{ borderSpacing: "0 6px" }}
          >
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                      "h-8 px-4 align-middle font-medium text-[13px] text-ds-text-secondary",
                      alignClass[col.align ?? "left"],
                      col.className,
                    )}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: skeletonRows }).map((_, i) => (
                  <tr key={i} className="h-[36px] odd:bg-gray-alpha-100">
                    {columns.map((col, ci) => (
                      <td
                        key={col.key}
                        className={cn(
                          "px-4 align-middle",
                          ci === 0 && "rounded-l-md",
                          ci === columns.length - 1 && "rounded-r-md",
                        )}
                      >
                        <Skeleton className={cn("h-3.5", col.align === "right" ? "ml-auto w-16" : "w-28")} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data.length > 0 ? (
                data.map((row) => (
                  <tr
                    key={keyExtractor(row)}
                    className="h-[36px] odd:bg-gray-alpha-100 [&>:first-child]:rounded-l-md [&>:last-child]:rounded-r-md"
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "px-4 align-middle",
                          alignClass[col.align ?? "left"],
                          col.className,
                        )}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-3 py-8 text-center text-[13px] text-ds-text-tertiary"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination — outside the card */}
      <div className="flex items-center justify-between">
        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange?.(Number(v))}
          size="sm"
          triggerWidthMode="content"
          options={pageSizeOptions.map((n) => ({ value: String(n), label: `${pageSizeLabel} ${n}` }))}
        />
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-ds-text-secondary">
            {page} {ofLabel} {pages}
          </span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              iconOnly
              disabled={page <= 1}
              onClick={() => onPageChange?.(page - 1)}
              aria-label="Previous page"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" clipRule="evenodd" d="M10.354 3.646a.5.5 0 0 1 0 .708L6.707 8l3.647 3.646a.5.5 0 0 1-.708.708l-4-4a.5.5 0 0 1 0-.708l4-4a.5.5 0 0 1 .708 0z" />
              </svg>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              iconOnly
              disabled={page >= pages}
              onClick={() => onPageChange?.(page + 1)}
              aria-label="Next page"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" clipRule="evenodd" d="M5.646 3.646a.5.5 0 0 0 0 .708L9.293 8 5.646 11.646a.5.5 0 0 0 .708.708l4-4a.5.5 0 0 0 0-.708l-4-4a.5.5 0 0 0-.708 0z" />
              </svg>
            </Button>
          </div>
        </div>
      </div>

      {footer && <div>{footer}</div>}
    </div>
  );
}
