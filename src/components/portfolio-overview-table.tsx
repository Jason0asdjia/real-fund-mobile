"use client";

import Link from "next/link";
import { useRef } from "react";
import type { ReactNode, Ref, TouchEvent as ReactTouchEvent } from "react";
import { SlidersHorizontal } from "lucide-react";

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
  const touchStateRef = useRef<{
    startX: number;
    startY: number;
    axis: "x" | "y" | null;
    ignoreHorizontal: boolean;
    lastX: number;
  } | null>(null);

  const isTouchActiveRef = useRef(false);

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStateRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      axis: null,
      ignoreHorizontal: Boolean((event.target as HTMLElement | null)?.closest("[data-sticky-fund-cell='true']")),
      lastX: touch.clientX,
    };
    isTouchActiveRef.current = true;
  };

  const handleTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    const touchState = touchStateRef.current;
    if (!touch || !touchState) return;

    const deltaX = touch.clientX - touchState.startX;
    const deltaY = touch.clientY - touchState.startY;

    if (!touchState.axis) {
      touchState.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
    }

    const container = event.currentTarget;

    if (touchState.axis === "x") {
      event.preventDefault();
      if (touchState.ignoreHorizontal) return;

      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      if (maxScrollLeft <= 0) return;

      const currentX = touch.clientX;
      const deltaFromLast = touchState.lastX - currentX;
      touchState.lastX = currentX;
      const nextScrollLeft = container.scrollLeft + deltaFromLast;
      container.scrollLeft = Math.max(0, Math.min(maxScrollLeft, nextScrollLeft));
      return;
    }

    const maxScrollTop = container.scrollHeight - container.clientHeight;
    if (maxScrollTop <= 0) return;

    const atTopEdge = container.scrollTop <= 0;
    const atBottomEdge = container.scrollTop >= maxScrollTop - 1;

    if ((atTopEdge && deltaY > 0) || (atBottomEdge && deltaY < 0)) {
      event.preventDefault();
    }
  };

  const handleTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    touchStateRef.current = null;
    isTouchActiveRef.current = false;
    onScrollPositionChange({
      top: event.currentTarget.scrollTop,
      left: event.currentTarget.scrollLeft,
    });
  };

  return (
    <div
      ref={scrollContainerRef}
      className="h-full overflow-auto border border-b-0 border-slate-200 bg-white shadow-sm overscroll-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [touch-action:pan-y]"
      role="region"
      aria-label="持仓总览表格"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onScroll={(event) => {
        if (isTouchActiveRef.current) return;
        onScrollPositionChange({
          top: event.currentTarget.scrollTop,
          left: event.currentTarget.scrollLeft,
        });
      }}
    >
      <Table className="w-max min-w-full border-separate border-spacing-0 text-left">
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            <TableHead data-sticky-fund-cell="true" className="sticky left-0 top-0 z-20 w-[160px] min-w-[160px] max-w-[160px] border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600 shadow-[1px_0_0_0_theme(colors.slate.200)]">
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
              <TableHead key={column.id} className="sticky top-0 z-10 w-auto border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.code} className="bg-white">
              <TableCell data-sticky-fund-cell="true" className="sticky left-0 z-[1] w-[160px] min-w-[160px] max-w-[160px] border-b border-slate-200 bg-white px-3 py-2 shadow-[1px_0_0_0_theme(colors.slate.200)]">
                <Link href={`/portfolio/${row.code}`} className="block rounded-sm outline-none transition-colors hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-300" onClick={onBeforeNavigate}>
                  <div className="max-w-[160px] truncate text-sm font-semibold text-slate-900">{row.fundName}</div>
                  <div className="mt-1 max-w-[160px] truncate text-[11px] tabular-nums text-slate-500">
                    {row.code} | {row.holdingAmountLabel}
                  </div>
                </Link>
              </TableCell>
              {visibleColumns.map((column) => (
                <TableCell key={`${row.code}-${column.id}`} className={getCellClass(row, column.id)}>
                  {renderCellValue(row, column.id)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
