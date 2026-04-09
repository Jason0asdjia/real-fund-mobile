"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, SlidersHorizontal, X } from "lucide-react";

import { useAppState } from "@/components/app-provider";
import { MARKET_INDEX_TARGETS, fetchFastNews, fetchHotSectors, fetchMarketSnapshot } from "@/lib/market-api";
import { formatPercent } from "@/lib/portfolio";
import { todayInMarket } from "@/lib/time";

const MARKET_INDEX_STORAGE_KEY = "real-fund-mobile:market-indices";
const DEFAULT_MARKET_INDEX_IDS = ["sh000001", "hkHSI", "usIXIC"];

const defaultMarketSnapshot = [
  { id: "sh000001", market: "a" as const, label: "上证指数", value: "3,058.22", change: 0.42 },
  { id: "hkHSI", market: "hk" as const, label: "恒生指数", value: "16,725.10", change: -1.15 },
  { id: "usIXIC", market: "us" as const, label: "纳斯达克", value: "16,085.11", change: 0.82 },
];

const defaultHotSectors = [
  { name: "半导体设备", change: 3.82, points: [7, 8, 7, 10, 9, 12, 11, 13, 14, 16, 18] },
  { name: "人工智能AI", change: 2.45, points: [9, 8, 10, 9, 12, 11, 13, 14, 13, 15, 17] },
];

const defaultQuickNews = [
  { time: "14:35", text: "中国央行：维持一年期及五年期LPR利率不变。" },
  { time: "14:12", text: "光伏组件出海超预期，机构调高行业评级。" },
  { time: "13:45", text: "港股午后走低，恒生科技指数跌幅扩大至2%。" },
  { time: "11:30", text: "上交所：本周对股价异常波动股票进行从严监管。" },
];

const toNumber = (value: string | number | null | undefined) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const getRankedFundChange = (fund: { jzrq?: string | null; zzl?: number | string | null; gszzl?: number | string | null }, today: string) => {
  if (fund.jzrq === today) {
    return toNumber(fund.zzl) ?? toNumber(fund.gszzl);
  }
  return toNumber(fund.gszzl) ?? toNumber(fund.zzl);
};

export default function MarketPage() {
  const { state, refreshFunds } = useAppState();
  const [marketSnapshot, setMarketSnapshot] = useState(defaultMarketSnapshot);
  const [hotSectors, setHotSectors] = useState(defaultHotSectors);
  const [quickNews, setQuickNews] = useState(defaultQuickNews);
  const [indexModalOpen, setIndexModalOpen] = useState(false);
  const [selectedIndexIds, setSelectedIndexIds] = useState<string[]>(DEFAULT_MARKET_INDEX_IDS);
  const [indicesHydrated, setIndicesHydrated] = useState(false);

  const groupedIndexTargets = useMemo(
    () => [
      { key: "a", label: "A股指数", items: MARKET_INDEX_TARGETS.filter((item) => item.market === "a") },
      { key: "hk", label: "港股指数", items: MARKET_INDEX_TARGETS.filter((item) => item.market === "hk") },
      { key: "us", label: "美股指数", items: MARKET_INDEX_TARGETS.filter((item) => item.market === "us") },
    ],
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(MARKET_INDEX_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const next = parsed.filter((item): item is string => typeof item === "string" && MARKET_INDEX_TARGETS.some((target) => target.id === item));
      if (next.length > 0) {
        setSelectedIndexIds(next);
      }
    } catch {
      // noop
    } finally {
      setIndicesHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!indicesHydrated) return;
    window.localStorage.setItem(MARKET_INDEX_STORAGE_KEY, JSON.stringify(selectedIndexIds));
  }, [indicesHydrated, selectedIndexIds]);

  useEffect(() => {
    if (state.funds.length === 0) return;
    void refreshFunds();
  }, [refreshFunds, state.funds.length]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("app-modal-open", indexModalOpen);
    return () => {
      document.body.classList.remove("app-modal-open");
    };
  }, [indexModalOpen]);

  useEffect(() => {
    if (!indicesHydrated) return;
    let active = true;

    const loadMarketData = async () => {
      try {
        const [nextSnapshot, nextSectors, nextQuickNews] = await Promise.all([fetchMarketSnapshot(selectedIndexIds), fetchHotSectors(2), fetchFastNews(4)]);
        if (!active) return;
        if (nextSnapshot.length > 0) {
          setMarketSnapshot(nextSnapshot);
        }
        if (nextSectors.length > 0) {
          setHotSectors(nextSectors);
        }
        if (nextQuickNews.length > 0) {
          setQuickNews(nextQuickNews);
        }
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Market API request failed", error);
        }
      }
    };

    void loadMarketData();
    const refreshEvery = state.refreshMs;
    const timer = window.setInterval(() => {
      void loadMarketData();
    }, refreshEvery);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [indicesHydrated, selectedIndexIds, state.refreshMs]);

  const today = todayInMarket();

  const topFunds = [...state.funds]
    .map((fund) => {
      const officialToday = fund.jzrq === today;
      const nav = officialToday ? toNumber(fund.dwjz) : toNumber(fund.gsz) ?? toNumber(fund.dwjz);
      return {
        ...fund,
        change: getRankedFundChange(fund, today),
        nav,
      };
    })
    .filter((fund) => Number.isFinite(fund.change) && fund.nav != null && Number.isFinite(fund.nav) && fund.nav > 0)
    .sort((a, b) => (b.change || 0) - (a.change || 0))
    .slice(0, 6);

  const toggleIndexSelection = (id: string) => {
    setSelectedIndexIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev;
        return prev.filter((item) => item !== id);
      }
      return [...prev, id];
    });
  };

  return (
    <div className="-mx-3 -mt-4 flex h-[calc(100dvh-5.5rem)] flex-col overflow-hidden bg-white text-[#131b2e] md:-mx-4 md:-mt-4">
      <div className="sticky top-0 z-20 shrink-0 bg-white">
        <header className="border-b border-[#e2e7ff] bg-white">
          <div className="flex h-12 items-center justify-between px-3">
            <h1 className="typo-page-title">行情中心</h1>
            <span />
          </div>
        </header>

        <section className="flex items-stretch border-b border-[#e2e7ff] bg-white">
          <div className="flex flex-1 items-center gap-5 overflow-x-auto px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {marketSnapshot.map((item) => (
              <article key={item.id} className="min-w-fit shrink-0 pr-3">
                <p className="mb-1 text-base font-extrabold text-[#4e5666]">{item.label}</p>
                <p className="text-sm font-bold tabular-nums">{item.value}</p>
                <p className={`text-sm font-semibold ${item.change >= 0 ? "text-[#005bc0]" : "text-red-600"}`}>{formatPercent(item.change)}</p>
              </article>
            ))}
          </div>
          <button type="button" className="flex items-center border-l border-[#e2e7ff] px-3 text-[#747781]" onClick={() => setIndexModalOpen(true)} aria-label="编辑指数显示">
            <SlidersHorizontal size={16} />
          </button>
        </section>
      </div>

      <main className="flex-1 overflow-y-auto">
        <section className="border-b border-[#e2e7ff] py-3">
          <div className="mb-2 flex items-center justify-between px-3">
            <h2 className="text-sm font-bold text-[#131b2e]">热门板块</h2>
            <span className="text-sm font-semibold text-[#005bc0]">更多行情</span>
          </div>
          <div className="grid grid-cols-2 border-y border-[#f2f3ff]">
            {hotSectors.map((sector, index) => (
              <article key={sector.name} className={`p-3 ${index === 0 ? "border-r border-[#f2f3ff]" : ""}`}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold">{sector.name}</span>
                  <span className="text-sm font-semibold text-[#005bc0]">{formatPercent(sector.change)}</span>
                </div>
                <div className="h-8">
                  <svg viewBox="0 0 100 20" className="h-full w-full">
                    <polyline
                      fill="none"
                      stroke="#005bc0"
                      strokeWidth="2"
                      points={sector.points.map((point, pointIndex) => `${pointIndex * 10},${20 - point}`).join(" ")}
                    />
                  </svg>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="border-b border-[#e2e7ff] py-3">
          <div className="mb-2 flex items-center justify-between px-3">
            <h2 className="text-sm font-bold text-[#131b2e]">基金领涨排行</h2>
          </div>
          <div className="divide-y divide-[#f2f3ff]">
            {topFunds.map((item) => (
              <Link key={item.code} href={`/portfolio/${item.code}`} className="flex items-center justify-between px-3 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{item.name}</p>
                  <p className="text-sm font-medium tabular-nums text-[#747781]">{item.code}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-[#005bc0]">{formatPercent(item.change)}</p>
                  <p className="text-sm text-[#747781]">{item.nav == null ? "净值: —" : `净值: ${item.nav.toFixed(4)}`}</p>
                </div>
              </Link>
            ))}
            {!topFunds.length ? <p className="px-3 py-4 text-sm text-[#747781]">暂无基金数据，先去发现页添加基金。</p> : null}
          </div>
        </section>

        <section className="py-3">
          <h2 className="mb-2 px-3 text-sm font-bold text-[#131b2e]">7x24快讯</h2>
          <div className="divide-y divide-[#f2f3ff]">
            {quickNews.map((item) => (
              <article key={item.time + item.text} className="flex gap-3 px-3 py-3">
                <span className={`pt-0.5 text-sm font-semibold ${item.time === "14:35" ? "text-[#005bc0]" : "text-[#747781]"}`}>{item.time}</span>
                <p className="m-0 text-sm leading-5">{item.text}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      {indexModalOpen ? (
        <div className="app-modal-backdrop" onClick={() => setIndexModalOpen(false)}>
          <div className="app-modal-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="app-modal-sheet__grabber" />
            <div className="app-modal-sheet__header">
              <h3 className="m-0 text-base font-bold text-[#131b2e]">指数显示设置</h3>
              <button
                type="button"
                onClick={() => setIndexModalOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#53617a] hover:bg-slate-100"
                aria-label="关闭指数设置"
              >
                <X size={16} />
              </button>
            </div>
            <div className="app-modal-sheet__content">
              <div className="space-y-4 pb-4">
                {groupedIndexTargets.map((group) => (
                  <section key={group.key}>
                    <h4 className="mb-2 px-1 typo-section-title text-[#131b2e]">{group.label}</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {group.items.map((item) => {
                        const checked = selectedIndexIds.includes(item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => toggleIndexSelection(item.id)}
                            className="flex items-center gap-2 rounded-lg border border-[#e2e7ff] px-2.5 py-2 text-left text-sm text-[#131b2e]"
                          >
                            <span className={`inline-flex h-4 w-4 items-center justify-center rounded border ${checked ? "border-[#a06d47] bg-[#a06d47] text-white" : "border-[#a3aab8] bg-white text-transparent"}`}>
                              <Check size={12} strokeWidth={3} />
                            </span>
                            <span className="flex-1 leading-5">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
