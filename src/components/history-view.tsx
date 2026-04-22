"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronRight } from "lucide-react";

import { useAppState } from "@/components/app-provider";
import { TwSelect } from "@/components/ui/tw-select";
import { useSwipeReveal } from "@/hooks/use-swipe-reveal";
import { formatCurrency } from "@/lib/portfolio";
import { formatMarketDate, nowInMarket, toMarketDay } from "@/lib/time";
import type { FundTransaction, FundTransactionType } from "@/lib/types";

type TxItem = FundTransaction & {
  code: string;
  fundName: string;
  amount: number;
};

const SWIPE_ACTION_WIDTH = 128;
const SWIPE_LOCK_THRESHOLD = 8;
const SWIPE_AXIS_BIAS = 4;
const SWIPE_EDGE_TRIGGER_WIDTH = 72;

const txOrderToken = (item: TxItem) => {
  const idPrefix = String(item.id || "").split("-")[0];
  const idTs = Number(idPrefix);
  if (Number.isFinite(idTs) && idTs > 0) return idTs;
  return toMarketDay(`${item.date}T00:00:00`).valueOf();
};

const txSortToken = (item: TxItem) => {
  if (/\d{2}:\d{2}/.test(item.date)) {
    return toMarketDay(item.date).valueOf();
  }

  const baseDay = toMarketDay(`${item.date}T00:00:00`).valueOf();
  const idToken = txOrderToken(item);
  const sameDayOffset = Math.max(0, idToken - baseDay);
  return baseDay + sameDayOffset;
};

const txDisplayTime = (item: TxItem) => {
  if (/\d{2}:\d{2}/.test(item.date)) {
    return toMarketDay(item.date).format("YYYY-MM-DD HH:mm");
  }

  const idPrefix = String(item.id || "").split("-")[0];
  const idTs = Number(idPrefix);
  const timeLabel = Number.isFinite(idTs) && idTs > 0
    ? formatMarketDate(idTs, "HH:mm")
    : "00:00";

  return `${toMarketDay(`${item.date}T00:00:00`).format("YYYY-MM-DD")} ${timeLabel}`;
};

const monthLabel = (monthKey: string) => {
  const [year, month] = monthKey.split("-");
  return `${year}年${month}月`;
};


export function HistoryView({ initialFundFilter = "all" }: { initialFundFilter?: string }) {
  const router = useRouter();
  const { state, removeTransaction } = useAppState();
  const [filter, setFilter] = useState<"all" | FundTransactionType>("all");
  const [timeRange, setTimeRange] = useState<"3m" | "6m" | "12m" | "all">("3m");
  const [fundFilter, setFundFilter] = useState<string>(initialFundFilter || "all");
  const [deleteTarget, setDeleteTarget] = useState<TxItem | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => new Set([nowInMarket().format("YYYY-MM")]));
  const swipe = useSwipeReveal({
    actionWidth: SWIPE_ACTION_WIDTH,
    edgeTriggerWidth: SWIPE_EDGE_TRIGGER_WIDTH,
    lockThreshold: SWIPE_LOCK_THRESHOLD,
    axisBias: SWIPE_AXIS_BIAS,
    openRatio: 0.5,
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("app-modal-open", Boolean(deleteTarget));
    return () => {
      document.body.classList.remove("app-modal-open");
    };
  }, [deleteTarget]);

  const fundFilterOptions = useMemo(() => {
    const transactionCodes = new Set(
      Object.entries(state.transactions)
        .filter(([, items]) => Array.isArray(items) && items.length > 0)
        .map(([code]) => code),
    );
    const visibleFunds = state.funds.filter((fund) => {
      const hasHolding = state.holdings[fund.code]?.share && Number(state.holdings[fund.code]?.share) > 0;
      return Boolean(hasHolding || transactionCodes.has(fund.code));
    });
    return [{ value: "all", label: "全部基金" }, ...visibleFunds.map((fund) => ({ value: fund.code, label: fund.name }))];
  }, [state.funds, state.holdings, state.transactions]);

  const normalizedFundFilter = fundFilterOptions.some((item) => item.value === fundFilter) ? fundFilter : "all";

  const transactions = useMemo<TxItem[]>(() => {
    const fundNameMap = new Map(state.funds.map((fund) => [fund.code, fund.name]));
    const list: TxItem[] = [];

    Object.entries(state.transactions).forEach(([code, items]) => {
      const fundName = fundNameMap.get(code) || `基金 ${code}`;
      items.forEach((item) => {
        list.push({
          ...item,
          code,
          fundName,
          amount: Number(item.share) * Number(item.price),
        });
      });
    });

    const now = nowInMarket();
    const rangeStart = timeRange === "3m"
      ? now.subtract(3, "month")
      : timeRange === "6m"
        ? now.subtract(6, "month")
        : timeRange === "12m"
          ? now.subtract(1, "year")
          : now;

    const filteredByTime = list.filter((item) => {
      if (timeRange === "all") return true;
      const txDate = toMarketDay(`${item.date}T00:00:00`);
      return txDate.isSame(rangeStart, "day") || txDate.isAfter(rangeStart, "day");
    });

    return filteredByTime
      .filter((item) => (normalizedFundFilter === "all" ? true : item.code === normalizedFundFilter))
      .filter((item) => (filter === "all" ? true : item.type === filter))
      .sort((a, b) => {
        const timeCmp = txSortToken(b) - txSortToken(a);
        if (timeCmp !== 0) return timeCmp;
        const dateCmp = `${b.date}`.localeCompare(`${a.date}`);
        if (dateCmp !== 0) return dateCmp;
        return txOrderToken(b) - txOrderToken(a);
      });
  }, [state.funds, state.transactions, filter, normalizedFundFilter, timeRange]);

  const grouped = useMemo(() => {
    const bucket = new Map<string, TxItem[]>();
    transactions.forEach((item) => {
      const month = item.date.slice(0, 7);
      const existing = bucket.get(month);
      if (existing) {
        existing.push(item);
      } else {
        bucket.set(month, [item]);
      }
    });
    return Array.from(bucket.entries());
  }, [transactions]);

  useEffect(() => {
    const monthKeys = grouped.map(([month]) => month);
    setExpandedMonths((prev) => {
      const next = new Set(Array.from(prev).filter((month) => monthKeys.includes(month)));
      const currentMonth = nowInMarket().format("YYYY-MM");
      if (monthKeys.includes(currentMonth)) {
        next.add(currentMonth);
      }
      if (next.size > 0) return next;
      if (monthKeys.length > 0) return new Set([monthKeys[0]]);
      return new Set<string>();
    });
  }, [grouped]);

  const periodLabel = timeRange === "3m" ? "近三个月" : timeRange === "6m" ? "近六个月" : timeRange === "12m" ? "近一年" : "全部时间";
  const periodVolume = transactions.reduce((acc, item) => acc + Math.abs(item.amount), 0);

  const handleEdit = (item: TxItem) => {
    swipe.closeSwipe();
    const route = item.type === "buy" ? "buy" : "sell";
    router.push(`/portfolio/${item.code}/${route}?from=history&editTxId=${encodeURIComponent(item.id)}`);
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    removeTransaction(deleteTarget.code, deleteTarget.id);
    swipe.closeSwipe();
    setDeleteTarget(null);
  };

  return (
    <div
      className="-mx-3 -mb-24 -mt-4 bg-white text-[#131b2e] md:-mx-4 md:-mb-24 md:-mt-4"
      onClick={swipe.handleContainerClick}
    >
      <header className="border-b border-[#e2e7ff] bg-white">
        <div className="flex h-12 items-center justify-between px-3">
          <h1 className="typo-page-title">交易历史</h1>
        </div>
      </header>

      <section className="bg-[#d7e2ff] px-3 pb-4 pt-3 text-[#001b3f]">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="mb-1 typo-label text-[#24467c]/70">{periodLabel}成交额</p>
              <p className="typo-value-hero text-[#001b3f]">{formatCurrency(periodVolume)}</p>
            </div>
            <div className="text-right">
              <p className="typo-label text-[#24467c]/70">交易笔数</p>
              <p className="m-0 text-[20px] font-bold leading-none text-[#24467c] tabular-nums">{transactions.length}</p>
            </div>
          </div>
      </section>

      <section className="border-b border-[#e2e7ff] bg-white px-3 py-2.5">
          <div className="flex items-center gap-2 overflow-hidden">
            <label className="sr-only" htmlFor="history-type-filter">交易类型</label>
            <TwSelect
              id="history-type-filter"
              className="w-[82px]"
              value={filter}
              onValueChange={(value) => setFilter(value as "all" | FundTransactionType)}
              options={[
                { value: "all", label: "全部" },
                { value: "buy", label: "买入" },
                { value: "sell", label: "卖出" },
              ]}
            />

            <label className="sr-only" htmlFor="history-time-filter">时间范围</label>
            <TwSelect
              id="history-time-filter"
              className="w-[116px]"
              value={timeRange}
              onValueChange={(value) => setTimeRange(value as "3m" | "6m" | "12m" | "all")}
              options={[
                { value: "3m", label: "近三个月" },
                { value: "6m", label: "近六个月" },
                { value: "12m", label: "近一年" },
                { value: "all", label: "全部时间" },
              ]}
            />

            <TwSelect
              id="history-fund-filter"
              className="w-[136px]"
              optionsClassName="max-h-56 overflow-y-auto [&_[role='option']]:whitespace-normal [&_[role='option']]:break-all"
              value={normalizedFundFilter}
              onValueChange={setFundFilter}
              options={fundFilterOptions}
            />
          </div>
      </section>

      <main className="pb-[calc(var(--bottom-nav-total-height)+0.7rem)]" onScroll={swipe.handleContainerScroll}>
          {grouped.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-[#747781]">暂无交易记录，先去持仓页录入交易。</div>
          ) : (
            grouped.map(([month, items]) => (
              <div key={month}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between bg-[#f8f9ff] px-3 py-2 text-left typo-section-title"
                  onClick={() => {
                    setExpandedMonths((prev) => {
                      const next = new Set(prev);
                      if (next.has(month)) {
                        next.delete(month);
                      } else {
                        next.add(month);
                      }
                      return next;
                    });
                  }}
                >
                  <span>{monthLabel(month)}</span>
                  {expandedMonths.has(month) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {expandedMonths.has(month) ? (
                <div className="divide-y divide-[#f2f3ff]">
                  {items.map((item) => {
                    const isBuy = item.type === "buy";
                    const iconClass = isBuy ? "bg-[#d7e2ff] text-[#24467c]" : "bg-[#ffdbd0] text-[#8c4f39]";
                    const amountClass = isBuy ? "text-[#005bc0]" : "text-[#8c4f39]";
                    const typeText = isBuy ? "申购" : "赎回";
                    const confirmed = Boolean(item.settledAt);
                    const currentOffset = swipe.getItemOffset(item.id);
                    return (
                      <div
                        key={item.id}
                        className="relative overflow-hidden bg-white touch-pan-y"
                        onClick={swipe.handleItemClick}
                        onTouchStart={(event) => swipe.handleItemTouchStart(item.id, event)}
                        onTouchMove={swipe.handleItemTouchMove}
                        onTouchEnd={swipe.handleItemTouchEnd}
                        onTouchCancel={swipe.handleItemTouchEnd}
                      >
                        <div className="absolute inset-y-0 right-0 z-[1] flex w-32 items-stretch">
                          <button
                            type="button"
                            data-swipe-action="true"
                            className="inline-flex h-full flex-1 items-center justify-center bg-blue-100 text-xs font-semibold text-blue-800"
                            onClick={() => handleEdit(item)}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            data-swipe-action="true"
                            className="inline-flex h-full flex-1 items-center justify-center bg-red-100 text-xs font-semibold text-red-700"
                            onClick={() => {
                              swipe.closeSwipe();
                              setDeleteTarget(item);
                            }}
                          >
                            删除
                          </button>
                        </div>

                        <article className="relative z-10 flex items-center gap-3 bg-white px-3 py-3 transition-transform duration-150" style={{ transform: `translateX(${currentOffset}px)` }}>
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded ${iconClass}`}>
                            {isBuy ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-0.5 flex items-start justify-between gap-2">
                              <Link href={`/portfolio/${item.code}`} className="truncate text-sm font-bold text-[#131b2e] hover:text-[#24467c]">
                                {item.fundName}
                              </Link>
                              <span className={`shrink-0 text-sm font-bold tabular-nums ${amountClass}`}>{`${isBuy ? "+" : "-"}${formatCurrency(Math.abs(item.amount))}`}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-semibold text-[#131b2e]">{typeText}</span>
                                <Link href={`/portfolio/${item.code}`} className="text-[10px] font-semibold tabular-nums text-[#57657a] hover:text-[#24467c]">
                                  {item.code}
                                </Link>
                                <span className="text-[10px] text-[#747781]">{txDisplayTime(item)}</span>
                              </div>
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${confirmed ? "bg-[#f2f3ff] text-[#57657a]" : "bg-[#fff1e6] text-[#a65000]"}`}>
                                {confirmed ? "已确认" : "未确认"}
                              </span>
                            </div>
                            <div className="mt-1 text-[10px] text-[#747781]">
                              净值 {Number(item.price).toFixed(4)} · 份额 {item.share.toFixed(2)} · 手续费 {formatCurrency(item.fee || 0)}
                            </div>
                          </div>
                        </article>
                      </div>
                    );
                  })}
                </div>
                ) : null}
              </div>
            ))
          )}
      </main>

      {deleteTarget ? (
        <div className="app-modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="app-modal-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="app-modal-sheet__grabber" />
            <div className="app-modal-sheet__header">
              <h3 className="m-0 text-base font-normal text-[#131b2e]">确认删除交易</h3>
              <button
                type="button"
                className="rounded-full border border-[#d5dbea] bg-white px-2 py-0.5 text-sm text-[#57657a]"
                onClick={() => setDeleteTarget(null)}
                aria-label="关闭删除交易确认弹窗"
              >
                ×
              </button>
            </div>
            <div className="app-modal-sheet__content">
              <p className="m-0 text-sm leading-6 text-[#57657a]">删除后该条交易会从历史记录移除，并同步更新持仓金额与成本。此操作无法撤销。</p>
              <div className="mt-4 flex gap-2 pb-3">
                <button
                  type="button"
                  className="flex-1 rounded-lg border border-[#d5dbea] bg-white px-3 py-2 text-sm font-medium text-[#24467c]"
                  onClick={() => setDeleteTarget(null)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-lg border border-[#ffdbd0] bg-[#fff1ed] px-3 py-2 text-sm font-medium text-[#ba1a1a]"
                  onClick={handleDeleteConfirm}
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
