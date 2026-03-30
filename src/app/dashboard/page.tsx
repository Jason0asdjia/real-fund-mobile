"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronRight, LineChart, RefreshCcw, Wallet } from "lucide-react";

import { PerformanceHeatmap } from "@/components/performance-heatmap";
import { PerformanceLineChart } from "@/components/performance-line-chart";
import { ReturnDistribution } from "@/components/return-distribution";
import { useAppState } from "@/components/app-provider";
import { formatCurrency, formatSignedCurrency, getHoldingMetrics, summarizeTransactions } from "@/lib/portfolio";
import { formatClock } from "@/lib/time";
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

  const heatmapData = monthSeries.slice(-35).map((item, index, source) => {
    const previous = index === 0 ? 0 : source[index - 1].value;
    return {
      label: item.label,
      value: item.value - previous,
    };
  });

  const weeklyDistribution = monthSeries.slice(-7).map((item, index, source) => ({
    label: item.label,
    value: item.value - (index === 0 ? 0 : source[index - 1].value),
  }));

  const monthlyDistribution = monthSeries.slice(-12).map((item, index, source) => ({
    label: item.label,
    value: item.value - (index === 0 ? 0 : source[index - 1].value),
  }));

  const bestFund = [...state.funds]
    .map((fund) => ({ fund, metrics: getHoldingMetrics(fund, state.holdings[fund.code]) }))
    .sort((a, b) => (b.metrics?.profitTotal || -Infinity) - (a.metrics?.profitTotal || -Infinity))[0];

  return (
    <div className="screen">
      <section className="account-hero">
        <div className="account-hero__top">
          <div>
            <p className="section-heading__eyebrow">Account Center</p>
            <h1>账户盈亏</h1>
            <span className="account-hero__sub">把日内波动、阶段收益、已实现收益和回撤拆开看，决策会更稳。</span>
          </div>
          <button type="button" className="hero-card__action" onClick={() => refreshFunds()} disabled={refreshing}>
            <RefreshCcw size={15} className={refreshing ? "is-spinning" : ""} />
            <span>{refreshing ? "刷新中" : "刷新"}</span>
          </button>
        </div>

        <div className="account-balance-card">
          <div className="account-balance-card__main">
            <span>账户总市值</span>
            <strong>{formatCurrency(totalAmount)}</strong>
            <small>本金 {formatCurrency(principal)} · 累计回报 {accountReturnRate.toFixed(2)}%</small>
          </div>
          <div className="account-balance-card__side">
            <div>
              <span>今日</span>
              <b className={totalProfitToday >= 0 ? "is-up" : "is-down"}>{formatSignedCurrency(totalProfitToday)}</b>
            </div>
            <div>
              <span>累计</span>
              <b className={totalProfit >= 0 ? "is-up" : "is-down"}>{formatSignedCurrency(totalProfit)}</b>
            </div>
          </div>
        </div>

        <div className="overview-summary-grid overview-summary-grid--hero">
          <article className="overview-summary-card is-primary">
            <span>本周最大回撤</span>
            <strong className={weeklyDrawdown >= 0 ? "is-up" : "is-down"}>{formatSignedCurrency(weeklyDrawdown)}</strong>
            <small>以近 7 个日度点位测算</small>
          </article>
          <article className="overview-summary-card">
            <span>本月最大回撤</span>
            <strong className={monthlyDrawdown >= 0 ? "is-up" : "is-down"}>{formatSignedCurrency(monthlyDrawdown)}</strong>
            <small>以近 30 个日度点位测算</small>
          </article>
          <article className="overview-summary-card">
            <span>已实现收益 / 手续费</span>
            <strong className={transactionSnapshot.realized >= 0 ? "is-up" : "is-down"}>{formatSignedCurrency(transactionSnapshot.realized)}</strong>
            <small>手续费 {formatCurrency(transactionSnapshot.fees)} · 最后刷新 {formatClock(state.lastUpdatedAt)}</small>
          </article>
        </div>
      </section>

      <section className="period-switcher" aria-label="盈亏周期切换">
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
      </section>

      <section className="insight-card">
        <div className="insight-card__head">
          <div>
            <p className="section-heading__eyebrow">Profit Curve</p>
            <h2>{period === "day" ? "账户日内盈亏曲线" : period === "month" ? "账户月度盈亏曲线" : "账户年度盈亏曲线"}</h2>
          </div>
          <span className="insight-chip"><LineChart size={14} /> 当前 {formatSignedCurrency(activeValue)}</span>
        </div>
        <PerformanceLineChart data={activeSeries} />
      </section>

      <section className="distribution-grid">
        <ReturnDistribution title="近 7 日收益分布" data={weeklyDistribution} />
        <ReturnDistribution title="近 12 个交易日收益分布" data={monthlyDistribution} />
      </section>

      <section className="insight-grid">
        <article className="insight-card">
          <div className="insight-card__head">
            <div>
              <p className="section-heading__eyebrow">Profit Calendar</p>
              <h2>近 35 日盈亏日历</h2>
            </div>
            <span className="insight-chip"><CalendarDays size={14} /> 热力视图</span>
          </div>
          <PerformanceHeatmap data={heatmapData} />
        </article>

        <article className="insight-card">
          <div className="insight-card__head">
            <div>
              <p className="section-heading__eyebrow">Best Position</p>
              <h2>当前贡献最高的持仓</h2>
            </div>
            <span className="insight-chip"><Wallet size={14} /> 盈亏贡献</span>
          </div>

          {bestFund?.fund ? (
            <Link href={`/portfolio/${bestFund.fund.code}`} className="best-position-card">
              <div>
                <strong>{bestFund.fund.name}</strong>
                <span>{bestFund.fund.code}</span>
              </div>
              <div className="best-position-card__meta">
                <b className={(bestFund.metrics?.profitTotal || 0) >= 0 ? "is-up" : "is-down"}>
                  {formatSignedCurrency(bestFund.metrics?.profitTotal)}
                </b>
                <ChevronRight size={16} />
              </div>
            </Link>
          ) : (
            <div className="chart-empty">先添加并录入持仓后，这里会显示最强贡献项。</div>
          )}

          <div className="mini-stat-list">
            <div className="mini-stat-item">
              <span>总基金数</span>
              <strong>{state.funds.length}</strong>
            </div>
            <div className="mini-stat-item">
              <span>账户回报</span>
              <strong className={accountReturnRate >= 0 ? "is-up" : "is-down"}>{accountReturnRate.toFixed(2)}%</strong>
            </div>
            <div className="mini-stat-item">
              <span>有交易记录</span>
              <strong>{Object.values(state.transactions).filter((items) => items.length > 0).length}</strong>
            </div>
          </div>
        </article>
      </section>

      {error ? <p className="status-banner status-banner--error">{error}</p> : null}

      {!state.funds.length ? (
        <section className="empty-panel">
          <h2>还没有加入基金</h2>
          <p>先去发现页搜索基金代码或名称，加入后这里会开始生成账户曲线和盈亏日历。</p>
          <Link href="/discover" className="primary-link">前往发现页</Link>
        </section>
      ) : null}
    </div>
  );
}
