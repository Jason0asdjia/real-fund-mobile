import type { AppState, FundHolding, FundSnapshot, FundTransaction } from "@/lib/types";

export const APP_STATE_KEY = "real-fund-mobile:state";

export const defaultAppState: AppState = {
  funds: [],
  holdings: {},
  transactions: {},
  favorites: [],
  refreshMs: 60000,
  searchHistory: [],
  lastUpdatedAt: null,
};

const dedupeFundsByCode = (funds: AppState["funds"]) => {
  const seen = new Set<string>();
  return funds.filter((fund) => {
    const code = typeof fund?.code === "string" ? fund.code : "";
    if (!code || seen.has(code)) return false;
    seen.add(code);
    return true;
  });
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => value != null && typeof value === "object" && !Array.isArray(value);

const normalizeFund = (value: unknown): FundSnapshot | null => {
  if (!isPlainObject(value)) return null;
  const code = typeof value.code === "string" ? value.code.trim() : "";
  if (!code) return null;
  const name = typeof value.name === "string" && value.name.trim() ? value.name.trim() : code;
  return { ...(value as FundSnapshot), code, name };
};

const normalizeHolding = (value: unknown): FundHolding | null => {
  if (!isPlainObject(value)) return null;
  const share = value.share == null ? null : Number(value.share);
  const cost = value.cost == null ? null : Number(value.cost);
  const firstPurchaseDate = typeof value.firstPurchaseDate === "string" ? value.firstPurchaseDate : null;
  return {
    share: share != null && Number.isFinite(share) ? share : null,
    cost: cost != null && Number.isFinite(cost) ? cost : null,
    firstPurchaseDate,
  };
};

const normalizeTransaction = (value: unknown): FundTransaction | null => {
  if (!isPlainObject(value)) return null;
  const id = typeof value.id === "string" && value.id.trim() ? value.id : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const date = typeof value.date === "string" ? value.date : "";
  const type = value.type === "buy" || value.type === "sell" ? value.type : null;
  const share = Number(value.share);
  const price = Number(value.price);
  const fee = value.fee == null ? null : Number(value.fee);
  const note = typeof value.note === "string" ? value.note : null;
  if (!date || !type || !Number.isFinite(share) || !Number.isFinite(price)) return null;
  return {
    id,
    date,
    type,
    share,
    price,
    fee: fee != null && Number.isFinite(fee) ? fee : null,
    note,
  };
};

export const normalizeAppState = (value: unknown): AppState => {
  if (!isPlainObject(value)) return defaultAppState;

  const funds = Array.isArray(value.funds)
    ? dedupeFundsByCode(value.funds.map((item) => normalizeFund(item)).filter((item): item is FundSnapshot => item != null))
    : [];

  const holdings = isPlainObject(value.holdings)
    ? Object.entries(value.holdings).reduce<Record<string, FundHolding>>((acc, [code, holding]) => {
      const normalized = normalizeHolding(holding);
      if (!normalized) return acc;
      acc[code] = normalized;
      return acc;
    }, {})
    : {};

  const transactions = isPlainObject(value.transactions)
    ? Object.entries(value.transactions).reduce<Record<string, FundTransaction[]>>((acc, [code, items]) => {
      if (!Array.isArray(items)) return acc;
      const normalizedItems = items
        .map((item) => normalizeTransaction(item))
        .filter((item): item is FundTransaction => item != null)
        .sort((a, b) => b.date.localeCompare(a.date));
      acc[code] = normalizedItems;
      return acc;
    }, {})
    : {};

  const favorites = Array.isArray(value.favorites)
    ? value.favorites.filter((item): item is string => typeof item === "string")
    : [];

  const searchHistory = Array.isArray(value.searchHistory)
    ? value.searchHistory.filter((item): item is string => typeof item === "string").slice(0, 20)
    : [];

  const refreshMsCandidate = Number(value.refreshMs);
  const refreshMs = Number.isFinite(refreshMsCandidate) && refreshMsCandidate >= 5000 ? refreshMsCandidate : defaultAppState.refreshMs;
  const lastUpdatedAt = typeof value.lastUpdatedAt === "string" ? value.lastUpdatedAt : null;

  return {
    ...defaultAppState,
    funds,
    holdings,
    transactions,
    favorites,
    refreshMs,
    searchHistory,
    lastUpdatedAt,
  };
};

export const loadAppState = (): AppState => {
  if (typeof window === "undefined") return defaultAppState;
  try {
    const raw = window.localStorage.getItem(APP_STATE_KEY);
    if (!raw) return defaultAppState;
    const parsed = JSON.parse(raw) as unknown;
    return normalizeAppState(parsed);
  } catch {
    return defaultAppState;
  }
};

export const saveAppState = (state: AppState) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore persistence failures (quota/private mode), keep runtime state alive
  }
};
