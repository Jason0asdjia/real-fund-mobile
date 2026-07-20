"use client";

import Link from "next/link";
import { useRef } from "react";
import type { ReactNode, Ref, TouchEvent as ReactTouchEvent } from "react";
import { SlidersHorizontal } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const PORTFOLIO_OVERVIEW_COLUMN_OPTIONS = [
  { id: "latestNav", label: "最新净值", defaultVisible: true },
  { id: "estimateNav", label: "估算净值", defaultVisible: false },
  { id: "yesterdayChangePercent", label: "昨日涨幅", defaultVisible: false },
  { id: "estimateChangePercent", label: "估值涨幅", defaultVisible: true },
  { id: "totalChangePercent", label: "估算收益", defaultVisible: true },
  { id: "holdingAmount", label: "持仓金额", defaultVisible: false },
  { id: "holdingDays", label: "持有天数", defaultVisible: false },
  { id: "todayProfit", label: "当日收益", defaultVisible: false },
  { id: "holdingProfit", label: "持有收益", defaultVisible: false },
] as const;

export type PortfolioOverviewColumnId = typeof PORTFOLIO_OVERVIEW_COLUMN_OPTIONS[number]["id"];

export type PortfolioOverviewColumn = (typeof PORTFOLIO_OVERVIEW_COLUMN_OPTIONS)[number];

export type PortfolioOverviewRow = {
  code: string;
  fundName: string;
  estimateNav: string;
  yesterdayChangePercent: number | null;
  estimateChangePercent: number | null;
  latestNav: string;
  totalChangePercent: number | null;
  holdingAmount: number;
  holdingDays: number | null;
  holdingDaysUpdatedAt: string;
  todayProfit: number | null;
  todayProfitStatus: "estimated" | "official" | "none";
  holdingProfit: number | null;
  estimatedHoldingProfit: number | null;
  holdingAmountLabel: string;
  officialUpdatedAt: string;
  officialConfirmedUpdatedAt: string;
  yesterdayChangeUpdatedAt: string;
  estimateUpdatedAt: string;
  holdingAmountUpdatedAt: string;
  currentValueUpdatedAt: string;
  estimatedProfitUpdatedAt: string;
  debugSourceTag: string | null;
};

type PortfolioOverviewTableProps = {
  rows: PortfolioOverviewRow[];
  visibleColumns: readonly PortfolioOverviewColumn[];
  scrollContainerRef: Ref<HTMLDivElement>;
  onOpenColumnConfig: () => void;
  onScrollPositionChange: (position: { top: number; left: number }) => void;
  onBeforeNavigate: () => void;
  getCellClass: (row: PortfolioOverviewRow, id: PortfolioOverviewColumnId) => string;
  renderCellValue: (row: PortfolioOverviewRow, id: PortfolioOverviewColumnId) => ReactNode;
};

export function PortfolioOverviewTable({
  rows,
  visibleColumns,
  scrollContainerRef,
  onOpenColumnConfig,
  onScrollPositionChange,
  onBeforeNavigate,
  getCellClass,
  renderCellValue,
}: PortfolioOverviewTableProps) {
  const lockScrollLeftRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const axisRef = useRef<"x" | "y" | null>(null);

  const AXIS_LOCK_THRESHOLD = 8;
  const AXIS_BIAS = 4;

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    axisRef.current = null;
    const onStickyCell = Boolean(
      (event.target as HTMLElement | null)?.closest("[data-sticky-fund-cell='true']"),
    );
    if (onStickyCell) {
      lockScrollLeftRef.current = event.currentTarget.scrollLeft;
    } else {
      lockScrollLeftRef.current = null;
    }
  };

  const handleTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (lockScrollLeftRef.current != null) {
      const container = event.currentTarget;
      if (container.scrollLeft !== lockScrollLeftRef.current) {
        container.scrollLeft = lockScrollLeftRef.current;
      }
      return;
    }

    const touch = event.touches[0];
    if (!touch) return;

    const deltaX = touch.clientX - startXRef.current;
    const deltaY = touch.clientY - startYRef.current;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!axisRef.current) {
      if (absX < AXIS_LOCK_THRESHOLD && absY < AXIS_LOCK_THRESHOLD) return;
      axisRef.current = absX > absY + AXIS_BIAS ? "x" : "y";
    }

    if (axisRef.current !== "x") return;

    const maxScrollLeft =
      event.currentTarget.scrollWidth - event.currentTarget.clientWidth;
    if (maxScrollLeft <= 0) return;

    const atLeftEdge = event.currentTarget.scrollLeft <= 0;
    const atRightEdge = event.currentTarget.scrollLeft >= maxScrollLeft - 1;

    if (
      (atLeftEdge && deltaX > 0) ||
      (atRightEdge && deltaX < 0)
    ) {
      if (event.cancelable) {
        event.preventDefault();
      }
    }
  };

  const handleTouchEnd = () => {
    lockScrollLeftRef.current = null;
    axisRef.current = null;
  };

  return (
    <ScrollArea
      ref={scrollContainerRef}
      orientation="both"
      hideScrollbar
      className="h-full border border-b-0 border-slate-200 bg-white shadow-sm overscroll-none"
      role="region"
      aria-label="持仓总览表格"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onScroll={(event) =>
        onScrollPositionChange({
          top: event.currentTarget.scrollTop,
          left: event.currentTarget.scrollLeft,
        })
      }
    >
      <Table className="w-max min-w-full border-separate border-spacing-0 text-left">
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            <TableHead
              data-sticky-fund-cell="true"
              className="sticky left-0 top-0 z-20 w-[160px] min-w-[160px] max-w-[160px] border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600 shadow-[1px_0_0_0_theme(colors.slate.200)] [touch-action:pan-y]"
            >
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onOpenColumnConfig}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-700"
                  aria-label="配置列显示"
                >
                  <SlidersHorizontal size={13} />
                </button>
                <span>基金名称</span>
              </div>
            </TableHead>
            {visibleColumns.map((column) => (
              <TableHead
                key={column.id}
                className="sticky top-0 z-10 w-auto border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600 whitespace-nowrap"
              >
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.code} className="bg-white">
              <TableCell
                data-sticky-fund-cell="true"
                className="sticky left-0 z-[1] w-[160px] min-w-[160px] max-w-[160px] border-b border-slate-200 bg-white px-3 py-2 shadow-[1px_0_0_0_theme(colors.slate.200)] [touch-action:pan-y]"
              >
                <Link
                  href={`/portfolio/${row.code}`}
                  className="block rounded-sm outline-none transition-colors hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-300 [touch-action:pan-y]"
                  onClick={onBeforeNavigate}
                >
                  <div className="max-w-[160px] truncate text-sm font-semibold text-slate-900">
                    {row.fundName}
                  </div>
                  <div className="mt-1 max-w-[160px] truncate text-[11px] tabular-nums text-slate-500">
                    {row.code} | {row.holdingAmountLabel}
                  </div>
                </Link>
              </TableCell>
              {visibleColumns.map((column) => (
                <TableCell
                  key={`${row.code}-${column.id}`}
                  className={getCellClass(row, column.id)}
                >
                  {renderCellValue(row, column.id)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
