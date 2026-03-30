import { hasEstimateWindowStarted, todayInMarket } from "@/lib/time";
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

export const getHoldingMetrics = (fund: FundSnapshot, holding?: FundHolding): HoldingMetrics | null => {
  if (!holding || typeof holding.share !== "number") return null;

  const share = Number(holding.share);
  const cost = holding.cost == null ? null : Number(holding.cost);
  if (!Number.isFinite(share) || share <= 0) return null;

  const today = todayInMarket();
  const hasTodayData = fund.jzrq === today;
  const hasTodayValuation = typeof fund.gztime === "string" && fund.gztime.startsWith(today);
  const useValuation = hasEstimateWindowStarted() && !hasTodayData;

  const currentNav = useValuation
    ? Number.isFinite(Number(fund.gsz)) ? Number(fund.gsz) : Number(fund.dwjz)
    : Number(fund.dwjz);

  if (!Number.isFinite(currentNav) || currentNav <= 0) return null;

  let profitToday: number | null = null;
  if (hasTodayData || hasTodayValuation || useValuation) {
    const lastNav = Number(fund.lastNav);
    if (Number.isFinite(lastNav) && lastNav > 0 && !useValuation) {
      profitToday = (currentNav - lastNav) * share;
    } else {
      const changeRate = useValuation ? Number(fund.gszzl) : Number(fund.zzl ?? fund.gszzl);
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
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatCurrency(Math.abs(value))}`;
};
