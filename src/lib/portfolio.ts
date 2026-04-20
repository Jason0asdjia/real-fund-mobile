import { isEstimateTimestampUsable, nowInMarket, toMarketDay, todayInMarket } from "@/lib/time";
import type { FundHolding, FundSnapshot, FundTransaction } from "@/lib/types";

export type HoldingMetrics = {
  amount: number;
  profitToday: number | null;
  profitTotal: number | null;
};

export type TransactionSummary = {
  netShare: number;
  costBasis: number;
  averageCost: number | null;
  realizedProfit: number;
  totalFees: number;
  totalBuyAmount: number;
  totalSellAmount: number;
};

const isLikelyTradingDayByDate = (day: ReturnType<typeof toMarketDay>) => {
  const weekday = day.day();
  return weekday !== 0 && weekday !== 6;
};

const addLikelyTradingDays = (baseDate: string, days: number) => {
  let cursor = toMarketDay(`${baseDate}T00:00:00`).startOf("day");
  let added = 0;
  while (added < days) {
    cursor = cursor.add(1, "day");
    if (isLikelyTradingDayByDate(cursor)) {
      added += 1;
    }
  }
  return cursor;
};

const isAfterCloseOrder = (note?: string | null) => (note || "").includes("15:00后");

export const getTransactionConfirmDateInMarket = (item: FundTransaction) => {
  const confirmOffset = isAfterCloseOrder(item.note) ? 2 : 1;
  return addLikelyTradingDays(item.date, confirmOffset);
};

export const isTransactionConfirmedInMarket = (item: FundTransaction) => {
  const confirmDate = getTransactionConfirmDateInMarket(item);
  const today = nowInMarket().startOf("day");
  return today.isSame(confirmDate, "day") || today.isAfter(confirmDate, "day");
};

export const applyConfirmedTransactionsToHolding = (holding: FundHolding | undefined, transactions: FundTransaction[] = []): FundHolding => {
  const initialShare = typeof holding?.share === "number" && Number.isFinite(holding.share) ? holding.share : 0;
  const initialCost = typeof holding?.cost === "number" && Number.isFinite(holding.cost) ? holding.cost : 0;
  let share = Math.max(initialShare, 0);
  let totalCost = share > 0 ? share * initialCost : 0;
  let firstPurchaseDate = holding?.firstPurchaseDate || null;

  const confirmed = transactions
    .filter((item) => isTransactionConfirmedInMarket(item))
    .slice()
    .sort((a, b) => {
      const dateCmp = `${a.date}`.localeCompare(`${b.date}`);
      if (dateCmp !== 0) return dateCmp;
      return `${a.id}`.localeCompare(`${b.id}`);
    });

  confirmed.forEach((item) => {
    const txShare = Number(item.share);
    const txPrice = Number(item.price);
    const txFee = Number(item.fee || 0);
    if (!Number.isFinite(txShare) || !Number.isFinite(txPrice) || txShare <= 0 || txPrice <= 0) return;

    if (item.type === "buy") {
      share += txShare;
      totalCost += txShare * txPrice + (Number.isFinite(txFee) ? txFee : 0);

      if (!firstPurchaseDate || toMarketDay(`${item.date}T00:00:00`).isBefore(toMarketDay(`${firstPurchaseDate}T00:00:00`), "day")) {
        firstPurchaseDate = item.date;
      }
      return;
    }

    if (share <= 0) return;
    const soldShare = Math.min(txShare, share);
    const avgCost = share > 0 ? totalCost / share : 0;
    share -= soldShare;
    totalCost -= soldShare * avgCost;

    if (share <= 1e-8) {
      share = 0;
      totalCost = 0;
      firstPurchaseDate = null;
    }
  });

  if (share <= 0) {
    return {
      share: null,
      cost: null,
      firstPurchaseDate: null,
    };
  }

  return {
    share,
    cost: totalCost / share,
    firstPurchaseDate,
  };
};

export const getHoldingMetrics = (fund: FundSnapshot, holding?: FundHolding): HoldingMetrics | null => {
  if (!holding || typeof holding.share !== "number") return null;

  const share = Number(holding.share);
  const cost = holding.cost == null ? null : Number(holding.cost);
  if (!Number.isFinite(share) || share <= 0) return null;

  const today = todayInMarket();
  const hasTodayData = fund.jzrq === today;
  const hasTodayValuation = isEstimateTimestampUsable(fund.gztime);
  const canUseEstimate = !hasTodayData && hasTodayValuation && Number.isFinite(Number(fund.gsz));
  const currentNav = canUseEstimate
    ? Number(fund.gsz)
    : Number.isFinite(Number(fund.dwjz))
      ? Number(fund.dwjz)
      : Number(fund.gsz);

  if (!Number.isFinite(currentNav) || currentNav <= 0) return null;

  let profitToday: number | null = null;
  const lastNav = Number(fund.lastNav);
  if (hasTodayData || hasTodayValuation || canUseEstimate || (Number.isFinite(lastNav) && lastNav > 0)) {
    if (Number.isFinite(lastNav) && lastNav > 0) {
      profitToday = (currentNav - lastNav) * share;
    } else {
      const changeRate = canUseEstimate ? Number(fund.gszzl) : Number(fund.zzl ?? fund.gszzl);
      if (Number.isFinite(changeRate)) {
        const amount = share * currentNav;
        profitToday = amount - amount / (1 + changeRate / 100);
      }
    }
  }

  return {
    amount: share * currentNav,
    profitToday,
    profitTotal: Number.isFinite(cost) ? (currentNav - Number(cost)) * share : null,
  };
};

export const summarizeTransactions = (transactions: FundTransaction[]): TransactionSummary => {
  const ordered = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  let netShare = 0;
  let costBasis = 0;
  let realizedProfit = 0;
  let totalFees = 0;
  let totalBuyAmount = 0;
  let totalSellAmount = 0;

  ordered.forEach((item) => {
    const share = Number(item.share);
    const price = Number(item.price);
    const fee = Number(item.fee || 0);
    if (!Number.isFinite(share) || !Number.isFinite(price) || share <= 0 || price <= 0) return;

    totalFees += fee;

    if (item.type === "buy") {
      netShare += share;
      costBasis += share * price + fee;
      totalBuyAmount += share * price;
      return;
    }

    const avgCost = netShare > 0 ? costBasis / netShare : 0;
    const sellShare = Math.min(share, Math.max(netShare, 0));
    realizedProfit += sellShare * price - fee - sellShare * avgCost;
    totalSellAmount += sellShare * price;
    netShare -= sellShare;
    costBasis -= sellShare * avgCost;
  });

  return {
    netShare,
    costBasis,
    averageCost: netShare > 0 ? costBasis / netShare : null,
    realizedProfit,
    totalFees,
    totalBuyAmount,
    totalSellAmount,
  };
};

export const formatCurrency = (value?: number | null) => {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

export const formatPercent = (value?: number | null) => {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

export const formatSignedCurrency = (value?: number | null) => {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatCurrency(Math.abs(value))}`;
};
