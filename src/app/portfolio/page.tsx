"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, Circle, GripVertical, Search, X } from "lucide-react";

import { useAppState } from "@/components/app-provider";
import {
  PORTFOLIO_OVERVIEW_COLUMN_OPTIONS,
  PortfolioOverviewTable,
  type PortfolioOverviewColumn,
  type PortfolioOverviewColumnId,
  type PortfolioOverviewRow,
} from "@/components/portfolio-overview-table";
import { formatCurrency, formatSignedCurrency } from "@/lib/portfolio";
import { holdingDaysInMarket, isEstimateTimestampUsable, toMarketDay, todayInMarket } from "@/lib/time";
import type { FundHolding, FundSnapshot, FundTransaction } from "@/lib/types";

const VIEW_STATE_KEY = "real-fund-mobile:portfolio-view-state";
const COLUMN_VISIBILITY_KEY = "real-fund-mobile:portfolio-column-visibility";
const COLUMN_ORDER_KEY = "real-fund-mobile:portfolio-column-order";

type PortfolioViewState = {
  windowY: number;
  tableTop: number;
  tableLeft: number;
};

type DragGhostState = {
  id: PortfolioOverviewColumnId;
  x: number;
  y: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
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

const defaultColumnVisibility = PORTFOLIO_OVERVIEW_COLUMN_OPTIONS.reduce<Record<PortfolioOverviewColumnId, boolean>>((acc, item) => {
  acc[item.id] = item.defaultVisible;
  return acc;
}, {} as Record<PortfolioOverviewColumnId, boolean>);

const defaultColumnOrder = PORTFOLIO_OVERVIEW_COLUMN_OPTIONS.map((item) => item.id);
const isDevMode = process.env.NODE_ENV !== "production";

const getSourceLabel = (source?: FundSnapshot["source"]) => {
  if (!source) return "--";
  if (source === "eastmoney") return "东方财富";
  if (source === "tencent") return "腾讯";
  if (source === "sina") return "新浪";
  if (source === "danjuan") return "蛋卷(历史)";
  if (source === "fallback") return "备用源";
  return "未知";
};

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

const resolveTodayProfitStatus = (hasOfficialToday: boolean, todayProfit: number | null): PortfolioOverviewRow["todayProfitStatus"] => {
  if (todayProfit == null) return "none";
  if (hasOfficialToday) return "official";

  return "estimated";
};

const buildRows = (
  funds: FundSnapshot[],
  holdings: Record<string, FundHolding>,
  _transactions: Record<string, FundTransaction[]>,
  today: string,
): PortfolioOverviewRow[] => {
  const holdingDaysSettlementLabel = toMarketDay(`${today}T00:00:00`).format("MM-DD");

  return funds.map((fund) => {
    const holding = holdings[fund.code];
    const share = holding?.share != null ? Number(holding.share) : null;
    const unitCost = holding?.cost != null ? Number(holding.cost) : null;
    const hasValidPosition = share != null && Number.isFinite(share) && share > 0;
    const hasValidCost = unitCost != null && Number.isFinite(unitCost);
    const hasCostPosition = hasValidPosition && hasValidCost;
    const normalizedOfficialDate = fund.jzrq ? toMarketDay(`${fund.jzrq}T00:00:00`).format("YYYY-MM-DD") : null;
    const hasTodayData = normalizedOfficialDate === today;
    const hasTodayValuation = !fund.noValuation && isEstimateTimestampUsable(fund.gztime);
    const hasEstimateForDisplay = !fund.noValuation && isEstimateTimestampUsable(fund.gztime, { allowPreviousCloseCarry: true });
    const canUseEstimate = !hasTodayData && hasTodayValuation && Number.isFinite(Number(fund.gsz));
    const hasTodayEstimate = hasEstimateForDisplay;
    const estimateNav = hasTodayEstimate && Number.isFinite(Number(fund.gsz)) ? Number(fund.gsz) : null;
    const latestNav = Number.isFinite(Number(fund.dwjz)) ? Number(fund.dwjz) : null;
    const lastNav = Number(fund.lastNav);
    const estimateChangePercent = fund.noValuation
      ? null
      : hasEstimateForDisplay && Number.isFinite(Number(fund.gszzl))
        ? Number(fund.gszzl)
        : null;
    const officialChangePercentFromNav =
      latestNav != null && Number.isFinite(lastNav) && lastNav > 0
        ? ((latestNav - lastNav) / lastNav) * 100
        : null;
    const officialChangePercent = Number.isFinite(Number(fund.zzl)) ? Number(fund.zzl) : officialChangePercentFromNav;
    const yesterdayChangePercent = Number.isFinite(Number(fund.zzl)) ? Number(fund.zzl) : null;
    const useOfficialForTodayProfit = officialChangePercent != null && (hasTodayData || !canUseEstimate);
    const activeTodayChangePercent = useOfficialForTodayProfit ? officialChangePercent : canUseEstimate ? estimateChangePercent : null;
    const totalChangePercent = hasCostPosition
      ? estimateNav != null
        ? (estimateNav - Number(unitCost)) * Number(share)
        : null
      : null;
    const firstPurchaseDate = holding?.firstPurchaseDate || null;
    const holdingDays = holdingDaysInMarket(firstPurchaseDate);
    const holdingDaysUpdatedAt = holdingDaysSettlementLabel;
    const todayProfit =
      hasValidPosition && activeTodayChangePercent != null
        ? Number.isFinite(lastNav) && lastNav > 0
          ? Number(share) * lastNav * (activeTodayChangePercent / 100)
          : (() => {
              const navForBackCalc = hasTodayData ? latestNav : estimateNav;
              if (navForBackCalc == null) return null;
              const currentAmount = Number(share) * navForBackCalc;
              return currentAmount - currentAmount / (1 + activeTodayChangePercent / 100);
            })()
        : null;
    const holdingProfit = hasCostPosition
      ? latestNav != null
        ? (latestNav - Number(unitCost)) * Number(share)
        : null
      : null;
    const holdingAmount = hasValidPosition && latestNav != null ? Number(share) * latestNav : 0;
    const estimatedHoldingProfit = hasCostPosition
      ? estimateNav != null
        ? (estimateNav - Number(unitCost)) * Number(share)
        : holdingProfit
      : null;
    const officialUpdatedAt = fund.jzrq ? toMarketDay(`${fund.jzrq}T00:00:00`).format("MM-DD") : "—";
    const officialConfirmedUpdatedAt =
      fund.officialConfirmedAt && fund.officialConfirmedForDate === fund.jzrq
        ? toMarketDay(fund.officialConfirmedAt).format("MM-DD HH:mm")
        : officialUpdatedAt;
    const yesterdayChangeUpdatedAt = officialUpdatedAt;
    const estimateUpdatedAt = hasEstimateForDisplay && fund.gztime ? toMarketDay(fund.gztime).format("MM-DD HH:mm") : "—";
    const holdingAmountUpdatedAt = officialConfirmedUpdatedAt;
    const currentValueUpdatedAt = useOfficialForTodayProfit ? officialConfirmedUpdatedAt : canUseEstimate ? estimateUpdatedAt : officialUpdatedAt;
    const estimatedProfitUpdatedAt = estimateNav != null ? estimateUpdatedAt : "—";
    const officialSourceLabel = getSourceLabel(fund.officialSource ?? (fund.quoteStatus === "official" ? fund.source : undefined));
    const estimateSourceLabel = fund.noValuation
      ? "无"
      : getSourceLabel(fund.estimateSource ?? (fund.quoteStatus === "estimated" ? fund.source : undefined));
    const activeSourceLabel = useOfficialForTodayProfit ? officialSourceLabel : canUseEstimate ? estimateSourceLabel : officialSourceLabel;
    const debugSourceTag = `来源：${activeSourceLabel}`;

    return {
      code: fund.code,
      fundName: fund.name,
      estimateNav: estimateNav != null ? formatNav(estimateNav) : "—",
      yesterdayChangePercent,
      estimateChangePercent,
      latestNav: formatNav(fund.dwjz),
      totalChangePercent,
      holdingAmount,
      holdingDays,
      holdingDaysUpdatedAt,
      todayProfit,
      todayProfitStatus: resolveTodayProfitStatus(useOfficialForTodayProfit, todayProfit),
      holdingProfit,
      estimatedHoldingProfit,
      holdingAmountLabel: formatCurrency(holdingAmount),
      officialUpdatedAt,
      officialConfirmedUpdatedAt,
      yesterdayChangeUpdatedAt,
      estimateUpdatedAt,
      holdingAmountUpdatedAt,
      currentValueUpdatedAt,
      estimatedProfitUpdatedAt,
      debugSourceTag,
    };
  });
};

const readColumnVisibility = (): Record<PortfolioOverviewColumnId, boolean> => {
  if (typeof window === "undefined") return defaultColumnVisibility;
  try {
    const raw = window.localStorage.getItem(COLUMN_VISIBILITY_KEY);
    if (!raw) return defaultColumnVisibility;
    const parsed = JSON.parse(raw) as Partial<Record<PortfolioOverviewColumnId, boolean>>;
    return { ...defaultColumnVisibility, ...parsed };
  } catch {
    return defaultColumnVisibility;
  }
};

const readColumnOrder = (): PortfolioOverviewColumnId[] => {
  if (typeof window === "undefined") return defaultColumnOrder;
  try {
    const raw = window.localStorage.getItem(COLUMN_ORDER_KEY);
    if (!raw) return defaultColumnOrder;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultColumnOrder;

    const parsedIds = parsed.filter(
      (item): item is PortfolioOverviewColumnId => typeof item === "string" && defaultColumnOrder.includes(item as PortfolioOverviewColumnId),
    );
    const deduped = Array.from(new Set(parsedIds));
    const missing = defaultColumnOrder.filter((id) => !deduped.includes(id));
    return [...deduped, ...missing];
  } catch {
    return defaultColumnOrder;
  }
};

export default function PortfolioPage() {
  const { state } = useAppState();
  const [restoredState, setRestoredState] = useState<PortfolioViewState>({ windowY: 0, tableTop: 0, tableLeft: 0 });
  const [columnVisibility, setColumnVisibility] = useState<Record<PortfolioOverviewColumnId, boolean>>(() => readColumnVisibility());
  const [columnOrder, setColumnOrder] = useState<PortfolioOverviewColumnId[]>(() => readColumnOrder());
  const [draggingColumnId, setDraggingColumnId] = useState<PortfolioOverviewColumnId | null>(null);
  const [touchDraggingColumnId, setTouchDraggingColumnId] = useState<PortfolioOverviewColumnId | null>(null);
  const [dragGhost, setDragGhost] = useState<DragGhostState | null>(null);
  const [columnModalOpen, setColumnModalOpen] = useState(false);
  const [showTodayProfitPercent, setShowTodayProfitPercent] = useState(false);
  const [showTotalProfitPercent, setShowTotalProfitPercent] = useState(false);
  const viewStateRef = useRef<PortfolioViewState>({ windowY: 0, tableTop: 0, tableLeft: 0 });
  const tableRef = useRef<HTMLDivElement | null>(null);
  const tableRestoredRef = useRef(false);
  const columnItemRefs = useRef<Partial<Record<PortfolioOverviewColumnId, HTMLDivElement | null>>>({});
  const previousRectsRef = useRef<Partial<Record<PortfolioOverviewColumnId, DOMRect>>>({});
  const touchDragTargetRef = useRef<PortfolioOverviewColumnId | null>(null);

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

  const rows = useMemo(
    () => buildRows(state.funds, state.holdings, state.transactions, todayInMarket()),
    [state.funds, state.holdings, state.transactions],
  );
  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          acc.amount += row.holdingAmount || 0;
          acc.today += row.todayProfit || 0;
          acc.total += row.holdingProfit || 0;
          return acc;
        },
        { amount: 0, today: 0, total: 0 },
      ),
    [rows],
  );
  const totalUpdatedAt = state.lastUpdatedAt ? toMarketDay(state.lastUpdatedAt).format("MM-DD HH:mm") : "--";
  const todayBase = totals.amount - totals.today;
  const todayRate = todayBase > 0 ? (totals.today / todayBase) * 100 : null;
  const totalBase = totals.amount - totals.total;
  const totalRate = totalBase > 0 ? (totals.total / totalBase) * 100 : null;
  const effectiveTodayProfitRows = rows.filter((row) => row.holdingAmount > 0 && row.todayProfit != null);
  const totalTodayProfitStatus = effectiveTodayProfitRows.some((row) => row.todayProfitStatus === "estimated")
    ? "estimated"
    : effectiveTodayProfitRows.some((row) => row.todayProfitStatus === "official")
      ? "official"
      : "none";

  const orderedColumns = useMemo(() => {
    const optionById = new Map(PORTFOLIO_OVERVIEW_COLUMN_OPTIONS.map((item) => [item.id, item] as const));
    return columnOrder.map((id) => optionById.get(id)).filter((item): item is PortfolioOverviewColumn => Boolean(item));
  }, [columnOrder]);

  const visibleColumns = useMemo(
    () => orderedColumns.filter((item) => columnVisibility[item.id]),
    [columnVisibility, orderedColumns],
  );

  const moveColumn = useCallback((sourceId: PortfolioOverviewColumnId, targetId: PortfolioOverviewColumnId) => {
    if (sourceId === targetId) return;

    const nextPreviousRects: Partial<Record<PortfolioOverviewColumnId, DOMRect>> = {};
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
    const nextRects: Partial<Record<PortfolioOverviewColumnId, DOMRect>> = {};

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

      let hoveredId: PortfolioOverviewColumnId | null = null;

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
      setDragGhost((current) =>
        current
          ? {
              ...current,
              x: event.clientX,
              y: event.clientY,
            }
          : current,
      );
      handleTouchDragMove(event.clientX, event.clientY);
    };

    const stopDragging = () => {
      touchDragTargetRef.current = null;
      setTouchDraggingColumnId(null);
      setDragGhost(null);
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

  const renderCellValue = (row: PortfolioOverviewRow, id: PortfolioOverviewColumnId) => {
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
                ? formatSignedCurrency(row.totalChangePercent)
                : id === "holdingAmount"
                  ? formatCurrency(row.holdingAmount)
                  : id === "holdingDays"
                    ? row.holdingDays == null
                      ? "—"
                      : `${row.holdingDays}天`
                    : id === "todayProfit"
                      ? formatSignedCurrency(row.todayProfit)
                      : formatSignedCurrency(row.holdingProfit);

    const signedValue =
      id === "yesterdayChangePercent"
        ? row.yesterdayChangePercent
        : id === "estimateChangePercent"
          ? row.estimateChangePercent
          : id === "totalChangePercent"
            ? row.totalChangePercent
            : id === "todayProfit"
              ? row.todayProfit
              : id === "holdingProfit"
                ? row.holdingProfit
                : null;
    const valueClass = signedValue == null ? "text-slate-900" : getSignedValueTextClass(signedValue);

    const valueNode =
      id === "todayProfit" && row.todayProfitStatus !== "none" ? (
        <span className={`inline-flex items-center gap-1 ${valueClass}`}>
          {row.todayProfitStatus === "official" ? (
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current">
              <Check size={10} strokeWidth={3} />
            </span>
          ) : (
            <Circle size={12} className="text-rose-600" strokeWidth={2.2} />
          )}
          <span className={valueClass}>{primaryValue}</span>
        </span>
      ) : (
        <span className={valueClass}>{primaryValue}</span>
      );

    const updatedAt =
      id === "latestNav"
        ? row.officialUpdatedAt
        : id === "yesterdayChangePercent"
          ? row.yesterdayChangeUpdatedAt
        : id === "estimateNav" || id === "estimateChangePercent"
          ? row.estimateUpdatedAt
        : id === "totalChangePercent"
          ? row.estimatedProfitUpdatedAt
        : id === "holdingProfit"
          ? row.officialUpdatedAt
        : id === "holdingAmount"
          ? row.holdingAmountUpdatedAt
        : id === "holdingDays"
          ? row.holdingDaysUpdatedAt
              : id === "todayProfit"
                ? row.todayProfitStatus === "official"
                  ? row.officialConfirmedUpdatedAt
                  : row.currentValueUpdatedAt
              : row.officialUpdatedAt;

    return (
      <div className="flex flex-col leading-tight">
        {valueNode}
        <span className="mt-1 text-[10px] font-medium text-slate-500">{updatedAt}</span>
        {isDevMode && row.debugSourceTag ? <span className="mt-0.5 text-[10px] font-semibold text-slate-400">{row.debugSourceTag}</span> : null}
      </div>
    );
  };

  const getSignedValueTextClass = (value: number | null | undefined) => {
    if (value == null || !Number.isFinite(value) || value === 0) return "text-slate-500";
    return value < 0 ? "text-emerald-700" : "text-rose-600";
  };

  const getCellClass = (row: PortfolioOverviewRow, id: PortfolioOverviewColumnId) => {
    const base = "border-b border-slate-200 px-4 py-3 text-sm tabular-nums align-top text-slate-900 whitespace-nowrap";
    if (id === "yesterdayChangePercent" || id === "estimateChangePercent") {
      return base;
    }
    if (id === "totalChangePercent" || id === "todayProfit" || id === "holdingProfit") {
      return base;
    }
    if (id === "holdingAmount") return `${base}`;
    return `${base} font-medium`;
  };

  const getProfitTextClass = (value: number) => getSignedValueTextClass(value);

  return (
    <div className="-mx-3 -mt-4 flex h-[calc(100dvh-6.6rem)] w-[calc(100%+1.5rem)] max-w-none flex-col gap-0 overflow-hidden bg-white md:-mx-4 md:-mt-4 md:w-[calc(100%+2rem)]">
      <section className="border-b border-slate-200 bg-slate-50 px-3 pb-2 pt-2 text-slate-900">
        <header className="flex items-start justify-between gap-3 py-1">
          <div>
            <h1 className="m-0 text-[24px] font-semibold leading-none tracking-[-0.02em] text-slate-900 sm:text-[28px]">基金资产概览</h1>
            <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">Portfolio Summary</p>
          </div>
          <Link
            href="/discover"
            aria-label="搜索基金"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <Search size={18} />
          </Link>
        </header>

        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <p className="m-0 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">基金总资产（人民币）</p>
            <p className="mt-1.5 max-w-full overflow-hidden text-[clamp(2rem,8.5vw,2.75rem)] font-semibold leading-none tracking-[-0.05em] text-slate-950 text-ellipsis whitespace-nowrap">
              {numberFormatter.format(totals.amount)}
            </p>
          </div>
          <div className="shrink-0 pt-0.5 text-right">
            <p className="m-0 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">最近更新</p>
            <p className="mt-1.5 text-sm font-medium tabular-nums text-slate-700">{totalUpdatedAt}</p>
          </div>
        </div>

        <div className="mt-1 grid grid-cols-2 border-t border-slate-200 bg-transparent">
          <div className="min-w-0 pr-3 pt-2">
            <p className="m-0 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
              <span>今日收益</span>
              {totalTodayProfitStatus === "official" ? (
                <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current text-slate-500">
                  <Check size={8} strokeWidth={3} />
                </span>
              ) : totalTodayProfitStatus === "estimated" ? (
                <Circle size={10} className="text-rose-600" strokeWidth={2.2} />
              ) : null}
            </p>
            <button
              type="button"
              className="mt-2 inline-flex max-w-full items-center gap-1.5 overflow-hidden border-0 bg-transparent p-0 text-left tabular-nums text-slate-900"
              onClick={() => setShowTodayProfitPercent((prev) => !prev)}
              aria-label="切换今日收益显示方式"
            >
              <span
                className={`block max-w-full overflow-hidden text-[clamp(1.5rem,7vw,2rem)] font-semibold leading-none tracking-[-0.04em] text-ellipsis whitespace-nowrap ${getProfitTextClass(
                  totals.today,
                )}`}
              >
                {showTodayProfitPercent ? formatSignedPercent(todayRate) : formatSignedCurrency(totals.today)}
              </span>
            </button>
          </div>

          <div className="min-w-0 pl-3 pt-2 text-right">
            <p className="m-0 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">累计收益（持有收益）</p>
            <button
              type="button"
              className="mt-2 max-w-full overflow-hidden border-0 bg-transparent p-0 text-right tabular-nums text-slate-900"
              onClick={() => setShowTotalProfitPercent((prev) => !prev)}
              aria-label="切换累计收益显示方式"
            >
              <span
                className={`block max-w-full overflow-hidden text-[clamp(1.5rem,7vw,2rem)] font-semibold leading-none tracking-[-0.04em] text-ellipsis whitespace-nowrap ${getProfitTextClass(
                  totals.total,
                )}`}
              >
                {showTotalProfitPercent ? formatSignedPercent(totalRate) : formatSignedCurrency(totals.total)}
              </span>
            </button>
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
              <PortfolioOverviewTable
                rows={rows}
                visibleColumns={visibleColumns}
                scrollContainerRef={tableRef}
                onOpenColumnConfig={() => setColumnModalOpen(true)}
                onScrollPositionChange={(position) =>
                  persistViewState({
                    tableTop: position.top,
                    tableLeft: position.left,
                  })
                }
                onBeforeNavigate={() => persistViewState({ windowY: window.scrollY })}
                getCellClass={getCellClass}
                renderCellValue={renderCellValue}
              />
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
                      const sourceId = event.dataTransfer.getData("text/plain") as PortfolioOverviewColumnId;
                      if (!sourceId) return;
                      moveColumn(sourceId, item.id);
                      setDraggingColumnId(null);
                    }}
                    onDragEnd={() => setDraggingColumnId(null)}
                    className={`flex items-center gap-2 rounded-lg border border-[#e2e7ff] px-2.5 py-2 text-sm text-[#131b2e] will-change-transform ${draggingColumnId === item.id ? "opacity-60" : touchDraggingColumnId === item.id ? "opacity-25" : "opacity-100"}`}
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
                        const container = event.currentTarget.closest("[data-column-id]") as HTMLDivElement | null;
                        const rect = container?.getBoundingClientRect();
                        touchDragTargetRef.current = item.id;
                        setTouchDraggingColumnId(item.id);
                        if (rect) {
                          setDragGhost({
                            id: item.id,
                            x: event.clientX,
                            y: event.clientY,
                            width: rect.width,
                            height: rect.height,
                            offsetX: event.clientX - rect.left,
                            offsetY: event.clientY - rect.top,
                          });
                        }
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
      {dragGhost ? (
        <div
          className="pointer-events-none fixed z-[90] rounded-lg border border-[#d8e3ff] bg-white px-2.5 py-2 text-sm text-[#131b2e] shadow-[0_16px_34px_rgba(0,25,60,0.2)] ring-1 ring-[#e7eeff]"
          style={{
            width: dragGhost.width,
            height: dragGhost.height,
            left: dragGhost.x - dragGhost.offsetX,
            top: dragGhost.y - dragGhost.offsetY,
            transform: "scale(1.03)",
          }}
        >
          <div className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4" checked={columnVisibility[dragGhost.id]} readOnly />
            <span className="flex-1">{orderedColumns.find((item) => item.id === dragGhost.id)?.label || ""}</span>
            <span className="inline-flex text-[#8a90a0]">
              <GripVertical size={15} />
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
