"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BarChart3, CalendarDays, ChevronRight, LineChart, RefreshCcw } from "lucide-react";

import { MonthlyReturnCalendar } from "@/components/monthly-return-calendar";
import { PerformanceLineChart } from "@/components/performance-line-chart";
import { ReturnTrendChart } from "@/components/return-trend-chart";
import { useAppState } from "@/components/app-provider";
import { formatCurrency, formatSignedCurrency, getHoldingMetrics, summarizeTransactions } from "@/lib/portfolio";
import { formatClock, nowInMarket } from "@/lib/time";
import type { ValuationPoint } from "@/lib/types";

type SeriesPoint = {
  label: string;
  value: number;
};

type DailyPoint = SeriesPoint & {
  date: string;
};

const intradayLabel = (index: number, total: number) => {
  const hour = 9 + Math.floor((index / Math.max(total - 1, 1)) * 5);
  const minute = index % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${minute}`;
};

const dayLabel = (date: string) => date.slice(5).replace("-", "/");
const monthLabel = (date: string) => `${Number(date.slice(5, 7))}月`;

const buildFallbackSeries = (total: number, count: number, labels: string[]): SeriesPoint[] => {
  const drift = Math.max(Math.abs(total) * 0.42, 60);
  return labels.map((label, index) => {
    const progress = index / Math.max(labels.length - 1, 1);
    const wave = Math.sin(index * 0.6) * drift * 0.14;
    return {
      label,
      value: -drift * (1 - progress) + total * progress + wave,
    };
  }).slice(0, count);
};

const computeDrawdown = (series: SeriesPoint[]) => {
  let peak = Number.NEGATIVE_INFINITY;
  let drawdown = 0;
  series.forEach((item) => {
    peak = Math.max(peak, item.value);
    drawdown = Math.min(drawdown, item.value - peak);
  });
  return drawdown;
};

const latestPointsByDay = (series: ValuationPoint[]) => {
  const bucket = new Map<string, ValuationPoint>();
  series.forEach((point) => {
    const existing = bucket.get(point.date);
    if (!existing || `${point.date} ${point.time}` > `${existing.date} ${existing.time}`) {
      bucket.set(point.date, point);
    }
  });
  return Array.from(bucket.values()).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
};

export default function DashboardPage() {
  const { state, refreshing, error, valuationSeries, refreshFunds } = useAppState();
  const [period, setPeriod] = useState<"day" | "month" | "year">("day");
  const [chartView, setChartView] = useState<"trend" | "distribution" | "calendar">("trend");

  const principal = state.funds.reduce((sum, fund) => {
    const holding = state.holdings[fund.code];
    if (!holding || holding.share == null || holding.cost == null) return sum;
    return sum + holding.share * holding.cost;
  }, 0);

  const totalAmount = state.funds.reduce((sum, fund) => {
    const metrics = getHoldingMetrics(fund, state.holdings[fund.code]);
    return sum + (metrics?.amount || 0);
  }, 0);

  const totalProfitToday = state.funds.reduce((sum, fund) => {
    const metrics = getHoldingMetrics(fund, state.holdings[fund.code]);
    return sum + (metrics?.profitToday || 0);
  }, 0);

  const totalProfit = state.funds.reduce((sum, fund) => {
    const metrics = getHoldingMetrics(fund, state.holdings[fund.code]);
    return sum + (metrics?.profitTotal || 0);
  }, 0);

  const transactionSnapshot = useMemo(() => {
    return Object.values(state.transactions).reduce(
      (acc, items) => {
        const summary = summarizeTransactions(items);
        acc.realized += summary.realizedProfit;
        acc.fees += summary.totalFees;
        return acc;
      },
      { realized: 0, fees: 0 },
    );
  }, [state.transactions]);

  const trendData = useMemo(() => {
    const intraday = new Map<string, number>();
    const dailyClose = new Map<string, number>();

    state.funds.forEach((fund) => {
      const holding = state.holdings[fund.code];
      const metrics = getHoldingMetrics(fund, holding);
      const currentNav = Number(fund.gsz ?? fund.dwjz);
      const principalForFund = holding?.share && holding?.cost ? holding.share * holding.cost : 0;
      const series = valuationSeries[fund.code] || [];

      if (!metrics || !Number.isFinite(currentNav) || currentNav <= 0 || !series.length) return;

      const latestDate = series[series.length - 1]?.date;
      series.forEach((point) => {
        const estimatedAmount = metrics.amount * (point.value / currentNav);
        const profit = estimatedAmount - principalForFund;
        if (point.date === latestDate) {
          intraday.set(point.time, (intraday.get(point.time) || 0) + profit);
        }
      });

      latestPointsByDay(series).forEach((point) => {
        const estimatedAmount = metrics.amount * (point.value / currentNav);
        const profit = estimatedAmount - principalForFund;
        dailyClose.set(point.date, (dailyClose.get(point.date) || 0) + profit);
      });
    });

    const intradaySeries = Array.from(intraday.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label, value }));

    const dailySeries: DailyPoint[] = Array.from(dailyClose.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, label: dayLabel(date), value }));

    return { intradaySeries, dailySeries };
  }, [state.funds, state.holdings, valuationSeries]);

  const dailySeries = trendData.intradaySeries.length
    ? trendData.intradaySeries
    : buildFallbackSeries(totalProfitToday, 8, Array.from({ length: 8 }, (_, index) => intradayLabel(index, 8)));

  const monthSeries = trendData.dailySeries.length >= 7
    ? trendData.dailySeries.slice(-30).map(({ label, value }) => ({ label, value }))
    : buildFallbackSeries(
        totalProfit * 0.32 + totalProfitToday * 6,
        30,
        Array.from({ length: 30 }, (_, index) => {
          const date = new Date();
          date.setDate(date.getDate() - (29 - index));
          return `${date.getMonth() + 1}/${date.getDate()}`;
        }),
      );

  const yearSeries = trendData.dailySeries.length >= 20
    ? Object.values(
        trendData.dailySeries.reduce<Record<string, SeriesPoint>>((acc, item) => {
          const key = item.date.slice(0, 7);
          acc[key] = { label: monthLabel(`${key}-01`), value: item.value };
          return acc;
        }, {}),
      ).slice(-12)
    : buildFallbackSeries(
        totalProfit,
        12,
        Array.from({ length: 12 }, (_, index) => {
          const date = new Date();
          date.setMonth(date.getMonth() - (11 - index));
          return `${date.getMonth() + 1}月`;
        }),
      );

  const activeSeries = period === "day" ? dailySeries : period === "month" ? monthSeries : yearSeries;
  const activeValue = period === "day" ? totalProfitToday : period === "month" ? monthSeries.at(-1)?.value || 0 : yearSeries.at(-1)?.value || 0;
  const weeklyDrawdown = computeDrawdown(monthSeries.slice(-7));
  const monthlyDrawdown = computeDrawdown(monthSeries);
  const accountReturnRate = principal > 0 ? (totalProfit / principal) * 100 : 0;

  const weeklyDistribution = monthSeries.slice(-7).map((item, index, source) => ({
    label: item.label,
    value: item.value - (index === 0 ? 0 : source[index - 1].value),
  }));

  const bestFund = [...state.funds]
    .map((fund) => ({ fund, metrics: getHoldingMetrics(fund, state.holdings[fund.code]) }))
    .sort((a, b) => (b.metrics?.profitTotal || -Infinity) - (a.metrics?.profitTotal || -Infinity))[0];

  const fundsWithTransactions = Object.values(state.transactions).filter((items) => items.length > 0).length;
  const chartTitle = chartView === "trend"
    ? (period === "day" ? "账户日内盈亏曲线" : period === "month" ? "账户月度盈亏曲线" : "账户年度盈亏曲线")
    : chartView === "distribution"
      ? "收益分布"
      : "当月收益日历";
  const chartEyebrow = chartView === "trend" ? "Profit Curve" : chartView === "distribution" ? "Return Distribution" : "Profit Calendar";
  const distributionData = weeklyDistribution;
  const distributionTotal = distributionData.reduce((sum, item) => sum + item.value, 0);
  const updatedLabel = state.lastUpdatedAt ? `今日已更新 ${formatClock(state.lastUpdatedAt)}` : "等待更新";
  const hasFunds = state.funds.length > 0;
  const calendarMonth = nowInMarket().format("YYYY-MM");
  const monthlyReturnPoints = useMemo(() => {
    const series = trendData.dailySeries;
    if (!series.length) return [] as { date: string; rate: number }[];

    return series
      .map((item, index) => {
        const previous = index === 0 ? 0 : series[index - 1].value;
        const change = item.value - previous;
        const rate = principal > 0 ? (change / principal) * 100 : 0;
        return {
          date: item.date,
          rate,
        };
      })
      .filter((item) => item.date.startsWith(calendarMonth));
  }, [trendData.dailySeries, principal, calendarMonth]);

  return (
    <div className="screen dashboard-cockpit">
      <section className="dashboard-headline">
        <div>
          <p className="section-heading__eyebrow">Account Center</p>
          <h1>账户盈亏</h1>
          <span className="dashboard-headline__sub">核心盈亏、风险和结构一屏内快速查看。</span>
        </div>
        <button type="button" className="dashboard-headline__refresh" onClick={() => refreshFunds()} disabled={refreshing} aria-label="刷新账户数据">
          <RefreshCcw size={16} className={refreshing ? "is-spinning" : ""} />
        </button>
      </section>

      {hasFunds ? (
        <>
          <section className="dashboard-overview-card">
            <div className="dashboard-overview-card__top">
              <div>
                <span>账户总市值</span>
                <strong>{formatCurrency(totalAmount)}</strong>
                <small>本金 {formatCurrency(principal)} · 累计回报 {accountReturnRate.toFixed(2)}%</small>
              </div>
              <em>{updatedLabel}</em>
            </div>

            <div className="dashboard-key-metrics">
              <article>
                <span>今日盈亏</span>
                <strong className={totalProfitToday >= 0 ? "is-up" : "is-down"}>{formatSignedCurrency(totalProfitToday)}</strong>
                <small>日内波动结果</small>
              </article>
              <article>
                <span>累计收益</span>
                <strong className={totalProfit >= 0 ? "is-up" : "is-down"}>{formatSignedCurrency(totalProfit)}</strong>
                <small>当前持仓总贡献</small>
              </article>
              <article>
                <span>本周最大回撤</span>
                <strong className={weeklyDrawdown >= 0 ? "is-up" : "is-down"}>{formatSignedCurrency(weeklyDrawdown)}</strong>
                <small>近 7 日测算</small>
              </article>
              <article>
                <span>本月最大回撤</span>
                <strong className={monthlyDrawdown >= 0 ? "is-up" : "is-down"}>{formatSignedCurrency(monthlyDrawdown)}</strong>
                <small>近 30 日测算</small>
              </article>
            </div>

            <div className="dashboard-overview-card__meta">
              <span>已实现收益 {formatSignedCurrency(transactionSnapshot.realized)}</span>
              <span>手续费 {formatCurrency(transactionSnapshot.fees)}</span>
              <span>更新时间 {formatClock(state.lastUpdatedAt)}</span>
            </div>
          </section>

          <section className="dashboard-chart-zone">
            <article className="insight-card dashboard-chart-card">
              <div className="dashboard-period-inline">
                {[
                  { id: "day", label: "日" },
                  { id: "month", label: "月" },
                  { id: "year", label: "年" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`period-switcher__item ${period === item.id ? "is-active" : ""}`}
                    onClick={() => setPeriod(item.id as "day" | "month" | "year")}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="dashboard-chart-card__head">
                <div>
                  <p className="section-heading__eyebrow">{chartEyebrow}</p>
                  <h2>{chartTitle}</h2>
                </div>
              </div>

              <div className="dashboard-chart-card__toolbar">
                <span className="insight-chip">
                  {chartView === "trend" ? <LineChart size={14} /> : chartView === "distribution" ? <BarChart3 size={14} /> : <CalendarDays size={14} />}
                  {chartView === "trend" ? `当前 ${formatSignedCurrency(activeValue)}` : chartView === "distribution" ? formatSignedCurrency(distributionTotal) : "35 日热力"}
                </span>
                <div className="chart-mode-switch" role="tablist" aria-label="切换图表视图">
                  <button type="button" role="tab" aria-selected={chartView === "trend"} className={`chart-mode-switch__item ${chartView === "trend" ? "is-active" : ""}`} onClick={() => setChartView("trend")}>曲线</button>
                  <button type="button" role="tab" aria-selected={chartView === "distribution"} className={`chart-mode-switch__item ${chartView === "distribution" ? "is-active" : ""}`} onClick={() => setChartView("distribution")}>分布</button>
                  <button type="button" role="tab" aria-selected={chartView === "calendar"} className={`chart-mode-switch__item ${chartView === "calendar" ? "is-active" : ""}`} onClick={() => setChartView("calendar")}>日历</button>
                </div>
              </div>

              {chartView === "trend" ? (
                <PerformanceLineChart data={activeSeries} height={236} />
              ) : null}

              {chartView === "distribution" ? (
                <div className="dashboard-distribution-card">
                  <div className="dashboard-distribution-card__head">
                    <small>近 7 日收益分布</small>
                  </div>
                  <ReturnTrendChart data={distributionData} height={212} />
                </div>
              ) : null}

              {chartView === "calendar" ? (
                <div className="dashboard-calendar-card">
                  <MonthlyReturnCalendar month={calendarMonth} points={monthlyReturnPoints} />
                </div>
              ) : null}
            </article>
          </section>

          <section className="insight-card dashboard-best-card">
            <div className="dashboard-best-card__head">
              <div>
                <p className="section-heading__eyebrow">Best Position</p>
                <h2>当前贡献最高的持仓</h2>
              </div>
            </div>

            {bestFund?.fund ? (
              <Link href={`/portfolio/${bestFund.fund.code}`} className="dashboard-best-card__main">
                <div>
                  <strong>{bestFund.fund.name}</strong>
                  <span>{bestFund.fund.code}</span>
                </div>
                <div className="dashboard-best-card__amount">
                  <b className={(bestFund.metrics?.profitTotal || 0) >= 0 ? "is-up" : "is-down"}>{formatSignedCurrency(bestFund.metrics?.profitTotal)}</b>
                  <ChevronRight size={15} />
                </div>
              </Link>
            ) : (
              <div className="chart-empty">先添加并录入持仓后，这里会显示最强贡献项。</div>
            )}

            <div className="dashboard-best-card__stats">
              <div>
                <span>总基金数</span>
                <strong>{state.funds.length}</strong>
              </div>
              <div>
                <span>账户回报</span>
                <strong className={accountReturnRate >= 0 ? "is-up" : "is-down"}>{accountReturnRate.toFixed(2)}%</strong>
              </div>
              <div>
                <span>有交易记录</span>
                <strong>{fundsWithTransactions}</strong>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {error ? <p className="status-banner status-banner--error">{error}</p> : null}

      {!hasFunds ? (
        <section className="empty-panel">
          <h2>还没有加入基金</h2>
          <p>先去发现页搜索基金代码或名称，加入后这里会开始生成账户曲线和盈亏日历。</p>
          <Link href="/discover" className="primary-link">前往发现页</Link>
        </section>
      ) : null}
    </div>
  );
}
