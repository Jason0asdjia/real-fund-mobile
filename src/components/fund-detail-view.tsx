"use client";

import { useState } from "react";
import { ChevronLeft, Clock3, ReceiptText, TrendingUp, Trash2, Wallet } from "lucide-react";

import { HoldingEditor } from "@/components/holding-editor";
import { PerformanceLineChart } from "@/components/performance-line-chart";
import { Sparkline } from "@/components/sparkline";
import { useAppState } from "@/components/app-provider";
import { formatCurrency, formatPercent, formatSignedCurrency, getHoldingMetrics, summarizeTransactions } from "@/lib/portfolio";
import { nowInMarket, toMarketDay } from "@/lib/time";
import type { FundTransactionType } from "@/lib/types";

type FundDetailViewProps = {
  code: string;
  onBack?: () => void;
  asModal?: boolean;
};

const createDefaultForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  type: "buy" as FundTransactionType,
  share: "",
  price: "",
  fee: "",
  note: "",
});

const getMetricValueClass = (value: string) => {
  const length = value.replace(/\s+/g, "").length;
  if (length >= 16) return "detail-metric-value detail-metric-value--xs";
  if (length >= 12) return "detail-metric-value detail-metric-value--sm";
  if (length >= 9) return "detail-metric-value detail-metric-value--md";
  return "detail-metric-value";
};

export function FundDetailView({ code, onBack, asModal = false }: FundDetailViewProps) {
  const { state, valuationSeries, updateHolding, addTransaction, removeTransaction } = useAppState();
  const [form, setForm] = useState(createDefaultForm());
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
  const shareText = holding?.share != null ? holding.share.toFixed(2) : "—";
  const costText = holding?.cost != null ? Number(holding.cost).toFixed(4) : "—";
  const totalFeesText = formatCurrency(transactionSummary.totalFees);
  const tradeCountText = `${transactions.length}`;

  const submitTransaction = () => {
    if (!form.date || !form.share || !form.price) return;
    addTransaction(fund.code, {
      date: form.date,
      type: form.type,
      share: Number(form.share),
      price: Number(form.price),
      fee: form.fee ? Number(form.fee) : 0,
      note: form.note || null,
    });
    setForm(createDefaultForm());
  };

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

      <section className="detail-metrics-stack">
        <div className="detail-metrics-row detail-metrics-row--2-1">
          <article className="detail-metric-card detail-metric-card--wide">
            <span>持仓金额</span>
            <strong className={getMetricValueClass(amountText)}>{amountText}</strong>
          </article>
          <article className="detail-metric-card">
            <span>当日收益</span>
            <strong className={`${getMetricValueClass(todayProfitText)} ${(metrics?.profitToday || 0) >= 0 ? "is-up" : "is-down"}`}>{todayProfitText}</strong>
          </article>
        </div>

        <div className="detail-metrics-row detail-metrics-row--1-1">
          <article className="detail-metric-card">
            <span>累计收益</span>
            <strong className={`${getMetricValueClass(totalProfitText)} ${(metrics?.profitTotal || 0) >= 0 ? "is-up" : "is-down"}`}>{totalProfitText}</strong>
          </article>
          <article className="detail-metric-card">
            <span>持仓收益率</span>
            <strong className={`${getMetricValueClass(returnRateText)} ${returnRate >= 0 ? "is-up" : "is-down"}`}>{returnRateText}</strong>
          </article>
        </div>

        <div className="detail-metrics-row detail-metrics-row--1-1">
          <article className="detail-metric-card">
            <span>首次买入</span>
            <strong className={getMetricValueClass(firstPurchaseText)}>{firstPurchaseText}</strong>
          </article>
          <article className="detail-metric-card">
            <span>持有天数</span>
            <strong className={getMetricValueClass(holdingDaysText)}>{holdingDaysText}</strong>
          </article>
        </div>

        <div className="detail-metrics-row detail-metrics-row--1-1">
          <article className="detail-metric-card">
            <span>持有份额</span>
            <strong className={getMetricValueClass(shareText)}>{shareText}</strong>
          </article>
          <article className="detail-metric-card">
            <span>持仓成本</span>
            <strong className={getMetricValueClass(costText)}>{costText}</strong>
          </article>
        </div>

        <div className="detail-metrics-row detail-metrics-row--1-1">
          <article className="detail-metric-card">
            <span>累计手续费</span>
            <strong className={getMetricValueClass(totalFeesText)}>{totalFeesText}</strong>
          </article>
          <article className="detail-metric-card">
            <span>交易笔数</span>
            <strong className={getMetricValueClass(tradeCountText)}>{tradeCountText}</strong>
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

      <section className="insight-card">
        <div className="insight-card__head">
          <div>
            <p className="section-heading__eyebrow">Transaction Model</p>
            <h2>买入 / 卖出记录</h2>
          </div>
          <span className="insight-chip"><ReceiptText size={14} /> 独立模型</span>
        </div>
        <div className="transaction-form">
          <label>
            <span>日期</span>
            <input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} />
          </label>
          <label>
            <span>方向</span>
            <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as FundTransactionType }))}>
              <option value="buy">买入</option>
              <option value="sell">卖出</option>
            </select>
          </label>
          <label>
            <span>份额</span>
            <input inputMode="decimal" value={form.share} onChange={(event) => setForm((current) => ({ ...current, share: event.target.value }))} placeholder="1000" />
          </label>
          <label>
            <span>成交净值</span>
            <input inputMode="decimal" value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} placeholder="1.2356" />
          </label>
          <label>
            <span>手续费</span>
            <input inputMode="decimal" value={form.fee} onChange={(event) => setForm((current) => ({ ...current, fee: event.target.value }))} placeholder="0" />
          </label>
          <label className="transaction-form__full">
            <span>备注</span>
            <input value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="可选" />
          </label>
          <button type="button" className="primary-button transaction-form__submit" onClick={submitTransaction}>
            记录一笔交易
          </button>
        </div>
      </section>

      <section className="insight-card">
        <div className="insight-card__head">
          <div>
            <p className="section-heading__eyebrow">Operation Log</p>
            <h2>交易流水</h2>
          </div>
          <span className="insight-chip"><Clock3 size={14} /> {transactions.length} 笔</span>
        </div>
        <div className="record-list">
          {transactions.length ? (
            transactions.map((item) => (
              <div key={item.id} className="record-item record-item--transaction">
                <div className="record-item__icon">
                  <Clock3 size={14} />
                </div>
                <div className="record-item__content">
                  <div className="record-item__head">
                    <strong>{item.type === "buy" ? "买入" : "卖出"} · {item.date}</strong>
                    <div className="record-item__actions">
                      <b className={item.type === "buy" ? "is-up" : "is-down"}>{item.share.toFixed(2)} 份</b>
                      <button type="button" className="icon-action icon-action--small" onClick={() => removeTransaction(fund.code, item.id)} aria-label="删除交易记录">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <p>净值 {Number(item.price).toFixed(4)} · 金额 {formatCurrency(item.share * item.price)} · 手续费 {formatCurrency(item.fee || 0)}{item.note ? ` · ${item.note}` : ""}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="chart-empty">还没有交易记录，先录入买入或卖出流水。</div>
          )}
        </div>
      </section>

      <HoldingEditor fund={fund} holding={holding} onSave={updateHolding} />
    </>
  );

  if (asModal) {
    return <div className="detail-page">{content}</div>;
  }

  return <div className="screen">{content}</div>;
}
