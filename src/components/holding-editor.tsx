"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { formatSignedCurrency, getHoldingMetrics } from "@/lib/portfolio";
import type { FundHolding, FundSnapshot } from "@/lib/types";

type HoldingEditorProps = {
  fund: FundSnapshot;
  holding?: FundHolding;
  onSave: (code: string, next: FundHolding) => void;
};

export function HoldingEditor({ fund, holding, onSave }: HoldingEditorProps) {
  const [share, setShare] = useState(holding?.share?.toString() || "");
  const [cost, setCost] = useState(holding?.cost?.toString() || "");
  const [firstPurchaseDate, setFirstPurchaseDate] = useState(holding?.firstPurchaseDate || "");

  useEffect(() => {
    setShare(holding?.share?.toString() || "");
    setCost(holding?.cost?.toString() || "");
    setFirstPurchaseDate(holding?.firstPurchaseDate || "");
  }, [holding?.cost, holding?.firstPurchaseDate, holding?.share]);

  const metrics = getHoldingMetrics(fund, holding);

  return (
    <section className="holding-editor">
      <div className="holding-editor__head">
        <div>
          <Link href={`/portfolio/${fund.code}`} className="text-inherit no-underline">
            <p>{fund.code}</p>
            <h3>{fund.name}</h3>
          </Link>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() =>
            onSave(fund.code, {
              share: share ? Number(share) : null,
              cost: cost ? Number(cost) : null,
              firstPurchaseDate: firstPurchaseDate || null,
            })
          }
        >
          保存
        </button>
      </div>

      <div className="holding-editor__grid holding-editor__grid--detail">
        <label>
          <span>持有份额</span>
          <input inputMode="decimal" value={share} onChange={(event) => setShare(event.target.value)} placeholder="例如 1250.88" />
        </label>
        <label>
          <span>持仓成本</span>
          <input inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="例如 1.2480" />
        </label>
        <label className="holding-editor__full">
          <span>首次买入日期</span>
          <input type="date" value={firstPurchaseDate} onChange={(event) => setFirstPurchaseDate(event.target.value)} />
        </label>
      </div>

      <div className="holding-editor__meta">
        <span>当日收益 {formatSignedCurrency(metrics?.profitToday)}</span>
        <span>累计收益 {formatSignedCurrency(metrics?.profitTotal)}</span>
      </div>
    </section>
  );
}
