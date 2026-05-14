"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Check, ChevronLeft, ChevronRight, Circle, CircleMinus, CirclePlus, PenSquare, Trash2, X } from "lucide-react";

import { useAppState } from "@/components/app-provider";
import { SecondaryBottomNav } from "@/components/ui/secondary-bottom-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart } from "@/components/ui/area-chart";
import { PieChart } from "@/components/ui/pie-chart";
import { fetchFundArchiveData, fetchFundBaseData, fetchFundHistoricalNavSeries, fetchFundPreviewData } from "@/lib/fund-api";
import { formatCurrency, formatPercent, formatSignedCurrency, formatSignedPercent } from "@/lib/portfolio";
import { isEstimateTimestampUsable, todayInMarket } from "@/lib/time";
import type { FundSnapshot } from "@/lib/types";

type FundDetailViewProps = {
  code: string;
  onBack?: () => void;
  asModal?: boolean;
};

type PeriodKey = "1m" | "3m" | "1y" | "max";

const OFFICIAL_NAV_HISTORY_CACHE_KEY = "real-fund-mobile:official-nav-history";
const MIN_CHART_POINTS_FOR_CACHE_BOOTSTRAP = 120;
const QUICK_CHART_POINTS = 90;
const FULL_CHART_POINTS = 360;

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
  const [showHoldingProfitPercent, setShowHoldingProfitPercent] = useState(false);
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
      void fetchFundArchiveData(code, remoteFund)
        .then((snapshot) => {
          if (!active) return;
          setRemoteFund((current) => ({
            ...(current || remoteFund),
            ...snapshot,
          }));
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
      if (normalized.length >= MIN_CHART_POINTS_FOR_CACHE_BOOTSTRAP) {
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
        const saveSeriesToLocalCache = (series: Array<{ date: string; nav: number }>) => {
          if (typeof window === "undefined" || series.length === 0) return;
          try {
            const raw = window.localStorage.getItem(OFFICIAL_NAV_HISTORY_CACHE_KEY);
            const parsed = raw ? (JSON.parse(raw) as Record<string, Array<{ date: string; nav: number }>>) : {};
            parsed[code] = series;
            window.localStorage.setItem(OFFICIAL_NAV_HISTORY_CACHE_KEY, JSON.stringify(parsed));
          } catch {
            // noop
          }
        };

        if (typeof window !== "undefined") {
          try {
            const raw = window.localStorage.getItem(OFFICIAL_NAV_HISTORY_CACHE_KEY);
            const parsed = raw ? (JSON.parse(raw) as Record<string, Array<{ date: string; nav: number }>>) : {};
            const rawCached = Array.isArray(parsed?.[code]) ? parsed[code] : [];
            cachedSeries = rawCached
              .filter((item) => item?.date && Number.isFinite(Number(item?.nav)))
              .map((item) => ({ date: item.date, nav: Number(item.nav) }));
          } catch {
            cachedSeries = [];
          }
        }

        if (cachedSeries.length > 0) {
          setOfficialNavSeries(cachedSeries.slice(-FULL_CHART_POINTS));
        }

        // Phase 1: quick fill for fast first paint (1m/3m usable)
        let stagedSeries = cachedSeries;
        if (stagedSeries.length < QUICK_CHART_POINTS) {
          const quickFetched = await fetchFundHistoricalNavSeries(code, QUICK_CHART_POINTS);
          stagedSeries = stagedSeries.length
            ? mergeNavSeries(stagedSeries, quickFetched, FULL_CHART_POINTS)
            : quickFetched;

          if (!active) return;
          if (stagedSeries.length > 0) {
            setOfficialNavSeries(stagedSeries);
            saveSeriesToLocalCache(stagedSeries);
          }
        }

        if (active) {
          setOfficialNavSeriesLoading(false);
        }

        // Phase 2: full fill in background for 1y/max
        const baseSeries = stagedSeries.length ? stagedSeries : cachedSeries;
        const canUseIncrementalSince = baseSeries.length >= MIN_CHART_POINTS_FOR_CACHE_BOOTSTRAP;
        const lastCachedDate = canUseIncrementalSince ? baseSeries[baseSeries.length - 1]?.date : undefined;
        const fetchedSeries = await fetchFundHistoricalNavSeries(code, FULL_CHART_POINTS, lastCachedDate);
        const series = baseSeries.length ? mergeNavSeries(baseSeries, fetchedSeries, FULL_CHART_POINTS) : fetchedSeries;
        if (!active) return;
        if (series.length > 0) {
          setOfficialNavSeries(series);
          saveSeriesToLocalCache(series);
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
  const holdingProfitRate = hasHolding && holdingCost != null && holdingCost > 0 && holdingShare != null && holdingProfit != null
    ? (holdingProfit / (holdingCost * holdingShare)) * 100
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
  const latestNav = Number.isFinite(Number(fund.dwjz)) ? Number(fund.dwjz) : null;
  const lastNavValue = Number(fund.lastNav);
  const lastNavValid = Number.isFinite(lastNavValue) && lastNavValue > 0;
  const todayDate = typeof window !== "undefined" ? todayInMarket() : "";
  const hasTodayData = fund.jzrq === todayDate;
  const hasTodayValuationToday = !fund.noValuation && isEstimateTimestampUsable(fund.gztime);
  const canUseEstimateToday = !hasTodayData && hasTodayValuationToday && Number.isFinite(Number(fund.gsz));
  const officialChangeFromNav =
    latestNav != null && lastNavValid ? ((latestNav - lastNavValue) / lastNavValue) * 100 : null;
  const officialChangePercent = Number.isFinite(Number(fund.zzl)) ? Number(fund.zzl) : officialChangeFromNav;
  const estimateChangePercent =
    !fund.noValuation && canUseEstimateToday && Number.isFinite(Number(fund.gszzl)) ? Number(fund.gszzl) : null;
  const useOfficialForTodayProfit = officialChangePercent != null && (hasTodayData || !canUseEstimateToday);
  const activeTodayChangePercent = useOfficialForTodayProfit ? officialChangePercent : estimateChangePercent;
  const todayProfit = hasHolding && activeTodayChangePercent != null
    ? lastNavValid
      ? holdingShare * lastNavValue * (activeTodayChangePercent / 100)
      : (() => {
          const navForBackCalc = hasTodayData ? latestNav : (Number.isFinite(Number(fund.gsz)) ? Number(fund.gsz) : null);
          if (navForBackCalc == null) return null;
          const currentAmount = holdingShare * navForBackCalc;
          return currentAmount - currentAmount / (1 + activeTodayChangePercent / 100);
        })()
    : null;
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

  const pieChartData = holdingPieData.map((item) => ({
    name: item.type,
    value: item.value,
  }));

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
          : "-mx-3 -mt-4 flex flex-col gap-0 overflow-hidden bg-white text-[#131b2e] md:-mx-4 md:-mt-4"
      }
      style={asModal ? undefined : { height: "calc(100svh - var(--bottom-nav-total-height))" }}
    >
        <header className="shrink-0 overflow-hidden border-b border-[#e2e7ff] bg-white">
        <div className="flex items-center h-12 px-3">
          {onBack ? (
            <button
              type="button"
              className="inline-flex items-center shrink-0 text-[#24467c]"
              onClick={onBack}
            >
              <ChevronLeft size={20} />
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          <span className="ml-2 text-base font-bold text-[#131b2e]">基金详情</span>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain pb-[calc(var(--bottom-nav-total-height)+0.7rem)]">
        <section className="px-1.5 pt-3 pb-1">
          <Card className="rounded-xl border-[#e2e7ff]/40">
            <CardHeader className="pb-3 pt-4 px-4 space-y-0.5">
              <CardTitle className="text-xl font-bold leading-tight tracking-tight text-[#131b2e]">{fund.name}</CardTitle>
              <p className="m-0 text-xs font-bold text-[#747781]">{fund.code}</p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="flex border-t border-[#e2e7ff]/20">
                <div className="flex-1 px-4 py-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#747781]">持仓金额</p>
                  <p className="m-0 text-2xl font-bold leading-tight tracking-tighter tabular-nums text-[#131b2e]">
                    {hasHolding ? formatCurrency(holdingAmount) : "—"}
                  </p>
                </div>
                <div className="flex-1 px-4 py-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#747781]">累计收益</p>
                  <button
                    type="button"
                    className="border-0 bg-transparent p-0 text-left"
                    onClick={() => setShowHoldingProfitPercent((prev) => !prev)}
                    aria-label="切换累计收益显示方式"
                  >
                    <p className={`m-0 text-2xl font-bold leading-tight tracking-tighter tabular-nums ${(holdingProfit || 0) >= 0 ? "text-[#ba1a1a]" : "text-[#1b7a3d]"}`}>
                      {hasHolding
                        ? showHoldingProfitPercent
                          ? formatSignedPercent(holdingProfitRate)
                          : formatSignedCurrency(holdingProfit)
                        : "—"}
                    </p>
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <div className="flex gap-2 overflow-x-auto px-3 py-3 [&::-webkit-scrollbar]:hidden">
          {PERIOD_OPTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`shrink-0 rounded-lg border px-4 py-1.5 text-xs font-bold ${
                period === item.key ? "border-[#a9c3ff] bg-[#dce8ff] text-[#0f2c66]" : "border-transparent text-[#747781] hover:bg-[#f2f3ff]"
              }`}
              onClick={() => setPeriod(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <section className="px-1.5 pb-1">
          <Card className="rounded-xl border-[#e2e7ff]/40">
            <CardContent className="p-0">
              <div className="flex border-b border-[#e2e7ff]/20">
                <div className="flex-1 px-4 py-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#747781]">单位净值(估值)</p>
                  <div className="flex items-baseline gap-2">
                    <p className="m-0 text-base font-bold leading-tight tracking-tighter tabular-nums text-[#131b2e]">{navValue.toFixed(4)}</p>
                    <span className={`text-xs font-bold ${navChange >= 0 ? "text-[#ba1a1a]" : "text-[#1b7a3d]"}`}>{formatPercent(navChange)}</span>
                  </div>
                </div>
                <div className="flex-1 px-4 py-3">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#747781]">
                    <span>今日收益</span>
                    {todayProfit != null ? (
                      useOfficialForTodayProfit ? (
                        <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current text-slate-500">
                          <Check size={10} strokeWidth={3} />
                        </span>
                      ) : (
                        <Circle size={12} className={(todayProfit || 0) >= 0 ? "text-[#ba1a1a]" : "text-[#1b7a3d]"} strokeWidth={2.2} />
                      )
                    ) : null}
                  </div>
                  <p className={`m-0 text-base font-bold leading-tight tracking-tighter tabular-nums ${(todayProfit || 0) >= 0 ? "text-[#ba1a1a]" : "text-[#1b7a3d]"}`}>
                    {todayProfit != null ? formatSignedCurrency(todayProfit) : "—"}
                  </p>
                </div>
              </div>
              <div className="px-4 pt-3 pb-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#747781]">净值走势</p>
                {officialNavSeriesLoading && !officialNavSeries.length ? (
                  <div className="space-y-3 py-2">
                    <div className="h-4 w-20 animate-pulse rounded bg-[#eef2fa]" />
                    <div className="h-[180px] animate-pulse rounded-lg bg-[#f6f8fc]" />
                  </div>
                ) : (
                  <AreaChart
                    data={filteredPoints}
                    color="#2f5ce0"
                    showGrid
                    showYAxis
                    height={200}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="border-b border-[#e2e7ff] py-3">
          <div className="mb-2 flex items-center justify-between px-3">
            <h2 className="typo-section-title">前十重仓股</h2>
            <span className="text-[10px] font-normal text-[#747781]">{fund.holdingsReportDate ? `披露日 ${fund.holdingsReportDate}` : "截至最近披露"}</span>
          </div>
          <div className="px-1.5">
            {archiveLoading && !holdingPieData.length ? (
              <Card>
                <CardContent className="p-3">
                  <div className="h-[240px] animate-pulse rounded-lg bg-[#f6f8fc]" />
                </CardContent>
              </Card>
            ) : holdingPieData.length ? (
              <Card>
                <CardContent className="p-3">
                  <PieChart data={pieChartData} height={220} />
                </CardContent>
              </Card>
            ) : (
              <div className="px-3 py-6 text-center text-sm text-[#747781]">暂无重仓数据</div>
            )}
          </div>
        </section>

        <section className="pt-3 bg-white">
          <div className="mb-2 flex items-center justify-between px-3">
            <h2 className="typo-section-title">历史成交</h2>
            <Link href={`/history?fund=${fund.code}`} className="inline-flex items-center gap-1 text-[10px] font-normal text-[#24467c]">
              查看全部
              <ChevronRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {latestTrades.length ? (
              latestTrades.map((item) => {
                const isBuy = item.type === "buy";
                const amount = Number(item.share) * Number(item.price);
                return (
                  <article key={item.id} className="flex items-center justify-between px-3 py-3 bg-white">
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

      <SecondaryBottomNav>
        <Link
          href={`/portfolio/${fund.code}/buy?from=detail`}
          onClick={(event) => {
            void handleNavigateWithEnsure(`/portfolio/${fund.code}/buy?from=detail`, event);
          }}
          className="bottom-nav__item text-slate-600"
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
          className={`bottom-nav__item text-slate-600 ${!hasHolding ? "pointer-events-none opacity-40" : ""}`}
        >
          <CircleMinus size={18} />
          <span className="text-[11px]">减仓</span>
        </Link>
        <Link
          href={`/portfolio/${fund.code}/manage?from=detail`}
          onClick={(event) => {
            void handleNavigateWithEnsure(`/portfolio/${fund.code}/manage?from=detail`, event);
          }}
          className="bottom-nav__item text-slate-600"
        >
          <PenSquare size={18} />
          <span className="text-[11px]">编辑持仓</span>
        </Link>
        {hasHolding ? (
          <button type="button" className="bottom-nav__item text-slate-600" onClick={() => setClearModalOpen(true)}>
            <Trash2 size={18} />
            <span className="text-[11px]">清空持仓</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={navActionLoading}
            className="bottom-nav__item text-slate-600"
            onClick={() => {
              void handleToggleListMembership();
            }}
          >
            {isInList ? <CircleMinus size={18} /> : <CirclePlus size={18} />}
            <span className="text-[11px]">{isInList ? "移除持仓列表" : "添加到持仓列表"}</span>
          </button>
        )}
      </SecondaryBottomNav>

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
                  className="app-modal-btn-secondary"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleClearHolding}
                  className="app-modal-btn-danger"
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
