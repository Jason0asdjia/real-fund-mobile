"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PortfolioTable } from "@/components/portfolio-table";
import { useAppState } from "@/components/app-provider";
import { formatCurrency, formatSignedCurrency, getHoldingMetrics } from "@/lib/portfolio";

const VIEW_STATE_KEY = "real-fund-mobile:portfolio-view-state";

type PortfolioViewState = {
  windowY: number;
  tableTop: number;
  tableLeft: number;
};

const readViewState = (): PortfolioViewState => {
  if (typeof window === "undefined") return { windowY: 0, tableTop: 0, tableLeft: 0 };
  try {
    const raw = window.sessionStorage.getItem(VIEW_STATE_KEY);
    if (!raw) return { windowY: 0, tableTop: 0, tableLeft: 0 };
    return { windowY: 0, tableTop: 0, tableLeft: 0, ...JSON.parse(raw) };
  } catch {
    return { windowY: 0, tableTop: 0, tableLeft: 0 };
  }
};

export default function PortfolioPage() {
  const { state } = useAppState();
  const [restoredState, setRestoredState] = useState<PortfolioViewState>({ windowY: 0, tableTop: 0, tableLeft: 0 });
  const viewStateRef = useRef<PortfolioViewState>({ windowY: 0, tableTop: 0, tableLeft: 0 });

  const totals = state.funds.reduce(
    (acc, fund) => {
      const metrics = getHoldingMetrics(fund, state.holdings[fund.code]);
      acc.amount += metrics?.amount || 0;
      acc.today += metrics?.profitToday || 0;
      acc.total += metrics?.profitTotal || 0;
      return acc;
    },
    { amount: 0, today: 0, total: 0 },
  );

  useEffect(() => {
    const next = readViewState();
    viewStateRef.current = next;
    setRestoredState(next);

    const frame = window.requestAnimationFrame(() => {
      window.scrollTo(0, next.windowY);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  const persistViewState = useCallback((next?: Partial<PortfolioViewState>) => {
    if (typeof window === "undefined") return;
    viewStateRef.current = {
      ...viewStateRef.current,
      ...next,
    };
    window.sessionStorage.setItem(VIEW_STATE_KEY, JSON.stringify(viewStateRef.current));
  }, []);

  useEffect(() => {
    const syncWindow = () => persistViewState({ windowY: window.scrollY });
    window.addEventListener("scroll", syncWindow, { passive: true });
    return () => window.removeEventListener("scroll", syncWindow);
  }, [persistViewState]);

  const fundCountWithTransactions = useMemo(
    () => Object.values(state.transactions).filter((items) => items.length > 0).length,
    [state.transactions],
  );

  return (
    <div className="screen">
      <section className="section-heading">
        <p>Portfolio</p>
        <h1>返回持仓页会回到进入前的位置，表格继续维持你的浏览上下文。</h1>
      </section>

      <section className="metric-grid metric-grid--four">
        <article className="metric-tile">
          <span>总市值</span>
          <strong>{formatCurrency(totals.amount)}</strong>
        </article>
        <article className="metric-tile">
          <span>当日收益</span>
          <strong className={totals.today >= 0 ? "is-up" : "is-down"}>{formatSignedCurrency(totals.today)}</strong>
        </article>
        <article className="metric-tile">
          <span>累计收益</span>
          <strong className={totals.total >= 0 ? "is-up" : "is-down"}>{formatSignedCurrency(totals.total)}</strong>
        </article>
        <article className="metric-tile">
          <span>有交易记录的基金</span>
          <strong>{fundCountWithTransactions}</strong>
        </article>
      </section>

      {!state.funds.length ? (
        <section className="empty-panel">
          <h2>还没有任何基金可维护持仓</h2>
          <p>先去发现页加入基金，再回到这里查看持仓表。</p>
          <Link href="/discover" className="primary-link">去添加基金</Link>
        </section>
      ) : (
        <PortfolioTable
          funds={state.funds}
          holdings={state.holdings}
          initialScrollTop={restoredState.tableTop}
          initialScrollLeft={restoredState.tableLeft}
          onScrollPositionChange={(position) => persistViewState({ tableTop: position.top, tableLeft: position.left })}
          onBeforeNavigate={() => persistViewState({ windowY: window.scrollY })}
        />
      )}
    </div>
  );
}
