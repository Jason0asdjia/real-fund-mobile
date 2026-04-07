"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, CircleMinus, CirclePlus, PenSquare, Trash2, X } from "lucide-react";

import { PerformanceLineChart } from "@/components/performance-line-chart";
import { useAppState } from "@/components/app-provider";
import { formatCurrency, formatPercent, formatSignedCurrency, getHoldingMetrics } from "@/lib/portfolio";

type FundDetailViewProps = {
  code: string;
  onBack?: () => void;
  asModal?: boolean;
};

type PeriodKey = "1m" | "3m" | "1y" | "max";

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

export function FundDetailView({ code, onBack, asModal = false }: FundDetailViewProps) {
  const { clearHolding, state, valuationSeries } = useAppState();
  const [period, setPeriod] = useState<PeriodKey>("1m");
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const fund = state.funds.find((item) => item.code === code);

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

  if (!fund) {
    return (
      <div className={asModal ? "detail-page" : "screen"}>
        {onBack ? (
          <header className="sticky top-0 z-20 border-b border-[#e2e7ff] bg-white px-3 py-2">
            <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-[#24467c]" onClick={onBack}>
              <ChevronLeft size={16} />
              返回
            </button>
          </header>
        ) : null}
        <section className="px-3 py-6">
          <div className="rounded-xl border border-[#e2e7ff] bg-[#f8f9ff] p-4">
            <h2 className="m-0 text-base font-bold text-[#131b2e]">没有找到这只基金</h2>
            <p className="mb-0 mt-2 text-sm text-[#57657a]">它可能已经被移除，或者当前地址不是有效的基金详情页。</p>
          </div>
        </section>
      </div>
    );
  }

  const holding = state.holdings[fund.code];
  const metrics = getHoldingMetrics(fund, holding);
  const transactions = (state.transactions[fund.code] || []).slice().sort((a, b) => `${b.date}`.localeCompare(`${a.date}`));
  const rawSeries = valuationSeries[fund.code] || [];
  const chartPoints = rawSeries.map((point) => ({ label: point.date.slice(5).replace("-", "/"), value: point.value }));
  const periodOption = PERIOD_OPTIONS.find((item) => item.key === period);
  const filteredPoints = !chartPoints.length
    ? [{ label: "今日", value: toNumber(fund.gsz ?? fund.dwjz) }]
    : !periodOption?.points
      ? chartPoints
      : chartPoints.slice(-periodOption.points);

  const navValue = toNumber(fund.gsz ?? fund.dwjz);
  const navChange = toNumber(fund.gszzl);
  const latestTrades = transactions.slice(0, 6);
  const holdings = Array.isArray(fund.holdings) ? fund.holdings : [];
  const handleClearHolding = () => {
    clearHolding(fund.code);
    setClearModalOpen(false);
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
              className="absolute left-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 text-sm font-semibold text-[#24467c]"
              onClick={onBack}
            >
              <ChevronLeft size={16} />
              返回
            </button>
          ) : (
            <span />
          )}
          <div className="mx-auto max-w-[72%] text-center">
            <h1 className="m-0 whitespace-normal break-words text-sm font-extrabold leading-tight text-[#131b2e]">{fund.name}</h1>
            <p className="m-0 text-[10px] font-semibold tabular-nums text-[#747781]">{fund.code}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-28">
        {holding ? (
          <section className="border-b border-[#e2e7ff] bg-[#d7e2ff] px-3 pb-4 pt-3 text-[#001b3f]">
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="mb-1 text-[9px] font-semibold tracking-[0.14em] text-[#24467c]/70">持仓金额</p>
                <p className="text-[26px] font-extrabold leading-none tracking-tight tabular-nums">{formatCurrency(metrics?.amount)}</p>
              </div>
              <div className="text-right">
                <p className="mb-1 text-[9px] font-medium tracking-[0.06em] text-[#24467c]/70">累计收益</p>
                <p className={`text-xs font-semibold leading-none tabular-nums ${(metrics?.profitTotal || 0) >= 0 ? "text-[#24467c]" : "text-[#ba1a1a]"}`}>
                  {formatSignedCurrency(metrics?.profitTotal)}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="border-b border-[#e2e7ff] px-3 py-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-[10px] font-semibold tracking-[0.14em] text-[#747781]">单位净值 (NAV)</p>
              <p className="text-3xl font-extrabold tracking-tight tabular-nums text-[#00193c]">{navValue.toFixed(4)}</p>
            </div>
            <div className={`text-sm font-bold tabular-nums ${navChange >= 0 ? "text-[#005bc0]" : "text-red-600"}`}>{formatPercent(navChange)}</div>
          </div>

          <div className="mb-3 flex items-center gap-1.5">
            {PERIOD_OPTIONS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`rounded-sm px-2.5 py-1 text-[10px] font-bold ${
                  period === item.key ? "bg-[#00193c] text-white" : "bg-[#f2f3ff] text-[#57657a]"
                }`}
                onClick={() => setPeriod(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-[#e2e7ff] bg-white p-2.5">
            <PerformanceLineChart data={filteredPoints} height={180} />
          </div>
        </section>

        <section className="border-b border-[#e2e7ff] py-3">
          <div className="mb-2 flex items-center justify-between px-3">
            <h2 className="text-[10px] font-black tracking-[0.14em] text-[#747781]">前十重仓股</h2>
            <span className="text-[10px] font-semibold text-[#747781]">{fund.holdingsReportDate ? `披露日 ${fund.holdingsReportDate}` : "截至最近披露"}</span>
          </div>
          <div className="bg-[#f8f9ff] px-3 py-2">
            <div className="grid grid-cols-12 text-[10px] font-bold tracking-[0.08em] text-[#747781]">
              <div className="col-span-6">股票名称</div>
              <div className="col-span-3 text-right">持仓占比</div>
              <div className="col-span-3 text-right">涨跌幅</div>
            </div>
          </div>
          <div className="divide-y divide-[#f2f3ff]">
            {holdings.length ? (
              holdings.map((item) => (
                <div key={`${item.code}-${item.name}`} className="grid grid-cols-12 px-3 py-3 text-sm">
                  <div className="col-span-6 truncate font-semibold">{item.name || item.code || "—"}</div>
                  <div className="col-span-3 text-right tabular-nums">{item.weight || "—"}</div>
                  <div className={`col-span-3 text-right font-semibold tabular-nums ${toNumber(item.change) >= 0 ? "text-[#005bc0]" : "text-red-600"}`}>
                    {item.change == null ? "—" : formatPercent(Number(item.change))}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-3 py-6 text-center text-sm text-[#747781]">暂无重仓数据</div>
            )}
          </div>
        </section>

        <section className="py-3">
          <div className="mb-2 flex items-center justify-between px-3">
            <h2 className="text-[10px] font-black tracking-[0.14em] text-[#747781]">历史成交</h2>
            <Link href="/history" className="inline-flex items-center gap-1 text-[10px] font-bold text-[#24467c]">
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
                        <p className="m-0 text-xs font-bold">{isBuy ? "加仓" : "减仓"}</p>
                        <p className="m-0 mt-0.5 truncate text-[10px] text-[#747781]">{item.date}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`m-0 text-sm font-bold tabular-nums ${isBuy ? "text-[#005bc0]" : "text-[#8c4f39]"}`}>{formatSignedCurrency(isBuy ? amount : -amount)}</p>
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

      <nav className="fixed bottom-2 left-3 right-3 z-30 grid grid-cols-4 gap-1 rounded-2xl border border-[#002366]/15 bg-[#181c21] p-2 shadow-[0_-8px_24px_rgba(0,0,0,0.15)] md:left-1/2 md:right-auto md:w-[560px] md:-translate-x-1/2">
        <Link href={`/portfolio/${fund.code}/buy`} className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl text-[#e0e2ea]">
          <CirclePlus size={18} />
          <span className="text-[11px]">加仓</span>
        </Link>
        <Link href={`/portfolio/${fund.code}/sell`} className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl text-[#e0e2ea]">
          <CircleMinus size={18} />
          <span className="text-[11px]">减仓</span>
        </Link>
        <Link href={`/portfolio/${fund.code}/manage`} className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl text-[#e0e2ea]">
          <PenSquare size={18} />
          <span className="text-[11px]">编辑持仓</span>
        </Link>
        <button type="button" className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl text-[#e0e2ea]" onClick={() => setClearModalOpen(true)}>
          <Trash2 size={18} />
          <span className="text-[11px]">清空持仓</span>
        </button>
      </nav>

      {clearModalOpen ? (
        <div className="app-modal-backdrop" onClick={() => setClearModalOpen(false)}>
          <div className="app-modal-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="app-modal-sheet__grabber" />
            <div className="app-modal-sheet__header">
              <h3 className="m-0 text-base font-bold text-[#131b2e]">确认清空持仓</h3>
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
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#d5dbea] bg-white px-3 text-sm font-semibold text-[#57657a]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleClearHolding}
                  className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#ba1a1a] px-3 text-sm font-bold text-white"
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
