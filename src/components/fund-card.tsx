"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Star, StarOff, Trash2 } from "lucide-react";

import { Sparkline } from "@/components/sparkline";
import { formatCurrency, formatPercent, formatSignedCurrency, getHoldingMetrics } from "@/lib/portfolio";
import { formatClock } from "@/lib/time";
import type { FundHolding, FundSnapshot, ValuationPoint } from "@/lib/types";

type FundCardProps = {
  fund: FundSnapshot;
  holding?: FundHolding;
  valuationSeries: ValuationPoint[];
  favorite: boolean;
  onToggleFavorite: (code: string) => void;
  onRemove: (code: string) => void;
};

export function FundCard({ fund, holding, valuationSeries, favorite, onToggleFavorite, onRemove }: FundCardProps) {
  const metrics = getHoldingMetrics(fund, holding);
  const estimateChange = Number(fund.gszzl);

  return (
    <motion.article className="fund-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
      <div className="fund-card__header">
        <div>
          <Link href={`/portfolio/${fund.code}`} className="block">
            <p className="fund-card__eyebrow">{fund.code}</p>
            <h2>{fund.name}</h2>
          </Link>
        </div>
        <div className="fund-card__actions">
          <button type="button" className="icon-action" aria-label={favorite ? "取消关注" : "加入关注"} onClick={() => onToggleFavorite(fund.code)}>
            {favorite ? <Star size={16} /> : <StarOff size={16} />}
          </button>
          <button type="button" className="icon-action" aria-label="移除基金" onClick={() => onRemove(fund.code)}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="fund-card__stats">
        <div>
          <span>净值</span>
          <strong>{fund.dwjz || "—"}</strong>
        </div>
        <div>
          <span>估值涨幅</span>
          <strong className={estimateChange >= 0 ? "is-up" : "is-down"}>{formatPercent(estimateChange)}</strong>
        </div>
        <div>
          <span>刷新</span>
          <strong>{formatClock(fund.gztime || fund.jzrq)}</strong>
        </div>
      </div>

      <div className="fund-card__trend">
        <Sparkline points={valuationSeries} />
      </div>

      <div className="fund-card__footer">
        <div>
          <span>持有金额</span>
          <strong>{formatCurrency(metrics?.amount)}</strong>
        </div>
        <div>
          <span>当日收益</span>
          <strong className={(metrics?.profitToday || 0) >= 0 ? "is-up" : "is-down"}>{formatSignedCurrency(metrics?.profitToday)}</strong>
        </div>
        <div>
          <span>累计收益</span>
          <strong className={(metrics?.profitTotal || 0) >= 0 ? "is-up" : "is-down"}>{formatSignedCurrency(metrics?.profitTotal)}</strong>
        </div>
      </div>
    </motion.article>
  );
}
