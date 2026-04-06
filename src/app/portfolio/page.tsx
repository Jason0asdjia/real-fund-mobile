"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CirclePlus, History, SlidersHorizontal, X } from "lucide-react";

import { useAppState } from "@/components/app-provider";
import { formatCurrency, formatSignedCurrency, getHoldingMetrics } from "@/lib/portfolio";
import type { FundHolding, FundSnapshot } from "@/lib/types";

const VIEW_STATE_KEY = "real-fund-mobile:portfolio-view-state";
const COLUMN_VISIBILITY_KEY = "real-fund-mobile:portfolio-column-visibility";

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
  holdingProfit: number | null;
  holdingAmountLabel: string;
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

const buildRows = (funds: FundSnapshot[], holdings: Record<string, FundHolding>): PortfolioRow[] => {
  return funds.map((fund) => {
    const holding = holdings[fund.code];
    const metrics = getHoldingMetrics(fund, holding);
    const amount = metrics?.amount ?? 0;
    const costBasis = holding?.cost != null && holding?.share != null ? Number(holding.cost) * Number(holding.share) : null;
    const totalChangePercent = costBasis && costBasis > 0 && metrics?.profitTotal != null ? (metrics.profitTotal / costBasis) * 100 : null;
    const yesterdayChangePercent = fund.zzl == null ? null : Number(fund.zzl);
    const firstPurchaseDate = holding?.firstPurchaseDate || null;
    const holdingDays = firstPurchaseDate ? Math.max(0, Math.floor((Date.now() - new Date(firstPurchaseDate).getTime()) / 86_400_000)) : null;

    return {
      code: fund.code,
      fundName: fund.name,
      estimateNav: formatNav(fund.gsz),
      yesterdayChangePercent,
      estimateChangePercent: fund.gszzl == null ? null : Number(fund.gszzl),
      latestNav: formatNav(fund.dwjz),
      totalChangePercent,
      holdingAmount: amount,
      holdingDays,
      todayProfit: metrics?.profitToday ?? null,
      holdingProfit: metrics?.profitTotal ?? null,
      holdingAmountLabel: formatCurrency(amount),
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

export default function PortfolioPage() {
  const { state } = useAppState();
  const [restoredState, setRestoredState] = useState<PortfolioViewState>({ windowY: 0, tableTop: 0, tableLeft: 0 });
  const [columnVisibility, setColumnVisibility] = useState<Record<ColumnId, boolean>>(defaultColumnVisibility);
  const [columnModalOpen, setColumnModalOpen] = useState(false);
  const viewStateRef = useRef<PortfolioViewState>({ windowY: 0, tableTop: 0, tableLeft: 0 });
  const tableRef = useRef<HTMLDivElement | null>(null);
  const tableRestoredRef = useRef(false);

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
    setColumnVisibility(readColumnVisibility());

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
    () => buildRows(state.funds, state.holdings),
    [state.funds, state.holdings],
  );
  const todayBase = totals.amount - totals.today;
  const todayRate = todayBase > 0 ? (totals.today / todayBase) * 100 : null;

  const visibleColumns = useMemo(
    () => COLUMN_OPTIONS.filter((item) => columnVisibility[item.id]),
    [columnVisibility],
  );

  const renderCellValue = (row: PortfolioRow, id: ColumnId) => {
    if (id === "latestNav") return row.latestNav;
    if (id === "estimateNav") return row.estimateNav;
    if (id === "yesterdayChangePercent") return formatSignedPercent(row.yesterdayChangePercent);
    if (id === "estimateChangePercent") return formatSignedPercent(row.estimateChangePercent);
    if (id === "totalChangePercent") return formatSignedPercent(row.totalChangePercent);
    if (id === "holdingAmount") return formatCurrency(row.holdingAmount);
    if (id === "holdingDays") return row.holdingDays == null ? "—" : `${row.holdingDays}天`;
    if (id === "todayProfit") return formatSignedCurrency(row.todayProfit);
    return formatSignedCurrency(row.holdingProfit);
  };

  const getCellClass = (row: PortfolioRow, id: ColumnId) => {
    const base = "px-0 py-3 text-sm tabular-nums";
    if (id === "yesterdayChangePercent" || id === "estimateChangePercent" || id === "totalChangePercent") {
      const value = id === "yesterdayChangePercent" ? row.yesterdayChangePercent : id === "estimateChangePercent" ? row.estimateChangePercent : row.totalChangePercent;
      if (value == null) return `${base} text-[#747781]`;
      return `${base} font-bold ${value < 0 ? "text-red-600" : "text-emerald-700"}`;
    }
    if (id === "todayProfit" || id === "holdingProfit") {
      const value = id === "todayProfit" ? row.todayProfit : row.holdingProfit;
      if (value == null) return `${base} text-[#747781]`;
      return `${base} font-bold ${value < 0 ? "text-red-600" : "text-emerald-700"}`;
    }
    if (id === "holdingAmount") return `${base} text-[#131b2e]`;
    return `${base} font-medium text-[#131b2e]`;
  };

  return (
    <div className="-mx-3 -mt-4 flex h-[calc(100dvh-6.6rem)] w-[calc(100%+1.5rem)] max-w-none flex-col gap-0 overflow-hidden bg-white md:-mx-4 md:-mt-4 md:w-[calc(100%+2rem)]">
      <section className="bg-[#d7e2ff] px-3 pb-5 pt-2 text-[#001b3f]">
        <header className="flex h-11 items-center justify-between">
          <h1 className="text-2xl font-extrabold leading-none tracking-tight">基金资产概览</h1>
          <div className="flex items-center gap-2">
            <Link href="/discover" aria-label="添加基金" className="rounded-md p-1 text-[#24467c] transition-colors hover:bg-black/5">
              <CirclePlus size={18} />
            </Link>
            <Link href="/settings" aria-label="交易记录" className="rounded-md p-1 text-[#24467c] transition-colors hover:bg-black/5">
              <History size={18} />
            </Link>
          </div>
        </header>

        <div className="mt-1.5">
          <p className="mb-1 text-[9px] font-semibold tracking-[0.14em] text-[#24467c]/70">基金总资产（人民币）</p>
          <p className="text-[26px] font-extrabold leading-none tracking-tight tabular-nums">{numberFormatter.format(totals.amount)}</p>

          <div className="mt-4 flex items-center justify-between gap-2">
            <div>
              <p className="text-[9px] font-medium tracking-[0.06em] text-[#24467c]/70">今日收益</p>
              <p className="text-lg font-bold leading-none text-[#24467c] tabular-nums">
                {formatSignedCurrency(totals.today)} <span className="text-sm font-semibold">{`(${formatSignedPercent(todayRate)})`}</span>
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
                {COLUMN_OPTIONS.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 rounded-lg border border-[#e2e7ff] px-2.5 py-2 text-sm text-[#131b2e]">
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
                    {item.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
