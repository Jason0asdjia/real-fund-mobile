"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

import { useAppState } from "@/components/app-provider";
import { TwSelect } from "@/components/ui/tw-select";
import { formatCurrency, isTransactionConfirmedInMarket } from "@/lib/portfolio";
import { formatMarketDate, nowInMarket, toMarketDay } from "@/lib/time";
import type { FundTransaction, FundTransactionType } from "@/lib/types";

type TxItem = FundTransaction & {
  code: string;
  fundName: string;
  amount: number;
};

const txOrderToken = (item: TxItem) => {
  const idPrefix = String(item.id || "").split("-")[0];
  const idTs = Number(idPrefix);
  if (Number.isFinite(idTs) && idTs > 0) return idTs;
  return toMarketDay(`${item.date}T00:00:00`).valueOf();
};

const txDisplayTime = (item: TxItem) => {
  const idPrefix = String(item.id || "").split("-")[0];
  const idTs = Number(idPrefix);
  if (Number.isFinite(idTs) && idTs > 0) {
    return formatMarketDate(idTs, "YYYY-MM-DD HH:mm");
  }

  if (/\d{2}:\d{2}/.test(item.date)) {
    return toMarketDay(item.date).format("YYYY-MM-DD HH:mm");
  }

  return toMarketDay(`${item.date}T00:00:00`).format("YYYY-MM-DD HH:mm");
};

const monthLabel = (monthKey: string) => {
  const [year, month] = monthKey.split("-");
  return `${year}年${month}月`;
};


export function HistoryView({ initialFundFilter = "all" }: { initialFundFilter?: string }) {
  const { state } = useAppState();
  const [filter, setFilter] = useState<"all" | FundTransactionType>("all");
  const [timeRange, setTimeRange] = useState<"3m" | "6m" | "12m" | "all">("3m");
  const [fundFilter, setFundFilter] = useState<string>(initialFundFilter || "all");

  const fundFilterOptions = useMemo(() => {
    const holdingFunds = state.funds.filter((fund) => state.holdings[fund.code]?.share && Number(state.holdings[fund.code]?.share) > 0);
    return [{ value: "all", label: "全部基金" }, ...holdingFunds.map((fund) => ({ value: fund.code, label: fund.name }))];
  }, [state.funds, state.holdings]);

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

  const periodLabel = timeRange === "3m" ? "近三个月" : timeRange === "6m" ? "近六个月" : timeRange === "12m" ? "近一年" : "全部时间";
  const periodVolume = transactions.reduce((acc, item) => acc + Math.abs(item.amount), 0);

  return (
    <div className="-mx-3 -mb-24 -mt-4 flex h-[calc(100dvh-5.5rem)] flex-col overflow-hidden bg-white text-[#131b2e] md:-mx-4 md:-mb-24 md:-mt-4">
      <header className="z-20 shrink-0 border-b border-[#e2e7ff] bg-white">
        <div className="flex h-12 items-center justify-between px-3">
          <h1 className="typo-page-title">交易历史</h1>
        </div>
      </header>

      <main className="flex flex-1 flex-col overflow-hidden">
        <section className="shrink-0 bg-[#d7e2ff] px-3 pb-4 pt-3 text-[#001b3f]">
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

        <section className="shrink-0 border-b border-[#e2e7ff] bg-white px-3 py-2.5">
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

        <section className="flex-1 overflow-y-auto pb-14">
          {grouped.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-[#747781]">暂无交易记录，先去持仓页录入交易。</div>
          ) : (
            grouped.map(([month, items]) => (
              <div key={month}>
                <div className="bg-[#f8f9ff] px-3 py-2 typo-section-title">{monthLabel(month)}</div>
                <div className="divide-y divide-[#f2f3ff]">
                  {items.map((item) => {
                    const isBuy = item.type === "buy";
                    const iconClass = isBuy ? "bg-[#d7e2ff] text-[#24467c]" : "bg-[#ffdbd0] text-[#8c4f39]";
                    const amountClass = isBuy ? "text-[#005bc0]" : "text-[#8c4f39]";
                    const typeText = isBuy ? "申购" : "赎回";
                    const confirmed = isTransactionConfirmedInMarket(item);
                    return (
                      <article key={item.id} className="flex items-center gap-3 px-3 py-3">
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
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
