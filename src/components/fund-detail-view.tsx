"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, TrendingUp, Wallet } from "lucide-react";

import { PerformanceLineChart } from "@/components/performance-line-chart";
import { Sparkline } from "@/components/sparkline";
import { useAppState } from "@/components/app-provider";
import { formatCurrency, formatPercent, formatSignedCurrency, getHoldingMetrics, summarizeTransactions } from "@/lib/portfolio";
import { nowInMarket, toMarketDay } from "@/lib/time";

type FundDetailViewProps = {
  code: string;
  onBack?: () => void;
  asModal?: boolean;
};

const getMetricValueClass = (value: string) => {
  const length = value.replace(/\s+/g, "").length;
  if (length >= 16) return "detail-metric-value detail-metric-value--xs";
  if (length >= 12) return "detail-metric-value detail-metric-value--sm";
  if (length >= 9) return "detail-metric-value detail-metric-value--md";
  return "detail-metric-value";
};

export function FundDetailView({ code, onBack, asModal = false }: FundDetailViewProps) {
  const { state, valuationSeries } = useAppState();
  const [chartType, setChartType] = useState<"history" | "intraday">("history");

  const fund = state.funds.find((item) => item.code === code);

  if (!fund) {
    return (
      <div className={asModal ? "detail-page" : "screen"}>
        {onBack ? (
          <header className="detail-topbar">
            <button type="button" className="detail-topbar__back" onClick={onBack}>
              <ChevronLeft size={16} />
              返回持仓
            </button>
            <div className="detail-topbar__title">
              <strong>基金详情</strong>
              <span>未找到基金</span>
            </div>
            <span className="detail-topbar__placeholder" />
          </header>
        ) : null}
        <section className="empty-panel">
          <h2>没有找到这只基金</h2>
          <p>它可能已经被移除，或者当前地址不是有效的基金详情页。</p>
          {onBack ? (
            <button type="button" className="primary-link primary-link--button" onClick={onBack}>
              返回持仓页
            </button>
          ) : null}
        </section>
      </div>
    );
  }

  const holding = state.holdings[fund.code];
  const metrics = getHoldingMetrics(fund, holding);
  const series = valuationSeries[fund.code] || [];
  const transactions = state.transactions[fund.code] || [];
  const transactionSummary = summarizeTransactions(transactions);
  const principal = holding?.share && holding?.cost ? holding.share * holding.cost : 0;
  const returnRate = principal > 0 && metrics?.profitTotal != null ? (metrics.profitTotal / principal) * 100 : 0;
  const historicalSeries = series.map((point) => ({ label: point.date.slice(5).replace("-", "/"), value: point.value }));
  const holdingDays = holding?.firstPurchaseDate
    ? Math.max(nowInMarket().startOf("day").diff(toMarketDay(holding.firstPurchaseDate).startOf("day"), "day"), 0)
    : null;

  const amountText = formatCurrency(metrics?.amount);
  const todayProfitText = formatSignedCurrency(metrics?.profitToday);
  const totalProfitText = formatSignedCurrency(metrics?.profitTotal);
  const returnRateText = formatPercent(returnRate);
  const firstPurchaseText = holding?.firstPurchaseDate || "未记录";
  const holdingDaysText = holdingDays == null ? "—" : `${holdingDays} 天`;
  const shareText = transactionSummary.netShare ? transactionSummary.netShare.toFixed(2) : "—";
  const costText = formatCurrency(transactionSummary.averageCost);
  const realizedProfitText = formatSignedCurrency(transactionSummary.realizedProfit);
  const totalFeesText = formatCurrency(transactionSummary.totalFees);
  const tradeCountText = `${transactions.length}`;

  const content = (
    <>
      {onBack ? (
        <header className="detail-topbar">
          <button type="button" className="detail-topbar__back" onClick={onBack}>
            <ChevronLeft size={16} />
            返回持仓
          </button>
          <div className="detail-topbar__title">
            <strong>{fund.name}</strong>
            <span>{fund.code}</span>
          </div>
          <span className="detail-topbar__placeholder" />
        </header>
      ) : null}

      <section className="detail-summary-hero">
        <div className="detail-summary-hero__head">
          <p className="detail-summary-hero__eyebrow">持仓总览</p>
          <Link href={`/portfolio/${fund.code}/manage`} className="detail-summary-hero__action">
            修改持仓
          </Link>
        </div>
        <div className="detail-summary-hero__headline">
          <span>持仓金额</span>
          <strong className={getMetricValueClass(amountText)}>{amountText}</strong>
          <small>首次买入 {firstPurchaseText} · 持有 {holdingDaysText}</small>
        </div>

        <div className="detail-summary-hero__pills">
          <span className="detail-state-pill">
            <em>当日收益</em>
            <b className={`${getMetricValueClass(todayProfitText)} ${(metrics?.profitToday || 0) >= 0 ? "is-up" : "is-down"}`}>{todayProfitText}</b>
          </span>
          <span className="detail-state-pill">
            <em>持仓收益率</em>
            <b className={`${getMetricValueClass(returnRateText)} ${returnRate >= 0 ? "is-up" : "is-down"}`}>{returnRateText}</b>
          </span>
        </div>

        <div className="detail-summary-hero__result-grid">
          <article>
            <span>累计收益</span>
            <b className={`${getMetricValueClass(totalProfitText)} ${(metrics?.profitTotal || 0) >= 0 ? "is-up" : "is-down"}`}>{totalProfitText}</b>
          </article>
          <article>
            <span>已实现收益</span>
            <b className={`${getMetricValueClass(realizedProfitText)} ${transactionSummary.realizedProfit >= 0 ? "is-up" : "is-down"}`}>{realizedProfitText}</b>
          </article>
        </div>
      </section>

      <section className="detail-group">
        <div className="detail-group__head">
          <p className="section-heading__eyebrow">Transaction Info</p>
          <h2>交易信息</h2>
        </div>
        <div className="detail-info-grid">
          <article className="detail-info-card">
            <span>交易推导份额</span>
            <strong className={getMetricValueClass(shareText)}>{shareText}</strong>
          </article>
          <article className="detail-info-card">
            <span>交易推导成本</span>
            <strong className={getMetricValueClass(costText)}>{costText}</strong>
          </article>
          <article className="detail-info-card">
            <span>交易笔数</span>
            <strong className={getMetricValueClass(tradeCountText)}>{tradeCountText}</strong>
          </article>
          <article className="detail-info-card">
            <span>累计手续费</span>
            <strong className={getMetricValueClass(totalFeesText)}>{totalFeesText}</strong>
          </article>
        </div>
      </section>

      <section className="insight-card">
        <div className="insight-card__head">
          <div>
            <p className="section-heading__eyebrow">{chartType === "history" ? "Historical Curve" : "Intraday Trend"}</p>
            <h2>{chartType === "history" ? "估值历史曲线" : "当日估值轨迹"}</h2>
          </div>
          <div className="chart-mode-switch" role="tablist" aria-label="切换图表类型">
            <button
              type="button"
              role="tab"
              aria-selected={chartType === "history"}
              className={`chart-mode-switch__item ${chartType === "history" ? "is-active" : ""}`}
              onClick={() => setChartType("history")}
            >
              <TrendingUp size={14} /> 历史
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={chartType === "intraday"}
              className={`chart-mode-switch__item ${chartType === "intraday" ? "is-active" : ""}`}
              onClick={() => setChartType("intraday")}
            >
              <Wallet size={14} /> 当日
            </button>
          </div>
        </div>
        {chartType === "history" ? (
          <>
            <span className="insight-chip"><TrendingUp size={14} /> {historicalSeries.length} 个点</span>
            <PerformanceLineChart data={historicalSeries.length ? historicalSeries : [{ label: "暂无", value: Number(fund.gsz ?? fund.dwjz ?? 0) }]} height={168} />
          </>
        ) : (
          <>
            <span className="insight-chip"><Wallet size={14} /> {series.length} 个点</span>
            <div className="detail-sparkline-shell detail-sparkline-shell--merged">
              <Sparkline points={series} />
            </div>
          </>
        )}
      </section>
    </>
  );

  if (asModal) {
    return <div className="detail-page">{content}</div>;
  }

  return <div className="screen">{content}</div>;
}
