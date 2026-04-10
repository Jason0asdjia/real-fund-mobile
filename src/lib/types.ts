export type FundHolding = {
  share: number | null;
  cost: number | null;
  firstPurchaseDate?: string | null;
};

export type FundSnapshot = {
  code: string;
  name: string;
  dwjz?: string | null;
  gsz?: number | null;
  gztime?: string | null;
  jzrq?: string | null;
  gszzl?: number | null;
  zzl?: number | null;
  lastNav?: string | null;
  noValuation?: boolean;
  source?: "eastmoney" | "tencent" | "sina" | "danjuan" | "fallback";
  officialSource?: "eastmoney" | "tencent" | "sina" | "fallback";
  estimateSource?: "eastmoney" | "tencent" | "sina" | "fallback";
  quoteStatus?: "estimated" | "official";
  officialConfirmedAt?: string | null;
  officialConfirmedForDate?: string | null;
  holdings?: FundHoldingStock[];
  holdingsReportDate?: string | null;
  holdingsIsLastQuarter?: boolean;
  archiveStatus?: "pending" | "ready" | "empty";
  fundType?: string | null;
  riskLevel?: string | null;
  fundManager?: string | null;
  fundCompany?: string | null;
  fundScale?: string | null;
  trackingTarget?: string | null;
  inceptionDate?: string | null;
};

export type SearchFundResult = {
  code: string;
  resolvedCode?: string;
  name: string;
  shortName?: string;
  category?: string;
  fundType?: string;
  spell?: string;
};

export type FundHoldingStock = {
  code: string;
  name: string;
  weight: string;
  change?: number | null;
};

export type ValuationPoint = {
  time: string;
  value: number;
  date: string;
};

export type FundTransactionType = "buy" | "sell";

export type FundTransaction = {
  id: string;
  date: string;
  type: FundTransactionType;
  share: number;
  price: number;
  fee?: number | null;
  note?: string | null;
};

export type AppSyncState = {
  dataVersion: number;
  lastSyncedVersion: number;
  updatedAt: string | null;
  lastSyncedAt: string | null;
  deviceId: string;
};

export type AppState = {
  funds: FundSnapshot[];
  holdings: Record<string, FundHolding>;
  transactions: Record<string, FundTransaction[]>;
  favorites: string[];
  refreshMs: number;
  searchHistory: string[];
  lastUpdatedAt: string | null;
  sync: AppSyncState;
};
