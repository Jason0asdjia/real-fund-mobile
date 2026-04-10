import { nowInMarket } from "@/lib/time";
import type { AppState, AppSyncState, FundHolding, FundSnapshot, FundTransaction } from "@/lib/types";

export const APP_STATE_KEY = "real-fund-mobile:state";
export const APP_DEVICE_ID_KEY = "real-fund-mobile:device-id";

export const createDefaultSyncState = (deviceId = ""): AppSyncState => ({
  dataVersion: 1,
  lastSyncedVersion: 0,
  updatedAt: null,
  lastSyncedAt: null,
  deviceId,
});

export const defaultAppState: AppState = {
  funds: [],
  holdings: {},
  transactions: {},
  favorites: [],
  refreshMs: 60000,
  searchHistory: [],
  lastUpdatedAt: null,
  sync: createDefaultSyncState(),
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

const normalizeSyncState = (value: unknown, fallbackDeviceId: string): AppSyncState => {
  if (!isPlainObject(value)) return createDefaultSyncState(fallbackDeviceId);

  const dataVersion = Number(value.dataVersion);
  const lastSyncedVersion = Number(value.lastSyncedVersion);
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : null;
  const lastSyncedAt = typeof value.lastSyncedAt === "string" ? value.lastSyncedAt : null;
  const deviceId = typeof value.deviceId === "string" && value.deviceId.trim() ? value.deviceId : fallbackDeviceId;

  return {
    dataVersion: Number.isFinite(dataVersion) && dataVersion >= 1 ? Math.floor(dataVersion) : 1,
    lastSyncedVersion: Number.isFinite(lastSyncedVersion) && lastSyncedVersion >= 0 ? Math.floor(lastSyncedVersion) : 0,
    updatedAt,
    lastSyncedAt,
    deviceId,
  };
};

export const ensureDeviceId = () => {
  if (typeof window === "undefined") return "";

  try {
    const existing = window.localStorage.getItem(APP_DEVICE_ID_KEY);
    if (existing && existing.trim()) return existing;

    const created = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(APP_DEVICE_ID_KEY, created);
    return created;
  } catch {
    return "";
  }
};

const buildStateContentForHash = (state: AppState) => ({
  funds: state.funds.map((fund) => ({ code: fund.code, name: fund.name || fund.code })),
  holdings: state.holdings,
  transactions: state.transactions,
  favorites: state.favorites,
  refreshMs: state.refreshMs,
  searchHistory: state.searchHistory,
});

export const computeAppStateContentHash = (state: AppState) => JSON.stringify(buildStateContentForHash(state));

export const finalizeAppStateSync = (state: AppState, deviceId = ensureDeviceId()): AppState => ({
  ...state,
  sync: normalizeSyncState(state.sync, deviceId),
});

export const bumpAppStateVersion = (state: AppState, deviceId = ensureDeviceId()): AppState => {
  const normalized = finalizeAppStateSync(state, deviceId);
  return {
    ...normalized,
    sync: {
      ...normalized.sync,
      dataVersion: Math.max(normalized.sync.dataVersion, normalized.sync.lastSyncedVersion, 0) + 1,
      updatedAt: nowInMarket().format("YYYY-MM-DD HH:mm:ss"),
      deviceId,
    },
  };
};

export const markAppStateSynced = (state: AppState, syncedVersion: number, syncedAt = nowInMarket().format("YYYY-MM-DD HH:mm:ss"), deviceId = ensureDeviceId()): AppState => {
  const normalized = finalizeAppStateSync(state, deviceId);
  return {
    ...normalized,
    sync: {
      ...normalized.sync,
      dataVersion: Math.max(normalized.sync.dataVersion, syncedVersion),
      lastSyncedVersion: Math.max(normalized.sync.lastSyncedVersion, syncedVersion),
      lastSyncedAt: syncedAt,
      updatedAt: normalized.sync.updatedAt ?? syncedAt,
      deviceId,
    },
  };
};

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
  const fallbackDeviceId = ensureDeviceId();
  if (!isPlainObject(value)) return finalizeAppStateSync(defaultAppState, fallbackDeviceId);

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
  const baseState = {
    ...defaultAppState,
    funds,
    holdings,
    transactions,
    favorites,
    refreshMs,
    searchHistory,
    lastUpdatedAt,
    sync: normalizeSyncState(value.sync, fallbackDeviceId),
  } satisfies AppState;

  return finalizeAppStateSync(baseState, fallbackDeviceId);
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
