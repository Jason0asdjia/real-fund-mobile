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
};

export type SearchFundResult = {
  code: string;
  name: string;
  shortName?: string;
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

export type AppState = {
  funds: FundSnapshot[];
  holdings: Record<string, FundHolding>;
  transactions: Record<string, FundTransaction[]>;
  favorites: string[];
  refreshMs: number;
  searchHistory: string[];
  lastUpdatedAt: string | null;
};
