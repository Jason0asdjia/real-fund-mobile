"use client";

import { useState } from "react";
import { ChevronLeft, Clock3, ReceiptText, Trash2 } from "lucide-react";

import { HoldingEditor } from "@/components/holding-editor";
import { useAppState } from "@/components/app-provider";
import { formatCurrency } from "@/lib/portfolio";
import type { FundTransactionType } from "@/lib/types";

type FundManageViewProps = {
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

export function FundManageView({ code, onBack, asModal = false }: FundManageViewProps) {
  const { state, updateHolding, addTransaction, removeTransaction } = useAppState();
  const [form, setForm] = useState(createDefaultForm());

  const fund = state.funds.find((item) => item.code === code);

  if (!fund) {
    return (
      <div className={asModal ? "detail-page" : "screen"}>
        {onBack ? (
          <header className="detail-topbar">
            <button type="button" className="detail-topbar__back" onClick={onBack}>
              <ChevronLeft size={16} />
              返回详情
            </button>
            <div className="detail-topbar__title">
              <strong>持仓操作</strong>
              <span>未找到基金</span>
            </div>
            <span className="detail-topbar__placeholder" />
          </header>
        ) : null}

        <section className="empty-panel">
          <h2>没有找到这只基金</h2>
          <p>它可能已经被移除，或者当前地址不是有效的持仓操作页。</p>
        </section>
      </div>
    );
  }

  const transactions = state.transactions[fund.code] || [];
  const holding = state.holdings[fund.code];

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

  return (
    <div className={asModal ? "detail-page" : "screen"}>
      {onBack ? (
        <header className="detail-topbar">
          <button type="button" className="detail-topbar__back" onClick={onBack}>
            <ChevronLeft size={16} />
            返回详情
          </button>
          <div className="detail-topbar__title">
            <strong>{fund.name}</strong>
            <span>{fund.code}</span>
          </div>
          <span className="detail-topbar__placeholder" />
        </header>
      ) : null}

      <section className="detail-group detail-manage-shell">
        <div className="detail-group__head">
          <p className="section-heading__eyebrow">Position Actions</p>
          <h2>持仓编辑与加减仓操作</h2>
        </div>

        <HoldingEditor fund={fund} holding={holding} onSave={updateHolding} />

        <section className="insight-card">
          <div className="insight-card__head">
            <div>
              <p className="section-heading__eyebrow">Transaction Model</p>
              <h2>买入 / 卖出记录</h2>
            </div>
            <span className="insight-chip"><ReceiptText size={14} /> 操作页</span>
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
      </section>
    </div>
  );
}
