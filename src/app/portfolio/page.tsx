"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, Circle, GripVertical, Search, SlidersHorizontal, X } from "lucide-react";

import { useAppState } from "@/components/app-provider";
import { formatCurrency, formatSignedCurrency, getHoldingMetrics } from "@/lib/portfolio";
import { holdingDaysInMarket, toMarketDay, todayInMarket } from "@/lib/time";
import type { FundHolding, FundSnapshot } from "@/lib/types";

const VIEW_STATE_KEY = "real-fund-mobile:portfolio-view-state";
const COLUMN_VISIBILITY_KEY = "real-fund-mobile:portfolio-column-visibility";
const COLUMN_ORDER_KEY = "real-fund-mobile:portfolio-column-order";

type PortfolioViewState = {
  windowY: number;
  tableTop: number;
  tableLeft: number;
};

const readViewState = (): PortfolioViewState => {
  if (typeof window === "undefined") return { windowY: 0, tableTop: 0, tableLeft: 0 };
  try {
    const raw = window.sessionStorage.getItem(VIEW_STATE_KEY);
    if (!raw) return { windowY: 0, tableTop: 0, tableLeft: 0 };
    return { windowY: 0, tableTop: 0, tableLeft: 0, ...JSON.parse(raw) };
  } catch {
    return { windowY: 0, tableTop: 0, tableLeft: 0 };
  }
};

type PortfolioRow = {
  code: string;
  fundName: string;
  estimateNav: string;
  yesterdayChangePercent: number | null;
  estimateChangePercent: number | null;
  latestNav: string;
  totalChangePercent: number | null;
  holdingAmount: number;
  holdingDays: number | null;
  todayProfit: number | null;
  todayProfitStatus: "estimated" | "official" | "none";
  holdingProfit: number | null;
  holdingAmountLabel: string;
  updatedDate: string;
};

const COLUMN_OPTIONS = [
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

type ColumnId = typeof COLUMN_OPTIONS[number]["id"];

const defaultColumnVisibility = COLUMN_OPTIONS.reduce<Record<ColumnId, boolean>>((acc, item) => {
  acc[item.id] = item.defaultVisible;
  return acc;
}, {} as Record<ColumnId, boolean>);

const defaultColumnOrder = COLUMN_OPTIONS.map((item) => item.id);

const numberFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatSignedPercent = (value?: number | null) => {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

const formatNav = (value?: string | number | null) => {
  const nav = Number(value);
  if (!Number.isFinite(nav)) return "—";
  return nav.toFixed(4);
};

const resolveUpdatedDate = (fund: FundSnapshot) => {
  if (fund.gztime) return toMarketDay(fund.gztime).format("YYYY-MM-DD");
  if (fund.jzrq) return toMarketDay(`${fund.jzrq}T00:00:00`).format("YYYY-MM-DD");
  return "—";
};

const resolveTodayProfitStatus = (fund: FundSnapshot, todayProfit: number | null, today: string): PortfolioRow["todayProfitStatus"] => {
  if (todayProfit == null) return "none";

  const hasOfficialToday = fund.jzrq === today && Number.isFinite(Number(fund.zzl ?? fund.dwjz));
  if (hasOfficialToday || fund.quoteStatus === "official") return "official";

  return "estimated";
};

const buildRows = (funds: FundSnapshot[], holdings: Record<string, FundHolding>, today: string): PortfolioRow[] => {
  return funds.map((fund) => {
    const holding = holdings[fund.code];
    const metrics = getHoldingMetrics(fund, holding);
    const amount = metrics?.amount ?? 0;
    const costBasis = holding?.cost != null && holding?.share != null ? Number(holding.cost) * Number(holding.share) : null;
    const holdingProfitPercent = costBasis && costBasis > 0 && metrics?.profitTotal != null ? (metrics.profitTotal / costBasis) * 100 : null;
    const hasTodayData = fund.jzrq === today;
    const hasTodayEstimate = !fund.noValuation && typeof fund.gztime === "string" && fund.gztime.startsWith(today);
    const estimateChangePercent = fund.noValuation || fund.gszzl == null ? null : Number(fund.gszzl);
    const totalChangePercent = hasTodayData
      ? holdingProfitPercent
      : hasTodayEstimate || holdingProfitPercent != null
        ? (hasTodayEstimate && estimateChangePercent != null ? estimateChangePercent : 0) + (holdingProfitPercent ?? 0)
        : null;
    const yesterdayChangePercent = fund.zzl == null ? null : Number(fund.zzl);
    const firstPurchaseDate = holding?.firstPurchaseDate || null;
    const holdingDays = holdingDaysInMarket(firstPurchaseDate);
    const todayProfit = metrics?.profitToday ?? null;

    return {
      code: fund.code,
      fundName: fund.name,
      estimateNav: fund.noValuation ? "—" : formatNav(fund.gsz),
      yesterdayChangePercent,
      estimateChangePercent,
      latestNav: formatNav(fund.dwjz),
      totalChangePercent,
      holdingAmount: amount,
      holdingDays,
      todayProfit,
      todayProfitStatus: resolveTodayProfitStatus(fund, todayProfit, today),
      holdingProfit: metrics?.profitTotal ?? null,
      holdingAmountLabel: formatCurrency(amount),
      updatedDate: resolveUpdatedDate(fund),
    };
  });
};

const readColumnVisibility = (): Record<ColumnId, boolean> => {
  if (typeof window === "undefined") return defaultColumnVisibility;
  try {
    const raw = window.localStorage.getItem(COLUMN_VISIBILITY_KEY);
    if (!raw) return defaultColumnVisibility;
    const parsed = JSON.parse(raw) as Partial<Record<ColumnId, boolean>>;
    return { ...defaultColumnVisibility, ...parsed };
  } catch {
    return defaultColumnVisibility;
  }
};

const readColumnOrder = (): ColumnId[] => {
  if (typeof window === "undefined") return defaultColumnOrder;
  try {
    const raw = window.localStorage.getItem(COLUMN_ORDER_KEY);
    if (!raw) return defaultColumnOrder;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultColumnOrder;

    const parsedIds = parsed.filter((item): item is ColumnId => typeof item === "string" && defaultColumnOrder.includes(item as ColumnId));
    const deduped = Array.from(new Set(parsedIds));
    const missing = defaultColumnOrder.filter((id) => !deduped.includes(id));
    return [...deduped, ...missing];
  } catch {
    return defaultColumnOrder;
  }
};

export default function PortfolioPage() {
  const { state, refreshFunds } = useAppState();
  const [restoredState, setRestoredState] = useState<PortfolioViewState>({ windowY: 0, tableTop: 0, tableLeft: 0 });
  const [columnVisibility, setColumnVisibility] = useState<Record<ColumnId, boolean>>(() => readColumnVisibility());
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(() => readColumnOrder());
  const [draggingColumnId, setDraggingColumnId] = useState<ColumnId | null>(null);
  const [touchDraggingColumnId, setTouchDraggingColumnId] = useState<ColumnId | null>(null);
  const [columnModalOpen, setColumnModalOpen] = useState(false);
  const viewStateRef = useRef<PortfolioViewState>({ windowY: 0, tableTop: 0, tableLeft: 0 });
  const tableRef = useRef<HTMLDivElement | null>(null);
  const tableRestoredRef = useRef(false);
  const columnItemRefs = useRef<Partial<Record<ColumnId, HTMLDivElement | null>>>({});
  const previousRectsRef = useRef<Partial<Record<ColumnId, DOMRect>>>({});
  const touchDragTargetRef = useRef<ColumnId | null>(null);

  const totals = state.funds.reduce(
    (acc, fund) => {
      const metrics = getHoldingMetrics(fund, state.holdings[fund.code]);
      acc.amount += metrics?.amount || 0;
      acc.today += metrics?.profitToday || 0;
      acc.total += metrics?.profitTotal || 0;
      return acc;
    },
    { amount: 0, today: 0, total: 0 },
  );

  useEffect(() => {
    const next = readViewState();
    viewStateRef.current = next;
    setRestoredState(next);

    const frame = window.requestAnimationFrame(() => {
      window.scrollTo(0, next.windowY);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!tableRef.current || tableRestoredRef.current) return;
    tableRef.current.scrollTop = restoredState.tableTop;
    tableRef.current.scrollLeft = restoredState.tableLeft;
    tableRestoredRef.current = true;
  }, [restoredState.tableLeft, restoredState.tableTop]);

  const persistViewState = useCallback((next?: Partial<PortfolioViewState>) => {
    if (typeof window === "undefined") return;
    viewStateRef.current = {
      ...viewStateRef.current,
      ...next,
    };
    window.sessionStorage.setItem(VIEW_STATE_KEY, JSON.stringify(viewStateRef.current));
  }, []);

  useEffect(() => {
    const syncWindow = () => persistViewState({ windowY: window.scrollY });
    window.addEventListener("scroll", syncWindow, { passive: true });
    return () => window.removeEventListener("scroll", syncWindow);
  }, [persistViewState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(columnVisibility));
  }, [columnVisibility]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(columnOrder));
  }, [columnOrder]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("app-modal-open", columnModalOpen);
    return () => {
      document.body.classList.remove("app-modal-open");
    };
  }, [columnModalOpen]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    if (state.funds.length === 0) return;
    void refreshFunds();
  }, [refreshFunds, state.funds.length]);

  const rows = useMemo(
    () => buildRows(state.funds, state.holdings, todayInMarket()),
    [state.funds, state.holdings],
  );
  const totalUpdatedAt = state.lastUpdatedAt ? toMarketDay(state.lastUpdatedAt).format("MM-DD HH:mm") : "--";
  const todayBase = totals.amount - totals.today;
  const todayRate = todayBase > 0 ? (totals.today / todayBase) * 100 : null;
  const totalTodayProfitStatus = rows.some((row) => row.todayProfitStatus === "estimated")
    ? "estimated"
    : rows.some((row) => row.todayProfitStatus === "official")
      ? "official"
      : "none";

  const orderedColumns = useMemo(() => {
    const optionById = new Map(COLUMN_OPTIONS.map((item) => [item.id, item] as const));
    return columnOrder.map((id) => optionById.get(id)).filter((item): item is (typeof COLUMN_OPTIONS)[number] => Boolean(item));
  }, [columnOrder]);

  const visibleColumns = useMemo(
    () => orderedColumns.filter((item) => columnVisibility[item.id]),
    [columnVisibility, orderedColumns],
  );

  const moveColumn = useCallback((sourceId: ColumnId, targetId: ColumnId) => {
    if (sourceId === targetId) return;

    const nextPreviousRects: Partial<Record<ColumnId, DOMRect>> = {};
    defaultColumnOrder.forEach((id) => {
      const node = columnItemRefs.current[id];
      if (!node) return;
      nextPreviousRects[id] = node.getBoundingClientRect();
    });
    previousRectsRef.current = nextPreviousRects;

    setColumnOrder((prev) => {
      const sourceIndex = prev.indexOf(sourceId);
      const targetIndex = prev.indexOf(targetId);
      if (sourceIndex < 0 || targetIndex < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    const previousRects = previousRectsRef.current;
    const nextRects: Partial<Record<ColumnId, DOMRect>> = {};

    defaultColumnOrder.forEach((id) => {
      const node = columnItemRefs.current[id];
      if (!node) return;
      nextRects[id] = node.getBoundingClientRect();
    });

    defaultColumnOrder.forEach((id) => {
      const node = columnItemRefs.current[id];
      const previous = previousRects[id];
      const next = nextRects[id];
      if (!node || !previous || !next) return;

      const deltaX = previous.left - next.left;
      const deltaY = previous.top - next.top;
      if (!deltaX && !deltaY) return;

      node.getAnimations().forEach((animation) => animation.cancel());
      node.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: "translate(0, 0)" },
        ],
        {
          duration: 280,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
      );
    });

    previousRectsRef.current = nextRects;
  }, [columnOrder]);

  const handleTouchDragMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!touchDraggingColumnId) return;

      let hoveredId: ColumnId | null = null;

      defaultColumnOrder.forEach((id) => {
        if (hoveredId) return;
        const node = columnItemRefs.current[id];
        if (!node) return;
        const rect = node.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const centerThresholdX = rect.width * 0.28;
        const centerThresholdY = rect.height * 0.32;
        const insideCenterZone = Math.abs(clientX - centerX) <= centerThresholdX && Math.abs(clientY - centerY) <= centerThresholdY;

        if (insideCenterZone) {
          hoveredId = id;
        }
      });

      if (!hoveredId) {
        touchDragTargetRef.current = null;
        return;
      }

      if (hoveredId === touchDraggingColumnId) {
        touchDragTargetRef.current = null;
        return;
      }

      if (touchDragTargetRef.current === hoveredId) return;
      touchDragTargetRef.current = hoveredId;
      moveColumn(touchDraggingColumnId, hoveredId);
    },
    [moveColumn, touchDraggingColumnId],
  );

  useEffect(() => {
    if (!touchDraggingColumnId) return;

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();
      handleTouchDragMove(event.clientX, event.clientY);
    };

    const stopDragging = () => {
      touchDragTargetRef.current = null;
      setTouchDraggingColumnId(null);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [handleTouchDragMove, touchDraggingColumnId]);

  const renderCellValue = (row: PortfolioRow, id: ColumnId) => {
    const primaryValue =
      id === "latestNav"
        ? row.latestNav
        : id === "estimateNav"
          ? row.estimateNav
          : id === "yesterdayChangePercent"
            ? formatSignedPercent(row.yesterdayChangePercent)
            : id === "estimateChangePercent"
              ? formatSignedPercent(row.estimateChangePercent)
              : id === "totalChangePercent"
                ? formatSignedPercent(row.totalChangePercent)
                : id === "holdingAmount"
                  ? formatCurrency(row.holdingAmount)
                  : id === "holdingDays"
                    ? row.holdingDays == null
                      ? "—"
                      : `${row.holdingDays}天`
                    : id === "todayProfit"
                      ? formatSignedCurrency(row.todayProfit)
                      : formatSignedCurrency(row.holdingProfit);

    const valueNode =
      id === "todayProfit" && row.todayProfitStatus !== "none" ? (
        <span className="inline-flex items-center gap-1">
          {row.todayProfitStatus === "official" ? (
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current">
              <Check size={10} strokeWidth={3} />
            </span>
          ) : (
            <Circle size={12} className="text-red-500" strokeWidth={2.2} />
          )}
          <span>{primaryValue}</span>
        </span>
      ) : (
        <span>{primaryValue}</span>
      );

    return (
      <div className="flex flex-col leading-tight">
        {valueNode}
        <span className="mt-1 text-[10px] font-medium text-[#8a90a0]">{row.updatedDate}</span>
      </div>
    );
  };

  const getCellClass = (row: PortfolioRow, id: ColumnId) => {
    const base = "px-0 py-3 text-sm tabular-nums align-top";
    if (id === "yesterdayChangePercent" || id === "estimateChangePercent" || id === "totalChangePercent") {
      const value = id === "yesterdayChangePercent" ? row.yesterdayChangePercent : id === "estimateChangePercent" ? row.estimateChangePercent : row.totalChangePercent;
      if (value == null) return `${base} text-[#747781]`;
      return `${base} font-bold ${value < 0 ? "text-emerald-700" : "text-red-600"}`;
    }
    if (id === "todayProfit" || id === "holdingProfit") {
      const value = id === "todayProfit" ? row.todayProfit : row.holdingProfit;
      if (value == null) return `${base} text-[#747781]`;
      return `${base} font-bold ${value < 0 ? "text-emerald-700" : "text-red-600"}`;
    }
    if (id === "holdingAmount") return `${base} text-[#131b2e]`;
    return `${base} font-medium text-[#131b2e]`;
  };

  return (
    <div className="-mx-3 -mt-4 flex h-[calc(100dvh-6.6rem)] w-[calc(100%+1.5rem)] max-w-none flex-col gap-0 overflow-hidden bg-white md:-mx-4 md:-mt-4 md:w-[calc(100%+2rem)]">
      <section className="bg-[#d7e2ff] px-3 pb-5 pt-2 text-[#001b3f]">
        <header className="flex h-11 items-center justify-between">
          <h1 className="text-2xl font-extrabold leading-none tracking-tight">基金资产概览</h1>
          <Link href="/discover" aria-label="搜索基金" className="rounded-md p-1 text-[#24467c] transition-colors hover:bg-black/5">
            <Search size={18} />
          </Link>
        </header>

        <div className="mt-1.5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-[9px] font-semibold tracking-[0.14em] text-[#24467c]/70">基金总资产（人民币）</p>
            <p className="text-[10px] font-semibold text-[#24467c]/75">{totalUpdatedAt}</p>
          </div>
          <p className="text-[26px] font-extrabold leading-none tracking-tight tabular-nums">{numberFormatter.format(totals.amount)}</p>

          <div className="mt-4 flex items-center justify-between gap-2">
            <div>
              <p className="text-[9px] font-medium tracking-[0.06em] text-[#24467c]/70">今日收益</p>
              <p className="inline-flex items-center gap-1.5 text-lg font-bold leading-none text-[#24467c] tabular-nums">
                {totalTodayProfitStatus === "official" ? (
                  <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current">
                    <Check size={10} strokeWidth={3} />
                  </span>
                ) : totalTodayProfitStatus === "estimated" ? (
                  <Circle size={12} className="text-red-500" strokeWidth={2.2} />
                ) : null}
                <span>
                  {formatSignedCurrency(totals.today)} <span className="text-sm font-semibold">{`(${formatSignedPercent(todayRate)})`}</span>
                </span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-medium tracking-[0.06em] text-[#24467c]/70">累计收益</p>
              <p className="text-lg font-bold leading-none text-[#24467c] tabular-nums">{formatSignedCurrency(totals.total)}</p>
            </div>
          </div>
        </div>
      </section>

      <main className="flex min-h-0 flex-1 flex-col space-y-3 overflow-hidden bg-white pb-0">
        {!state.funds.length ? (
          <section className="px-4 pt-4">
            <div className="rounded-xl bg-[#f2f3ff] p-4 text-sm text-[#43474f]">
              <h2 className="m-0 text-base font-bold text-[#131b2e]">还没有可展示的基金持仓</h2>
              <p className="mb-0 mt-2">先去发现页添加基金并录入持仓，回到这里会自动生成总览表。</p>
              <Link href="/discover" className="mt-3 inline-flex items-center rounded-full bg-[#00193c] px-3 py-1.5 text-sm font-semibold text-white">
                去添加基金
              </Link>
            </div>
          </section>
        ) : (
          <>
            <section className="min-h-0 flex-1 bg-white">
              <div
                ref={tableRef}
                className="h-full overflow-auto pb-16 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="region"
                aria-label="持仓总览表格"
                onScroll={(event) =>
                  persistViewState({
                    tableTop: event.currentTarget.scrollTop,
                    tableLeft: event.currentTarget.scrollLeft,
                  })
                }
              >
                <table className="w-max min-w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#e2e7ff] bg-[#f2f3ff]">
                      <th className="sticky left-0 top-0 z-20 w-[132px] max-w-[132px] bg-[#f2f3ff] px-3 py-2.5 text-[10px] font-bold tracking-[0.08em] text-[#747781]">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setColumnModalOpen(true)}
                            className="inline-flex h-5 w-5 items-center justify-center rounded text-[#53617a] hover:bg-black/5"
                            aria-label="配置列显示"
                          >
                            <SlidersHorizontal size={13} />
                          </button>
                          <span>基金名称</span>
                        </div>
                      </th>
                      {visibleColumns.map((column) => (
                        <th key={column.id} className="sticky top-0 z-10 min-w-[84px] bg-[#f2f3ff] px-0 py-2.5 text-[10px] font-bold tracking-[0.08em] text-[#747781]">
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f2f3ff]">
                    {rows.map((row) => (
                      <tr key={row.code}>
                        <td className="sticky left-0 z-[1] w-[132px] max-w-[132px] bg-white px-3 py-3">
                          <Link href={`/portfolio/${row.code}`} className="block" onClick={() => persistViewState({ windowY: window.scrollY })}>
                            <div className="max-w-[132px] truncate text-sm font-bold text-[#131b2e]">{row.fundName}</div>
                            <div className="max-w-[132px] truncate text-[10px] tabular-nums text-[#747781]">
                              {row.code} | {row.holdingAmountLabel}
                            </div>
                          </Link>
                        </td>
                        {visibleColumns.map((column) => (
                          <td key={`${row.code}-${column.id}`} className={getCellClass(row, column.id)}>
                            {renderCellValue(row, column.id)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>

      {columnModalOpen ? (
        <div className="app-modal-backdrop" onClick={() => setColumnModalOpen(false)}>
          <div className="app-modal-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="app-modal-sheet__grabber" />
            <div className="app-modal-sheet__header">
              <h3 className="m-0 text-base font-bold text-[#131b2e]">表格列显示设置</h3>
              <button
                type="button"
                onClick={() => setColumnModalOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#53617a] hover:bg-slate-100"
                aria-label="关闭列设置"
              >
                <X size={16} />
              </button>
            </div>
            <div className="app-modal-sheet__content">
              <div className="grid grid-cols-2 gap-2">
                {orderedColumns.map((item) => (
                  <div
                    key={item.id}
                    data-column-id={item.id}
                    ref={(node) => {
                      columnItemRefs.current[item.id] = node;
                    }}
                    draggable
                    onDragStart={(event) => {
                      setDraggingColumnId(item.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", item.id);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const sourceId = event.dataTransfer.getData("text/plain") as ColumnId;
                      if (!sourceId) return;
                      moveColumn(sourceId, item.id);
                      setDraggingColumnId(null);
                    }}
                    onDragEnd={() => setDraggingColumnId(null)}
                    className={`flex items-center gap-2 rounded-lg border border-[#e2e7ff] px-2.5 py-2 text-sm text-[#131b2e] will-change-transform ${draggingColumnId === item.id || touchDraggingColumnId === item.id ? "opacity-60" : "opacity-100"}`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={columnVisibility[item.id]}
                      onChange={(event) =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          [item.id]: event.target.checked,
                        }))
                      }
                    />
                    <span className="flex-1">{item.label}</span>
                    <button
                      type="button"
                      onPointerDown={(event) => {
                        if (event.pointerType === "mouse") return;
                        if (touchDraggingColumnId && touchDraggingColumnId !== item.id) return;
                        event.preventDefault();
                        touchDragTargetRef.current = item.id;
                        setTouchDraggingColumnId(item.id);
                      }}
                      className={`inline-flex cursor-grab text-[#8a90a0] active:cursor-grabbing ${touchDraggingColumnId === item.id ? "opacity-60" : "opacity-100"}`}
                      aria-label="拖拽排序"
                      style={{ touchAction: "none", pointerEvents: touchDraggingColumnId && touchDraggingColumnId !== item.id ? "none" : "auto" }}
                    >
                      <GripVertical size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
