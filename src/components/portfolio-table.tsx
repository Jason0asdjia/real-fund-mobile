"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";

import { formatCurrency, formatPercent, formatSignedCurrency, getHoldingMetrics } from "@/lib/portfolio";
import type { FundHolding, FundSnapshot } from "@/lib/types";

type PortfolioTableProps = {
  funds: FundSnapshot[];
  holdings: Record<string, FundHolding>;
  initialScrollTop?: number;
  initialScrollLeft?: number;
  onScrollPositionChange?: (position: { top: number; left: number }) => void;
  onBeforeNavigate?: () => void;
};

type PortfolioRow = {
  code: string;
  fundName: string;
  latestNav: string;
  estimateNav: string;
  estimateChangePercent: string;
  holdingAmount: string;
  share: string;
  cost: string;
  todayProfit: string;
  holdingProfit: string;
  positiveToday: boolean;
  positiveTotal: boolean;
};

const buildRows = (funds: FundSnapshot[], holdings: Record<string, FundHolding>): PortfolioRow[] => {
  return funds.map((fund) => {
    const holding = holdings[fund.code];
    const metrics = getHoldingMetrics(fund, holding);
    const todayProfit = metrics?.profitToday ?? null;
    const totalProfit = metrics?.profitTotal ?? null;

    return {
      code: fund.code,
      fundName: fund.name,
      latestNav: fund.dwjz || "—",
      estimateNav: fund.gsz != null ? Number(fund.gsz).toFixed(4) : fund.dwjz || "—",
      estimateChangePercent: formatPercent(Number(fund.gszzl)),
      holdingAmount: formatCurrency(metrics?.amount),
      share: holding?.share != null ? holding.share.toFixed(2) : "—",
      cost: holding?.cost != null ? Number(holding.cost).toFixed(4) : "—",
      todayProfit: formatSignedCurrency(todayProfit),
      holdingProfit: formatSignedCurrency(totalProfit),
      positiveToday: (todayProfit || 0) >= 0,
      positiveTotal: (totalProfit || 0) >= 0,
    };
  });
};

export function PortfolioTable({
  funds,
  holdings,
  initialScrollTop = 0,
  initialScrollLeft = 0,
  onScrollPositionChange,
  onBeforeNavigate,
}: PortfolioTableProps) {
  const rows = buildRows(funds, holdings);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const restoredRef = useRef(false);

  useEffect(() => {
    if (!scrollRef.current || restoredRef.current) return;
    scrollRef.current.scrollTop = initialScrollTop;
    scrollRef.current.scrollLeft = initialScrollLeft;
    restoredRef.current = true;
  }, [initialScrollLeft, initialScrollTop]);

  return (
    <motion.section
      className="portfolio-table-shell"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <div className="portfolio-table-shell__head">
        <div>
          <p className="portfolio-table-shell__eyebrow">Holdings Matrix</p>
          <h2>表格浏览保留当前位置，基金详情与交易维护进入独立子页面。</h2>
        </div>
        <span className="portfolio-table-shell__hint">表格内上下滚动，横向滑列</span>
      </div>

      <div
        ref={scrollRef}
        className="portfolio-table-scroll"
        role="region"
        aria-label="持仓表格，可横向和纵向滚动"
        tabIndex={0}
        onScroll={(event) =>
          onScrollPositionChange?.({
            top: event.currentTarget.scrollTop,
            left: event.currentTarget.scrollLeft,
          })
        }
      >
        <table className="portfolio-table">
          <thead>
            <tr>
              <th className="is-frozen">基金</th>
              <th>最新净值</th>
              <th>估算净值</th>
              <th>估值涨幅</th>
              <th>持仓金额</th>
              <th>持有份额</th>
              <th>持仓成本</th>
              <th>当日收益</th>
              <th>持有收益</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.code}>
                <td className="is-frozen portfolio-table__name-cell">
                  <Link href={`/portfolio/${row.code}`} className="portfolio-table__name-link" onClick={() => onBeforeNavigate?.()}>
                    <div>
                      <strong>{row.fundName}</strong>
                      <span>{row.code}</span>
                    </div>
                    <ChevronRight size={16} />
                  </Link>
                </td>
                <td>{row.latestNav}</td>
                <td>{row.estimateNav}</td>
                <td className={row.estimateChangePercent.startsWith("-") ? "is-down" : "is-up"}>{row.estimateChangePercent}</td>
                <td>{row.holdingAmount}</td>
                <td>{row.share}</td>
                <td>{row.cost}</td>
                <td className={row.positiveToday ? "is-up" : "is-down"}>{row.todayProfit}</td>
                <td className={row.positiveTotal ? "is-up" : "is-down"}>{row.holdingProfit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}
