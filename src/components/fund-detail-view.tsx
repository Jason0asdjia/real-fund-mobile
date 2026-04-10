"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, CircleMinus, CirclePlus, PenSquare, Trash2, X } from "lucide-react";
import { Area, Pie } from "@ant-design/charts";

import { useAppState } from "@/components/app-provider";
import { fetchFundBaseData, fetchFundData, fetchFundHistoricalNavSeries, fetchFundPreviewData } from "@/lib/fund-api";
import { formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/portfolio";
import type { FundSnapshot } from "@/lib/types";

type FundDetailViewProps = {
  code: string;
  onBack?: () => void;
  asModal?: boolean;
};

type PeriodKey = "1m" | "3m" | "1y" | "max";

const OFFICIAL_NAV_HISTORY_CACHE_KEY = "real-fund-mobile:official-nav-history";

const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string; points?: number }> = [
  { key: "1m", label: "1月", points: 30 },
  { key: "3m", label: "3月", points: 90 },
  { key: "1y", label: "1年", points: 240 },
  { key: "max", label: "最大" },
];

const toNumber = (value: string | number | null | undefined) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
};

const mergeNavSeries = (base: Array<{ date: string; nav: number }>, incoming: Array<{ date: string; nav: number }>, maxCount = 360) => {
  const merged = new Map<string, number>();
  base.forEach((item) => merged.set(item.date, item.nav));
  incoming.forEach((item) => merged.set(item.date, item.nav));
  return [...merged.entries()]
    .map(([date, nav]) => ({ date, nav }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-maxCount);
};

export function FundDetailView({ code, onBack, asModal = false }: FundDetailViewProps) {
  const { addFund, clearHolding, removeFund, state } = useAppState();
  const router = useRouter();
  const [period, setPeriod] = useState<PeriodKey>("1m");
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [officialNavSeries, setOfficialNavSeries] = useState<Array<{ date: string; nav: number }>>([]);
  const [officialNavSeriesLoading, setOfficialNavSeriesLoading] = useState(false);
  const [remoteFund, setRemoteFund] = useState<FundSnapshot | null>(null);
  const [remoteFundLoading, setRemoteFundLoading] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [navActionLoading, setNavActionLoading] = useState(false);
  const fundFromState = state.funds.find((item) => item.code === code);
  const fund = fundFromState || remoteFund;

  useEffect(() => {
    if (asModal) return;
    document.body.classList.add("app-detail-open");
    return () => {
      document.body.classList.remove("app-detail-open");
    };
  }, [asModal]);

  useEffect(() => {
    document.body.classList.toggle("app-modal-open", clearModalOpen);
    return () => {
      document.body.classList.remove("app-modal-open");
    };
  }, [clearModalOpen]);

  useEffect(() => {
    if (fundFromState) {
      setRemoteFund(null);
      setRemoteFundLoading(false);
      return;
    }

    let active = true;
    setRemoteFundLoading(true);

    const loadFund = async () => {
      let previewName = code;

      try {
        const preview = await fetchFundPreviewData(code, { code, name: code });
        if (!active) return;
        previewName = preview.name || code;
        setRemoteFund(preview);
      } catch {
        // noop, full fetch below may still recover
      }

      try {
        const snapshot = await fetchFundBaseData(code, { code, name: previewName });
        if (!active) return;
        setRemoteFund(snapshot);
      } catch {
        if (!active) return;
        setRemoteFund(null);
      } finally {
        if (active) {
          setRemoteFundLoading(false);
        }
      }
    };

    void loadFund();

    return () => {
      active = false;
    };
  }, [code, fundFromState]);

  useEffect(() => {
    if (fundFromState || !remoteFund) return;
    if (remoteFund.archiveStatus === "ready") return;

    let active = true;
    setArchiveLoading(true);

    const timer = window.setTimeout(() => {
      void fetchFundData(code, remoteFund)
        .then((snapshot) => {
          if (!active) return;
          setRemoteFund(snapshot);
        })
        .finally(() => {
          if (active) {
            setArchiveLoading(false);
          }
        });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [code, fundFromState, remoteFund]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(OFFICIAL_NAV_HISTORY_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, Array<{ date: string; nav: number }>>;
      const cached = Array.isArray(parsed?.[code]) ? parsed[code] : [];
      const normalized = cached.filter((item) => item?.date && Number.isFinite(Number(item?.nav))).map((item) => ({ date: item.date, nav: Number(item.nav) }));
      if (normalized.length > 0) {
        setOfficialNavSeries(normalized);
      }
    } catch {
      // noop
    }
  }, [code]);

  useEffect(() => {
    let active = true;
    setOfficialNavSeriesLoading(true);

    const loadHistory = async () => {
      try {
        let cachedSeries: Array<{ date: string; nav: number }> = [];
        if (typeof window !== "undefined") {
          try {
            const raw = window.localStorage.getItem(OFFICIAL_NAV_HISTORY_CACHE_KEY);
            const parsed = raw ? (JSON.parse(raw) as Record<string, Array<{ date: string; nav: number }>>) : {};
            cachedSeries = Array.isArray(parsed?.[code]) ? parsed[code] : [];
          } catch {
            cachedSeries = [];
          }
        }

        const lastCachedDate = cachedSeries.length ? cachedSeries[cachedSeries.length - 1]?.date : undefined;
        const fetchedSeries = await fetchFundHistoricalNavSeries(code, 360, lastCachedDate);
        const series = lastCachedDate ? mergeNavSeries(cachedSeries, fetchedSeries, 360) : fetchedSeries;
        if (!active) return;
        if (series.length > 0) {
          setOfficialNavSeries(series);
          if (typeof window !== "undefined") {
            try {
              const raw = window.localStorage.getItem(OFFICIAL_NAV_HISTORY_CACHE_KEY);
              const parsed = raw ? (JSON.parse(raw) as Record<string, Array<{ date: string; nav: number }>>) : {};
              parsed[code] = series;
              window.localStorage.setItem(OFFICIAL_NAV_HISTORY_CACHE_KEY, JSON.stringify(parsed));
            } catch {
              // noop
            }
          }
        }
      } catch {
        // keep cached series when request fails
      } finally {
        if (active) {
          setOfficialNavSeriesLoading(false);
        }
      }
    };

    void loadHistory();

    return () => {
      active = false;
    };
  }, [code]);

  if (!fund) {
    return (
      <div className={asModal ? "detail-page" : "screen"}>
        {onBack ? (
          <header className="sticky top-0 z-20 border-b border-[#e2e7ff] bg-white px-3 py-2">
            <button type="button" className="inline-flex items-center gap-1 text-sm font-normal text-[#24467c]" onClick={onBack}>
              <ChevronLeft size={16} />
              返回
            </button>
          </header>
        ) : null}
        <section className="px-3 py-6">
          <div className="rounded-xl border border-[#e2e7ff] bg-[#f8f9ff] p-4">
            <h2 className="m-0 text-base font-normal text-[#131b2e]">{remoteFundLoading ? "正在加载基金详情" : "没有找到这只基金"}</h2>
            <p className="mb-0 mt-2 text-sm text-[#57657a]">
              {remoteFundLoading ? "正在尝试从外部数据源获取该基金，请稍候。" : "它可能已经被移除，或者当前地址不是有效的基金详情页。"}
            </p>
          </div>
        </section>
      </div>
    );
  }

  const transactions = (state.transactions[fund.code] || []).slice().sort((a, b) => `${b.date}`.localeCompare(`${a.date}`));
  const holding = state.holdings[fund.code];
  const holdingShare = typeof holding?.share === "number" && Number.isFinite(holding.share) ? Number(holding.share) : null;
  const holdingCost = typeof holding?.cost === "number" && Number.isFinite(holding.cost) ? Number(holding.cost) : null;
  const officialNavForHolding = Number.isFinite(Number(fund.dwjz)) && Number(fund.dwjz) > 0 ? Number(fund.dwjz) : null;
  const hasHolding = holdingShare != null && holdingShare > 0;
  const isInList = Boolean(fundFromState);
  const holdingAmount = hasHolding && officialNavForHolding != null ? holdingShare * officialNavForHolding : null;
  const holdingProfit = hasHolding && officialNavForHolding != null && holdingCost != null
    ? (officialNavForHolding - holdingCost) * holdingShare
    : null;
  const chartPoints = officialNavSeries.map((point) => ({
    date: point.date,
    label: point.date.slice(5).replace("-", "/"),
    value: point.nav,
  }));
  const periodOption = PERIOD_OPTIONS.find((item) => item.key === period);
  const filteredPoints = !chartPoints.length
    ? [{ date: fund.jzrq || "today", label: "今日", value: toNumber(fund.gsz ?? fund.dwjz) }]
    : !periodOption?.points
      ? chartPoints
      : chartPoints.slice(-periodOption.points);

  const navValue = toNumber(fund.gsz ?? fund.dwjz);
  const navChange = toNumber(fund.gszzl);
  const latestTrades = transactions.slice(0, 5);
  const holdings = Array.isArray(fund.holdings) ? fund.holdings : [];
  const detailLoading = remoteFundLoading && !fundFromState;
  const holdingPieData = holdings
    .map((item) => ({
      type: item.name || item.code || "—",
      value: Number(String(item.weight || "").replace("%", "").trim()),
    }))
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .slice(0, 10);

  const areaConfig = {
    data: filteredPoints,
    xField: "date",
    yField: "value",
    smooth: true,
    tooltip: {
      items: [{ channel: "y", valueFormatter: (value: number) => value.toFixed(4) }],
    },
    axis: {
      x: {
        labelAutoHide: true,
        tick: false,
        title: false,
        labelFormatter: (_: string, index: number) => filteredPoints[index]?.label || "",
      },
      y: { title: false, tick: false, grid: true, labelFormatter: (value: string) => Number(value).toFixed(2) },
    },
    line: {
      style: {
        stroke: "#2f5ce0",
        lineWidth: 2,
      },
    },
    area: {
      style: {
        fill: "l(270) 0:#7da5ff66 1:#ffffff00",
      },
    },
    style: {
      radiusTopLeft: 8,
      radiusTopRight: 8,
    },
  };

  const pieConfig = {
    data: holdingPieData,
    angleField: "value",
    colorField: "type",
    radius: 0.9,
    innerRadius: 0.55,
    legend: {
      color: {
        position: "bottom" as const,
        itemLabelFontSize: 11,
      },
    },
    label: {
      text: (d: { value: number }) => `${d.value.toFixed(2)}%`,
      position: "spider",
      fontSize: 11,
    },
    tooltip: {
      items: [{ channel: "y", valueFormatter: (value: number) => `${value.toFixed(2)}%` }],
    },
  };
  const handleClearHolding = () => {
    clearHolding(fund.code);
    setClearModalOpen(false);
  };

  const ensureFundInList = async () => {
    if (isInList) return true;
    const snapshot = await addFund({ code: fund.code, name: fund.name });
    return Boolean(snapshot);
  };

  const handleNavigateWithEnsure = async (href: string, event: React.MouseEvent<HTMLAnchorElement>) => {
    if (isInList) return;
    event.preventDefault();
    if (navActionLoading) return;

    setNavActionLoading(true);
    try {
      const ok = await ensureFundInList();
      if (ok) {
        router.push(href);
      }
    } finally {
      setNavActionLoading(false);
    }
  };

  const handleToggleListMembership = async () => {
    if (navActionLoading) return;

    setNavActionLoading(true);
    try {
      if (isInList) {
        removeFund(fund.code);
      } else {
        await addFund({ code: fund.code, name: fund.name });
      }
    } finally {
      setNavActionLoading(false);
    }
  };
  const content = (
    <div
      className={
        asModal
          ? "detail-page flex h-[100dvh] flex-col overflow-hidden bg-white text-[#131b2e]"
          : "-mx-3 -mb-24 -mt-4 flex h-[calc(100dvh-5.5rem)] flex-col overflow-hidden bg-white text-[#131b2e] md:-mx-4 md:-mb-24 md:-mt-4"
      }
    >
      <header className="z-20 shrink-0 border-b border-[#e2e7ff] bg-white">
        <div className="relative min-h-12 px-3 py-1">
          {onBack ? (
            <button
              type="button"
              className="absolute left-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 text-sm font-normal text-[#24467c]"
              onClick={onBack}
            >
              <ChevronLeft size={16} />
              返回
            </button>
          ) : (
            <span />
          )}
          <div className="mx-auto max-w-[calc(100%-7.5rem)] px-8 text-center">
            <h1 className="m-0 typo-fund-header-title font-normal">{fund.name}</h1>
            <p className="m-0 typo-fund-header-code font-normal">{fund.code}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+6.6rem)]">
        {holding ? (
          <section className="border-b border-[#e2e7ff] bg-[#d7e2ff] px-3 py-1.5 text-[#001b3f]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-h-[70px] flex-col justify-center">
                <p className="mb-0.5 typo-label text-[#24467c]/70">持仓金额</p>
                <p className="m-0 text-[30px] font-normal leading-none tracking-tight tabular-nums">{formatCurrency(holdingAmount)}</p>
              </div>
              <div className="flex min-h-[70px] flex-col items-end justify-center text-right">
                <p className="mb-0.5 typo-label text-[#24467c]/70">累计收益</p>
                <p className={`m-0 text-[20px] font-normal leading-none tabular-nums ${(holdingProfit || 0) >= 0 ? "text-[#24467c]" : "text-[#ba1a1a]"}`}>
                  {formatSignedCurrency(holdingProfit)}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="border-b border-[#e2e7ff] px-3 py-3">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <p className="mb-1 typo-section-title">单位净值 (NAV)</p>
              <p className="text-[28px] font-normal tracking-tight tabular-nums text-[#00193c]">{navValue.toFixed(4)}</p>
            </div>
            <div className={`text-sm tabular-nums ${navChange >= 0 ? "text-[#005bc0]" : "text-red-600"}`}>{formatPercent(navChange)}</div>
          </div>

          <div className="mb-2 flex items-center gap-1.5">
            {PERIOD_OPTIONS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`rounded-md border px-2.5 py-1 text-[11px] font-normal ${
                  period === item.key ? "border-[#a9c3ff] bg-[#dce8ff] text-[#0f2c66]" : "border-transparent bg-[#f2f3ff] text-[#57657a]"
                }`}
                onClick={() => setPeriod(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-[#e2e7ff] bg-white p-2.5">
            <p className="mb-1 px-1 text-[11px] font-normal tracking-[0.06em] text-[#57657a]">净值变化</p>
            {officialNavSeriesLoading && !officialNavSeries.length ? (
              <div className="space-y-3 px-1 py-3">
                <div className="h-4 w-20 animate-pulse rounded bg-[#eef2fa]" />
                <div className="h-[180px] animate-pulse rounded-lg bg-[#f6f8fc]" />
              </div>
            ) : (
              <Area {...areaConfig} height={220} />
            )}
          </div>
        </section>

        <section className="border-b border-[#e2e7ff] py-3">
          <div className="mb-2 flex items-center justify-between px-3">
            <h2 className="typo-section-title">前十重仓股</h2>
            <span className="text-[10px] font-normal text-[#747781]">{fund.holdingsReportDate ? `披露日 ${fund.holdingsReportDate}` : "截至最近披露"}</span>
          </div>
          <div className="px-3">
            {archiveLoading && !holdingPieData.length ? (
              <div className="rounded-xl border border-[#e2e7ff] bg-white p-3">
                <div className="h-[240px] animate-pulse rounded-lg bg-[#f6f8fc]" />
              </div>
            ) : holdingPieData.length ? (
              <div className="rounded-xl border border-[#e2e7ff] bg-white p-3">
                <Pie {...pieConfig} height={240} />
              </div>
            ) : (
              <div className="px-3 py-6 text-center text-sm text-[#747781]">暂无重仓数据</div>
            )}
          </div>
        </section>

        <section className="pt-3">
          <div className="mb-2 flex items-center justify-between px-3">
            <h2 className="typo-section-title">历史成交</h2>
            <Link href={`/history?fund=${fund.code}`} className="inline-flex items-center gap-1 text-[10px] font-normal text-[#24467c]">
              查看全部
              <ChevronRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-[#f2f3ff]">
            {latestTrades.length ? (
              latestTrades.map((item) => {
                const isBuy = item.type === "buy";
                const amount = Number(item.share) * Number(item.price);
                return (
                  <article key={item.id} className="flex items-center justify-between px-3 py-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded ${
                          isBuy ? "bg-[#d7e2ff] text-[#24467c]" : "bg-[#ffdbd0] text-[#8c4f39]"
                        }`}
                      >
                        {isBuy ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                      </div>
                      <div className="min-w-0">
                        <p className="m-0 text-xs font-normal">{isBuy ? "加仓" : "减仓"}</p>
                        <p className="m-0 mt-0.5 truncate text-[10px] text-[#747781]">{item.date}</p>
                      </div>
                    </div>
                    <div className="text-right">
                          <p className={`m-0 text-sm font-normal tabular-nums ${isBuy ? "text-[#005bc0]" : "text-[#8c4f39]"}`}>{formatSignedCurrency(isBuy ? amount : -amount)}</p>
                      <p className="m-0 mt-0.5 text-[10px] text-[#747781]">净值: {Number(item.price).toFixed(4)}</p>
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="px-3 py-6 text-center text-sm text-[#747781]">暂无成交记录</p>
            )}
          </div>
        </section>

      </main>

      <nav className="fixed bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] left-3 right-3 z-30 grid grid-cols-4 gap-1.5 rounded-[1.45rem] border border-slate-200 bg-white p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom)*0.22)] shadow-[0_3px_10px_rgba(15,23,42,0.12)] md:left-1/2 md:right-auto md:w-[560px] md:-translate-x-1/2">
        <Link
          href={`/portfolio/${fund.code}/buy?from=detail`}
          onClick={(event) => {
            void handleNavigateWithEnsure(`/portfolio/${fund.code}/buy?from=detail`, event);
          }}
          className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl text-slate-600"
        >
          <CirclePlus size={18} />
          <span className="text-[11px]">加仓</span>
        </Link>
        <Link
          href={`/portfolio/${fund.code}/sell?from=detail`}
          onClick={(event) => {
            if (!hasHolding) {
              event.preventDefault();
              return;
            }
            void handleNavigateWithEnsure(`/portfolio/${fund.code}/sell?from=detail`, event);
          }}
          className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl text-slate-600 ${!hasHolding ? "pointer-events-none opacity-40" : ""}`}
        >
          <CircleMinus size={18} />
          <span className="text-[11px]">减仓</span>
          {!hasHolding ? <span className="text-[9px] text-[#9aa5bb]">暂无可减份额</span> : null}
        </Link>
        <Link
          href={`/portfolio/${fund.code}/manage`}
          onClick={(event) => {
            void handleNavigateWithEnsure(`/portfolio/${fund.code}/manage`, event);
          }}
          className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl text-slate-600"
        >
          <PenSquare size={18} />
          <span className="text-[11px]">编辑持仓</span>
        </Link>
        {hasHolding ? (
          <button type="button" className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl text-slate-600" onClick={() => setClearModalOpen(true)}>
            <Trash2 size={18} />
            <span className="text-[11px]">清空持仓</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={navActionLoading}
            className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl text-slate-600"
            onClick={() => {
              void handleToggleListMembership();
            }}
          >
            {isInList ? <CircleMinus size={18} /> : <CirclePlus size={18} />}
            <span className="text-[11px]">{isInList ? "移除持仓列表" : "添加到持仓列表"}</span>
          </button>
        )}
      </nav>

      {clearModalOpen ? (
        <div className="app-modal-backdrop" onClick={() => setClearModalOpen(false)}>
          <div className="app-modal-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="app-modal-sheet__grabber" />
            <div className="app-modal-sheet__header">
            <h3 className="m-0 text-base font-normal text-[#131b2e]">确认清空持仓</h3>
              <button
                type="button"
                onClick={() => setClearModalOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#53617a] hover:bg-slate-100"
                aria-label="关闭清空持仓确认弹窗"
              >
                <X size={16} />
              </button>
            </div>
            <div className="app-modal-sheet__content">
              <p className="m-0 text-sm leading-6 text-[#57657a]">将清空该基金的持仓金额、成本、首次买入日期和全部交易记录。此操作无法撤销。</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setClearModalOpen(false)}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#d5dbea] bg-white px-3 text-sm font-normal text-[#57657a]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleClearHolding}
                className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#ba1a1a] px-3 text-sm font-normal !text-white"
                >
                  确认清空
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  return content;
}
