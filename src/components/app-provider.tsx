"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { buildCloudPayloadFromState, createCloudPayload, fetchCloudUserData, fetchCloudUserMeta, hasMeaningfulCloudData, hydrateAppStateFromCloudPayload, mergeCloudPayloads, upsertCloudUserData } from "@/lib/cloud-user-data";
import { fetchFundArchiveData, fetchFundBaseData, fetchFundHistoricalNavSeries, searchFunds } from "@/lib/fund-api";
import { applyConfirmedTransactionsToHolding, getTransactionConfirmDateInMarket, isTransactionConfirmedInMarket } from "@/lib/portfolio";
import { APP_STATE_KEY, bumpAppStateVersion, computeAppStateContentHash, defaultAppState, loadAppState, markAppStateSynced, normalizeAppState, saveAppState, syncDataVersionFloor } from "@/lib/storage";
import { formatLocalTimestamp, isEstimateTimestampUsable, MARKET_OPEN_MINUTES, nowInMarket } from "@/lib/time";
import type { AppState, FundHolding, FundSnapshot, FundTransaction, SearchFundResult, ValuationPoint } from "@/lib/types";
import { IMPORTANT_UI_PREFERENCE_KEYS, applyImportantPreferences, readImportantPreferences } from "@/lib/user-preferences";
import { clearValuationSeries, getAllValuationSeries, normalizeValuationSeries, recordValuation, setAllValuationSeries, VALUATION_TIMESERIES_KEY } from "@/lib/valuation-timeseries";
import { buildDemoSeed } from "@/lib/demo-data";

type PushCloudConfigUploadOnlyResult =
  | { ok: true; status: "uploaded" | "synced" | "needs_user_resolution" | "cloud_newer"; message: string }
  | { ok: false; status: "failed"; message: string };

type AppContextValue = {
  state: AppState;
  hydrated: boolean;
  refreshing: boolean;
  seeding: boolean;
  error: string;
  passiveRefreshAt: number | null;
  valuationSeries: Record<string, ValuationPoint[]>;
  search: (keyword: string) => Promise<SearchFundResult[]>;
  recordSearchHistory: (keyword: string) => void;
  addFund: (input: SearchFundResult) => Promise<FundSnapshot | null>;
  refreshFunds: () => Promise<void>;
  removeFund: (code: string) => void;
  clearHolding: (code: string) => void;
  updateHolding: (code: string, next: FundHolding) => void;
  addTransaction: (code: string, next: Omit<FundTransaction, "id">) => void;
  updateTransaction: (code: string, id: string, next: Omit<FundTransaction, "id">) => void;
  removeTransaction: (code: string, id: string) => void;
  toggleFavorite: (code: string) => void;
  setRefreshMs: (value: number) => void;
  clearSearchHistory: () => void;
  refreshFromLocalState: () => void;
  clearAll: () => void;
  clearLocalOnly: () => void;
  seedDemoData: () => Promise<void>;
  importBackupData: (payload: { appState: unknown; valuationSeries?: unknown }) => { ok: boolean; message: string };
  pushCloudConfig: () => Promise<{ ok: boolean; message: string }>;
  pushCloudConfigUploadOnly: () => Promise<PushCloudConfigUploadOnlyResult>;
  pullCloudConfig: () => Promise<{ ok: boolean; message: string }>;
  conflictResolution: {
    open: boolean;
    localSummary: { funds: number; holdings: number; transactions: number; searchHistory: number };
    cloudSummary: { funds: number; holdings: number; transactions: number; searchHistory: number };
    resolving: boolean;
  };
  cloudSyncStatus: {
    open: boolean;
    title: string;
    message: string;
  };
  resolveDataConflict: (strategy: "keep_local" | "keep_cloud" | "merge") => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);
const LOCAL_OWNER_USER_ID_KEY = "real-fund-mobile:owner-user-id";
const PENDING_CLOUD_SYNC_KEY = "real-fund-mobile:pending-cloud-sync";
const OFFICIAL_NAV_HISTORY_CACHE_KEY = "real-fund-mobile:official-nav-history";
const MAX_ARCHIVE_PREFETCH_CONCURRENCY = 3;
const MAX_HISTORY_PREFETCH_CONCURRENCY = 2;

const readPendingCloudSync = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_CLOUD_SYNC_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: unknown; payloadSignature?: unknown; updatedAt?: unknown };
    if (typeof parsed?.userId !== "string" || !parsed.userId) return null;
    return {
      userId: parsed.userId,
      payloadSignature: typeof parsed.payloadSignature === "string" ? parsed.payloadSignature : "",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch {
    return null;
  }
};

const markPendingCloudSync = (userId: string, payloadSignature: string) => {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.localStorage.setItem(PENDING_CLOUD_SYNC_KEY, JSON.stringify({
      userId,
      payloadSignature,
      updatedAt: nowInMarket().format("YYYY-MM-DD HH:mm:ss"),
    }));
  } catch {
    // ignore storage failure
  }
};

const MANUAL_SYNC_UPLOAD_AT_KEY = "real-fund-mobile:manual-sync-upload-at";

const markManualSyncUploadAt = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MANUAL_SYNC_UPLOAD_AT_KEY, formatLocalTimestamp());
  } catch {
    // ignore
  }
};

const clearPendingCloudSync = (userId?: string) => {
  if (typeof window === "undefined") return;
  try {
    if (!userId) {
      window.localStorage.removeItem(PENDING_CLOUD_SYNC_KEY);
      return;
    }
    const current = readPendingCloudSync();
    if (!current || current.userId === userId) {
      window.localStorage.removeItem(PENDING_CLOUD_SYNC_KEY);
    }
  } catch {
    // ignore storage failure
  }
};

const setLocalOwnerUser = (value: string | null) => {
  if (typeof window === "undefined") return;
  if (value) {
    window.localStorage.setItem(LOCAL_OWNER_USER_ID_KEY, value);
    return;
  }
  window.localStorage.removeItem(LOCAL_OWNER_USER_ID_KEY);
};

const clearAppManagedLocalStorage = () => {
  if (typeof window === "undefined") return;
  const keys = [
    APP_STATE_KEY,
    PENDING_CLOUD_SYNC_KEY,
    VALUATION_TIMESERIES_KEY,
    OFFICIAL_NAV_HISTORY_CACHE_KEY,
    LOCAL_OWNER_USER_ID_KEY,
    ...IMPORTANT_UI_PREFERENCE_KEYS,
  ];
  keys.forEach((key) => window.localStorage.removeItem(key));
};

const getStateSummary = (state: AppState) => ({
  funds: state.funds.length,
  holdings: Object.keys(state.holdings || {}).length,
  transactions: Object.values(state.transactions || {}).reduce((acc, items) => acc + (Array.isArray(items) ? items.length : 0), 0),
  searchHistory: state.searchHistory.length,
});

const needsArchiveBackfill = (fund: FundSnapshot) => {
  if (fund.archiveStatus === "ready" || fund.archiveStatus === "empty") return false;
  return !fund.holdingsReportDate && !fund.fundType && !fund.riskLevel && !fund.fundManager && !fund.fundCompany && !fund.fundScale && !fund.trackingTarget && !fund.inceptionDate;
};

const toFiniteNumber = (value: unknown) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const normalizeHoldingForMath = (holding?: FundHolding) => {
  const share = typeof holding?.share === "number" && Number.isFinite(holding.share) ? holding.share : 0;
  const cost = typeof holding?.cost === "number" && Number.isFinite(holding.cost) ? holding.cost : 0;
  const totalCost = share > 0 ? share * cost : 0;
  return {
    share: Math.max(share, 0),
    totalCost: Math.max(totalCost, 0),
    firstPurchaseDate: holding?.firstPurchaseDate || null,
  };
};

const addConfirmedTransactionToHolding = (holding: FundHolding | undefined, tx: FundTransaction) => {
  if (!isTransactionConfirmedInMarket(tx)) return holding || { share: null, cost: null, firstPurchaseDate: null };

  const txShare = Number(tx.share);
  const txPrice = Number(tx.price);
  const txFee = Number(tx.fee || 0);
  if (!Number.isFinite(txShare) || !Number.isFinite(txPrice) || txShare <= 0 || txPrice <= 0) {
    return holding || { share: null, cost: null, firstPurchaseDate: null };
  }

  const base = normalizeHoldingForMath(holding);
  const fee = Number.isFinite(txFee) ? txFee : 0;

  if (tx.type === "buy") {
    const nextShare = base.share + txShare;
    const nextTotalCost = base.totalCost + txShare * txPrice + fee;
    const firstPurchaseDate = base.firstPurchaseDate && base.firstPurchaseDate < tx.date ? base.firstPurchaseDate : tx.date;
    return {
      share: nextShare,
      cost: nextShare > 0 ? nextTotalCost / nextShare : null,
      firstPurchaseDate,
    };
  }

  if (base.share <= 0) {
    return {
      share: null,
      cost: null,
      firstPurchaseDate: null,
    };
  }

  const soldShare = Math.min(txShare, base.share);
  const avgCost = base.share > 0 ? base.totalCost / base.share : 0;
  const remainingShare = base.share - soldShare;
  const remainingCost = base.totalCost - soldShare * avgCost;

  return remainingShare > 1e-8
    ? {
        share: remainingShare,
        cost: remainingShare > 0 ? remainingCost / remainingShare : null,
        firstPurchaseDate: base.firstPurchaseDate,
      }
    : {
        share: null,
        cost: null,
        firstPurchaseDate: null,
      };
};

const rollbackConfirmedTransactionFromHolding = (
  holding: FundHolding | undefined,
  removed: FundTransaction,
  remainingTransactions: FundTransaction[],
) => {
  if (!removed.settledAt) {
    return holding || { share: null, cost: null, firstPurchaseDate: null };
  }

  const txShare = Number(removed.share);
  const txPrice = Number(removed.price);
  const txFee = Number(removed.fee || 0);
  const base = normalizeHoldingForMath(holding);
  const nextHoldings = holding || { share: null, cost: null, firstPurchaseDate: null };

  if (removed.type === "buy" && txShare > 0 && txPrice > 0 && base.share > 0) {
    const deductedCost = txShare * txPrice + (Number.isFinite(txFee) ? txFee : 0);
    const nextShare = Math.max(0, base.share - txShare);
    const nextTotalCost = Math.max(0, base.totalCost - deductedCost);

    if (nextShare > 1e-8) {
      const remainingConfirmedBuyDates = remainingTransactions
        .filter((item) => item.type === "buy" && isTransactionConfirmedInMarket(item))
        .map((item) => item.date)
        .sort((a, b) => a.localeCompare(b));

      const shouldRecomputeFirstDate = !base.firstPurchaseDate || base.firstPurchaseDate === removed.date;
      const nextFirstPurchaseDate = shouldRecomputeFirstDate ? remainingConfirmedBuyDates[0] || null : base.firstPurchaseDate;

      return {
        share: nextShare,
        cost: nextTotalCost / nextShare,
        firstPurchaseDate: nextFirstPurchaseDate,
      };
    }

    return {
      share: null,
      cost: null,
      firstPurchaseDate: null,
    };
  }

  if (removed.type === "sell" && txShare > 0) {
    if (base.share > 0 && base.totalCost > 0) {
      const currentCost = base.totalCost / base.share;
      const nextShare = base.share + txShare;
      const nextTotalCost = base.totalCost + txShare * currentCost;
      return {
        share: nextShare,
        cost: nextTotalCost / nextShare,
        firstPurchaseDate: base.firstPurchaseDate,
      };
    }
    return applyConfirmedTransactionsToHolding(undefined, remainingTransactions);
  }

  return nextHoldings;
};

const settleConfirmedTransactions = (current: AppState) => {
  const now = nowInMarket();
  let touched = false;
  const nextHoldings = { ...current.holdings };
  const nextTransactions = { ...current.transactions };

  Object.entries(current.transactions).forEach(([code, items]) => {
    const dueTransactions = items
      .filter((item) => !item.settledAt && isTransactionConfirmedInMarket(item))
      .slice()
      .sort((a, b) => {
        const dateCmp = `${a.date}`.localeCompare(`${b.date}`);
        if (dateCmp !== 0) return dateCmp;
        return `${a.id}`.localeCompare(`${b.id}`);
      });

    if (dueTransactions.length === 0) return;

    let nextHolding = nextHoldings[code];
    const settledIds = new Set(dueTransactions.map((item) => item.id));
    dueTransactions.forEach((item) => {
      nextHolding = addConfirmedTransactionToHolding(nextHolding, item);
    });

    nextHoldings[code] = nextHolding || { share: null, cost: null, firstPurchaseDate: null };
    nextTransactions[code] = items.map((item) => (
      settledIds.has(item.id)
        ? { ...item, settledAt: now.format("YYYY-MM-DD") }
        : item
    ));
    touched = true;
  });

  if (!touched) return current;

  return {
    ...current,
    holdings: nextHoldings,
    transactions: nextTransactions,
  };
};

const dedupeFundsByCode = (funds: FundSnapshot[]) => {
  const seen = new Set<string>();
  return funds.filter((fund) => {
    if (!fund?.code || seen.has(fund.code)) return false;
    seen.add(fund.code);
    return true;
  });
};

const mergeQuoteWithIntradayFallback = (previous: FundSnapshot, next: FundSnapshot): FundSnapshot => {
  const previousEstimateTime = previous.gztime;
  const previousEstimateIsToday = isEstimateTimestampUsable(previousEstimateTime);
  const previousEstimateNav = toFiniteNumber(previous.gsz);
  const previousEstimateGrowth = toFiniteNumber(previous.gszzl);

  const nextEstimateTime = next.gztime;
  const nextEstimateIsToday = isEstimateTimestampUsable(nextEstimateTime);
  const nextEstimateNav = toFiniteNumber(next.gsz);
  const nextEstimateGrowth = toFiniteNumber(next.gszzl);
  const nextEstimateMissing = !nextEstimateIsToday || nextEstimateNav == null || nextEstimateGrowth == null;

  const shouldKeepPreviousEstimate = previousEstimateIsToday && previousEstimateNav != null && previousEstimateGrowth != null && nextEstimateMissing;

  if (!shouldKeepPreviousEstimate) {
    return {
      ...next,
      zzl: toFiniteNumber(next.zzl) ?? toFiniteNumber(previous.zzl) ?? null,
      lastNav: toFiniteNumber(next.lastNav) != null ? next.lastNav : previous.lastNav ?? null,
    };
  }

  return {
    ...next,
    gsz: previousEstimateNav,
    gszzl: previousEstimateGrowth,
    gztime: previousEstimateTime,
    noValuation: false,
    source: previous.source || next.source,
    quoteStatus: "estimated",
    zzl: toFiniteNumber(next.zzl) ?? toFiniteNumber(previous.zzl) ?? null,
    lastNav: toFiniteNumber(next.lastNav) != null ? next.lastNav : previous.lastNav ?? null,
  };
};

const getInitialRuntimeSnapshot = () => {
  return {
    state: defaultAppState,
    valuationSeries: {} as Record<string, ValuationPoint[]>,
    hydrated: false,
  };
};

const hasRuntimeStateData = (state: AppState) => (
  state.funds.length > 0
  || Object.keys(state.holdings).length > 0
  || Object.values(state.transactions).some((items) => Array.isArray(items) && items.length > 0)
);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const isDevNoAuth = process.env.NODE_ENV !== "production";
  const { user, authLoading, isSigningOut } = useAuth();
  const userId = user?.id ?? null;
  const initialRuntimeRef = useRef<ReturnType<typeof getInitialRuntimeSnapshot>>();
  if (!initialRuntimeRef.current) {
    initialRuntimeRef.current = getInitialRuntimeSnapshot();
  }
  const initialRuntime = initialRuntimeRef.current;
  const [state, setState] = useState<AppState>(initialRuntime.state);
  const [hydrated, setHydrated] = useState(initialRuntime.hydrated);
  const [refreshing, setRefreshing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState("");
  const [cloudSyncRetryTick, setCloudSyncRetryTick] = useState(0);
  const [passiveRefreshAt, setPassiveRefreshAt] = useState<number | null>(null);
  const [valuationSeries, setValuationSeries] = useState<Record<string, ValuationPoint[]>>(initialRuntime.valuationSeries);
  const hydratedRef = useRef(initialRuntime.hydrated);
  const fundsRef = useRef<FundSnapshot[]>(initialRuntime.state.funds);
  const stateRef = useRef(initialRuntime.state);
  const valuationSeriesRef = useRef(initialRuntime.valuationSeries);
  const refreshingRef = useRef(false);
  const seedingRef = useRef(false);
  const didInitialRefreshRef = useRef(false);
  const refreshTokenRef = useRef(0);
  const skipNextInitialRefreshRef = useRef(false);
  const lastForegroundRefreshRef = useRef(0);
  const archiveBackfillInFlightRef = useRef(new Set<string>());
  const archiveBackfillAttemptRef = useRef<Record<string, number>>({});
  const historyPreheatInFlightRef = useRef(new Set<string>());
  const historyPreheatDoneRef = useRef(new Set<string>());
  const historyPreheatAttemptRef = useRef<Record<string, number>>({});
  const lastCloudPayloadRef = useRef("");
  const skipNextCloudSyncRef = useRef(false);
  const suppressEmptyCloudSyncRef = useRef(false);
  const [preferenceSignature, setPreferenceSignature] = useState("{}");
  const [conflictResolution, setConflictResolution] = useState<AppContextValue["conflictResolution"]>({
    open: false,
    localSummary: { funds: 0, holdings: 0, transactions: 0, searchHistory: 0 },
    cloudSummary: { funds: 0, holdings: 0, transactions: 0, searchHistory: 0 },
    resolving: false,
  });
  const [cloudSyncStatus, setCloudSyncStatus] = useState<AppContextValue["cloudSyncStatus"]>({
    open: false,
    title: "云端同步中",
    message: "正在同步云端数据...",
  });
  const cloudSyncInFlightRef = useRef(false);
  const pendingConflictRef = useRef<
    | {
        localState: AppState;
        cloudState: AppState;
        localPayload: ReturnType<typeof createCloudPayload>;
        cloudPayload: ReturnType<typeof createCloudPayload>;
      }
    | null
  >(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (hydratedRef.current) return;

    const localState = loadAppState();
    const localSeries = getAllValuationSeries();
    setState(localState);
    setValuationSeries(localSeries);
    fundsRef.current = localState.funds;
    stateRef.current = localState;
    valuationSeriesRef.current = localSeries;
    hydratedRef.current = true;
    setHydrated(true);
    setPreferenceSignature(JSON.stringify(readImportantPreferences()));
  }, []);

  const applyUserDataMutation = useCallback((updater: (current: AppState) => AppState) => {
    const next = bumpAppStateVersion(updater(stateRef.current));
    stateRef.current = next;
    setState(next);
    return next;
  }, []);

  const persistRuntimeState = useCallback((next: AppState) => {
    if (!hydratedRef.current || (!userId && !isDevNoAuth)) return;
    saveAppState(next);
  }, [isDevNoAuth, userId]);

  const showCloudSyncStatus = useCallback((title: string, message: string) => {
    setCloudSyncStatus({ open: true, title, message });
  }, []);

  const hideCloudSyncStatus = useCallback(() => {
    setCloudSyncStatus((current) => ({ ...current, open: false }));
  }, []);

  const withCloudSyncOverlay = useCallback(async <T,>(title: string, message: string, task: () => Promise<T>, options?: { silent?: boolean }) => {
    if (options?.silent) {
      return task();
    }
    showCloudSyncStatus(title, message);
    try {
      const result = await task();
      setCloudSyncStatus({
        open: true,
        title: "同步完成",
        message: "本地与云端数据已对齐",
      });
      return result;
    } finally {
      window.setTimeout(() => {
        setCloudSyncStatus((current) => (
          current.title === "同步完成"
            ? { ...current, open: false }
            : current
        ));
      }, 420);
    }
  }, [showCloudSyncStatus]);

  const applySyncedState = useCallback((nextState: AppState, syncedVersion: number, syncedAt?: string | null) => {
    const syncedState = markAppStateSynced(nextState, syncedVersion, syncedAt ?? undefined);
    setState(syncedState);
    fundsRef.current = syncedState.funds;
    stateRef.current = syncedState;
    return syncedState;
  }, []);

  const applyPayloadAsRuntime = (payload: ReturnType<typeof createCloudPayload>) => {
    const nextState = markAppStateSynced(hydrateAppStateFromCloudPayload(payload), payload.sync.dataVersion, payload.sync.updatedAt ?? undefined);
    applyImportantPreferences(payload.preferences);
    setPreferenceSignature(JSON.stringify(readImportantPreferences()));
    setState(nextState);
    fundsRef.current = nextState.funds;
    stateRef.current = nextState;
    lastCloudPayloadRef.current = JSON.stringify(payload);
  };

  const hydrateCloudFundsForView = useCallback(async (funds: FundSnapshot[]) => {
    if (funds.length === 0) return { funds, refreshedCount: 0 };

    const hydratedResults = await Promise.allSettled(
      funds.map((fund) => fetchFundBaseData(fund.code, { code: fund.code, name: fund.name || fund.code }, "interactive")),
    );

    let refreshedCount = 0;

    const nextFunds = hydratedResults.map((result, index) => {
      if (result.status !== "fulfilled") {
        return funds[index];
      }

      refreshedCount += 1;
      const nextFund = result.value;
      recordValuation(nextFund.code, { gsz: nextFund.gsz, gztime: nextFund.gztime });
      return nextFund;
    });

    return { funds: nextFunds, refreshedCount };
  }, []);

  useEffect(() => {
    hydratedRef.current = hydrated;
  }, [hydrated]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    valuationSeriesRef.current = valuationSeries;
  }, [valuationSeries]);

  useEffect(() => {
    if (authLoading) return;

    let active = true;

    const bootstrap = async () => {
      if (!userId) {
        if (!active) return;

        if (isDevNoAuth || !isSigningOut) {
          if (!hydratedRef.current) {
            const localState = loadAppState();
            const localSeries = getAllValuationSeries();
            setState(localState);
            setValuationSeries(localSeries);
            fundsRef.current = localState.funds;
            setPreferenceSignature(JSON.stringify(readImportantPreferences()));
            setHydrated(true);
          }
          return;
        }

        pendingConflictRef.current = null;
        setConflictResolution({
          open: false,
          localSummary: { funds: 0, holdings: 0, transactions: 0, searchHistory: 0 },
          cloudSummary: { funds: 0, holdings: 0, transactions: 0, searchHistory: 0 },
          resolving: false,
        });
        const signedOutState = markAppStateSynced(defaultAppState, defaultAppState.sync.lastSyncedVersion);
        setState(signedOutState);
        setValuationSeries({});
        fundsRef.current = [];
        stateRef.current = signedOutState;
        setHydrated(true);
        return;
      }

      const localState = loadAppState();
      const localSeries = getAllValuationSeries();
      const localPreferences = readImportantPreferences();
      const localOwnerUserId = typeof window !== "undefined" ? window.localStorage.getItem(LOCAL_OWNER_USER_ID_KEY) : null;
      const shouldUseLocalForBootstrap = !localOwnerUserId || localOwnerUserId === userId;
      const shouldKeepRuntimeState = !shouldUseLocalForBootstrap && hasRuntimeStateData(stateRef.current);
      const bootstrapState = shouldUseLocalForBootstrap
        ? localState
        : shouldKeepRuntimeState
          ? stateRef.current
          : defaultAppState;
      const bootstrapSeries = shouldUseLocalForBootstrap
        ? localSeries
        : shouldKeepRuntimeState
          ? valuationSeriesRef.current
          : {};
      const bootstrapVersion = bootstrapState.sync.dataVersion;
      const bootstrapPreferenceSignature = JSON.stringify(localPreferences);
      const hasRuntimeChangedSinceBootstrap = () => (
        stateRef.current.sync.dataVersion !== bootstrapVersion
        || JSON.stringify(readImportantPreferences()) !== bootstrapPreferenceSignature
      );
      const getLatestLocalPreferences = () => readImportantPreferences();
      const getLatestLocalPayload = () => createCloudPayload(stateRef.current, getLatestLocalPreferences());

      // Local-first bootstrap: keep route switches responsive on mobile,
      // then reconcile cloud payload in background.
      setState(bootstrapState);
      stateRef.current = bootstrapState;
      setValuationSeries(bootstrapSeries);
      fundsRef.current = bootstrapState.funds;
      setPreferenceSignature(JSON.stringify(localPreferences));
      setHydrated(true);

      try {
        const localPayload = getLatestLocalPayload();
        const cloudMeta = await fetchCloudUserMeta(userId);
        if (!active) return;
        if (cloudMeta) {
          syncDataVersionFloor(cloudMeta.dataVersion);
        }

        const latestLocalPayload = getLatestLocalPayload();

        if (!cloudMeta) {
          if (hasMeaningfulCloudData(latestLocalPayload)) {
            markPendingCloudSync(userId, JSON.stringify(latestLocalPayload));
            await withCloudSyncOverlay("上传本地数据", "云端暂无数据，正在上传当前设备内容...", () => upsertCloudUserData(userId, latestLocalPayload), { silent: true });
            if (!active) return;
            lastCloudPayloadRef.current = JSON.stringify(latestLocalPayload);
            applySyncedState(stateRef.current, latestLocalPayload.sync.dataVersion, latestLocalPayload.sync.updatedAt);
            clearPendingCloudSync(userId);
            markManualSyncUploadAt();
          }
          setLocalOwnerUser(userId);
          return;
        }

        const sameVersion = cloudMeta.dataVersion === latestLocalPayload.sync.dataVersion;
        const sameHash = cloudMeta.contentHash === latestLocalPayload.sync.contentHash;

        if (sameVersion && sameHash) {
          lastCloudPayloadRef.current = JSON.stringify(latestLocalPayload);
          applySyncedState(stateRef.current, latestLocalPayload.sync.dataVersion, cloudMeta.updatedAt);
          setLocalOwnerUser(userId);
          clearPendingCloudSync(userId);
          return;
        }

        if (latestLocalPayload.sync.dataVersion > cloudMeta.dataVersion || (sameVersion && !sameHash && cloudMeta.deviceId === latestLocalPayload.sync.deviceId)) {
          markPendingCloudSync(userId, JSON.stringify(latestLocalPayload));
          await withCloudSyncOverlay("上传本地数据", "本地数据版本更新，正在同步到云端...", () => upsertCloudUserData(userId, latestLocalPayload), { silent: true });
          if (!active) return;
          lastCloudPayloadRef.current = JSON.stringify(latestLocalPayload);
          applySyncedState(stateRef.current, latestLocalPayload.sync.dataVersion, latestLocalPayload.sync.updatedAt);
          setLocalOwnerUser(userId);
          clearPendingCloudSync(userId);
          markManualSyncUploadAt();
          return;
        }

        const cloud = await withCloudSyncOverlay("拉取云端数据", "云端数据较新，正在获取最新配置...", () => fetchCloudUserData(userId), { silent: true });
        if (!active) return;
        if (cloud) {
          const cloudState = hydrateAppStateFromCloudPayload(cloud);
          const { funds: cloudFunds, refreshedCount } = await hydrateCloudFundsForView(cloudState.funds);
          const cloudStateForRuntime = {
            ...cloudState,
            funds: cloudFunds,
            lastUpdatedAt: refreshedCount > 0 ? nowInMarket().format("YYYY-MM-DD HH:mm:ss") : cloudState.lastUpdatedAt,
          };
          const cloudPayload = createCloudPayload(cloudStateForRuntime, cloud.preferences);
          const latestRuntimeState = stateRef.current;
          const latestRuntimePayload = getLatestLocalPayload();
          const shouldAskConflict = hasMeaningfulCloudData(latestRuntimePayload) && hasMeaningfulCloudData(cloudPayload)
            && localOwnerUserId !== userId
            && JSON.stringify(latestRuntimePayload) !== JSON.stringify(cloudPayload);

          if (shouldAskConflict) {
            pendingConflictRef.current = {
              localState: latestRuntimeState,
              cloudState: cloudStateForRuntime,
              localPayload: latestRuntimePayload,
              cloudPayload: createCloudPayload(cloudStateForRuntime, cloud.preferences),
            };
            setConflictResolution({
              open: true,
              localSummary: getStateSummary(latestRuntimeState),
              cloudSummary: getStateSummary(cloudStateForRuntime),
              resolving: false,
            });
            setPreferenceSignature(JSON.stringify(getLatestLocalPreferences()));
          } else {
            const mergedPayload = sameVersion && !sameHash
              ? mergeCloudPayloads(latestRuntimePayload, cloudPayload)
              : cloudPayload;
            skipNextInitialRefreshRef.current = refreshedCount > 0;
            if (!hasRuntimeChangedSinceBootstrap()) {
              applyPayloadAsRuntime(mergedPayload);
            }
            if (mergedPayload.sync.dataVersion > cloudPayload.sync.dataVersion || mergedPayload.sync.contentHash !== cloudPayload.sync.contentHash) {
              markPendingCloudSync(userId, JSON.stringify(mergedPayload));
              await withCloudSyncOverlay("写回合并结果", "已合并本地与云端差异，正在保存...", () => upsertCloudUserData(userId, mergedPayload), { silent: true });
              if (!active) return;
            }
            lastCloudPayloadRef.current = JSON.stringify(mergedPayload);
            setLocalOwnerUser(userId);
            clearPendingCloudSync(userId);
            markManualSyncUploadAt();
          }

          setValuationSeries(getAllValuationSeries());
          return;
        }

        const latestBootPayload = getLatestLocalPayload();
        markPendingCloudSync(userId, JSON.stringify(latestBootPayload));
        await withCloudSyncOverlay("上传本地数据", "正在将当前本地配置写入云端...", () => upsertCloudUserData(userId, latestBootPayload), { silent: true });
        if (!active) return;

        lastCloudPayloadRef.current = JSON.stringify(latestBootPayload);
        setPreferenceSignature(JSON.stringify(readImportantPreferences()));
        applySyncedState(stateRef.current, latestBootPayload.sync.dataVersion, latestBootPayload.sync.updatedAt);
        if (!hasRuntimeChangedSinceBootstrap()) {
          setValuationSeries(bootstrapSeries);
        }
        setLocalOwnerUser(userId);
        clearPendingCloudSync(userId);
        markManualSyncUploadAt();
      } catch {
        if (!active) return;
        if (!hasRuntimeChangedSinceBootstrap()) {
          setState(bootstrapState);
          stateRef.current = bootstrapState;
          setValuationSeries(bootstrapSeries);
          fundsRef.current = bootstrapState.funds;
        }
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, [applySyncedState, authLoading, hideCloudSyncStatus, hydrateCloudFundsForView, isDevNoAuth, isSigningOut, showCloudSyncStatus, userId, withCloudSyncOverlay]);

  useEffect(() => {
    fundsRef.current = state.funds;
  }, [state.funds]);

  useEffect(() => {
    const deduped = dedupeFundsByCode(state.funds);
    if (deduped.length === state.funds.length) return;
    setState((current) => ({
      ...current,
      funds: dedupeFundsByCode(current.funds),
    }));
  }, [state.funds]);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    seedingRef.current = seeding;
  }, [seeding]);

  useEffect(() => {
    if (!hydrated || (!userId && !isDevNoAuth)) return;
    saveAppState(state);
  }, [hydrated, isDevNoAuth, state, userId]);

  useEffect(() => {
    if (!hydrated || !userId || typeof window === "undefined") return;

    const capture = () => JSON.stringify(readImportantPreferences());
    setPreferenceSignature(capture());

    let prevSignature = "";
    const timer = window.setInterval(() => {
      const next = capture();
      if (next !== prevSignature) {
        prevSignature = next;
        setPreferenceSignature(next);
      }
    }, 1500);

    return () => window.clearInterval(timer);
  }, [hydrated, userId]);

  useEffect(() => {
    if (!hydrated || !userId || typeof window === "undefined") return;

    const triggerRetryIfPending = () => {
      const pending = readPendingCloudSync();
      if (pending?.userId === userId) {
        setCloudSyncRetryTick((current) => current + 1);
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        triggerRetryIfPending();
      }
    };

    window.addEventListener("online", triggerRetryIfPending);
    window.addEventListener("focus", triggerRetryIfPending);
    window.addEventListener("pageshow", triggerRetryIfPending);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("online", triggerRetryIfPending);
      window.removeEventListener("focus", triggerRetryIfPending);
      window.removeEventListener("pageshow", triggerRetryIfPending);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [hydrated, userId]);

  useEffect(() => {
    if (!hydrated || !userId || conflictResolution.open) return;

    if (skipNextCloudSyncRef.current) {
      skipNextCloudSyncRef.current = false;
      return;
    }

    if (cloudSyncInFlightRef.current) return;

    const payload = buildCloudPayloadFromState(state);
    const payloadVersion = payload.sync.dataVersion;
    const payloadContentHash = payload.sync.contentHash;
    const getLatestRuntimePayload = () => buildCloudPayloadFromState(stateRef.current);
    const isStalePayload = () => {
      const latestPayload = getLatestRuntimePayload();
      return latestPayload.sync.dataVersion !== payloadVersion || latestPayload.sync.contentHash !== payloadContentHash;
    };
    const isMeaningfulPayload = hasMeaningfulCloudData(payload);
    if (suppressEmptyCloudSyncRef.current && !isMeaningfulPayload) {
      return;
    }
    if (isMeaningfulPayload) {
      suppressEmptyCloudSyncRef.current = false;
    }

    const signature = JSON.stringify(payload);
    const pendingSync = readPendingCloudSync();
    const hasPendingForCurrentUser = pendingSync?.userId === userId;
    if (!hasPendingForCurrentUser && payload.sync.dataVersion <= state.sync.lastSyncedVersion && signature === lastCloudPayloadRef.current) return;

    markPendingCloudSync(userId, signature);

    cloudSyncInFlightRef.current = true;

    const timer = window.setTimeout(() => {
      void fetchCloudUserMeta(userId)
        .then(async (cloudMeta) => {
          if (isStalePayload()) return;
          if (cloudMeta) {
            syncDataVersionFloor(cloudMeta.dataVersion);
          }
          if (!cloudMeta || cloudMeta.dataVersion < payload.sync.dataVersion) {
            if (isStalePayload()) return;
            await withCloudSyncOverlay("上传本地数据", "检测到本地改动，正在同步到云端...", () => upsertCloudUserData(userId, payload), { silent: true });
            if (isStalePayload()) return;
            lastCloudPayloadRef.current = signature;
            setLocalOwnerUser(userId);
            setState((current) => (
              current.sync.dataVersion === payload.sync.dataVersion
                ? markAppStateSynced(current, payload.sync.dataVersion, payload.sync.updatedAt ?? undefined)
                : current
            ));
            clearPendingCloudSync(userId);
            markManualSyncUploadAt();
            return;
          }

          if (cloudMeta.dataVersion === payload.sync.dataVersion && cloudMeta.contentHash === payload.sync.contentHash) {
            if (isStalePayload()) return;
            lastCloudPayloadRef.current = signature;
            setLocalOwnerUser(userId);
            setState((current) => (
              current.sync.dataVersion === payload.sync.dataVersion
                ? markAppStateSynced(current, payload.sync.dataVersion, cloudMeta.updatedAt ?? undefined)
                : current
            ));
            clearPendingCloudSync(userId);
            return;
          }

          const cloud = await fetchCloudUserData(userId);
          if (isStalePayload()) return;
          if (!cloud) {
            await withCloudSyncOverlay("上传本地数据", "云端记录缺失，正在补写当前数据...", () => upsertCloudUserData(userId, payload), { silent: true });
            if (isStalePayload()) return;
            lastCloudPayloadRef.current = signature;
            setLocalOwnerUser(userId);
            setState((current) => (
              current.sync.dataVersion === payload.sync.dataVersion
                ? markAppStateSynced(current, payload.sync.dataVersion, payload.sync.updatedAt ?? undefined)
                : current
            ));
            clearPendingCloudSync(userId);
            markManualSyncUploadAt();
            return;
          }

          if (isStalePayload()) return;
          const mergedPayload = mergeCloudPayloads(getLatestRuntimePayload(), cloud);
          applyPayloadAsRuntime(mergedPayload);
          await withCloudSyncOverlay("写回合并结果", "发现云端差异，正在合并并保存...", () => upsertCloudUserData(userId, mergedPayload), { silent: true });
          if (isStalePayload()) return;
          lastCloudPayloadRef.current = JSON.stringify(mergedPayload);
          setLocalOwnerUser(userId);
          clearPendingCloudSync(userId);
          markManualSyncUploadAt();
        })
        .catch(() => {
          // keep local runtime state; sync can retry on next state/preference change
        })
        .finally(() => {
          cloudSyncInFlightRef.current = false;
        });
    }, 420);

    return () => window.clearTimeout(timer);
  }, [cloudSyncRetryTick, conflictResolution.open, hydrated, preferenceSignature, state, userId, withCloudSyncOverlay]);

  const resolveDataConflict = useCallback(async (strategy: "keep_local" | "keep_cloud" | "merge") => {
    if (!userId || !pendingConflictRef.current) return;

    setConflictResolution((current) => ({
      ...current,
      resolving: true,
    }));

    const { localPayload, cloudPayload } = pendingConflictRef.current;
    const resolvedPayload = strategy === "keep_local"
      ? localPayload
      : strategy === "keep_cloud"
        ? cloudPayload
        : mergeCloudPayloads(localPayload, cloudPayload);

    try {
      applyPayloadAsRuntime(resolvedPayload);
      await withCloudSyncOverlay("写回云端数据", "正在按你的选择更新云端内容...", () => upsertCloudUserData(userId, resolvedPayload));
      setState((current) => markAppStateSynced(current, resolvedPayload.sync.dataVersion, resolvedPayload.sync.updatedAt ?? undefined));
      setLocalOwnerUser(userId);
      clearPendingCloudSync(userId);
      markManualSyncUploadAt();
      pendingConflictRef.current = null;
      setConflictResolution({
        open: false,
        localSummary: { funds: 0, holdings: 0, transactions: 0, searchHistory: 0 },
        cloudSummary: { funds: 0, holdings: 0, transactions: 0, searchHistory: 0 },
        resolving: false,
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "冲突处理失败，请重试");
      setConflictResolution((current) => ({
        ...current,
        resolving: false,
      }));
    }
  }, [userId, withCloudSyncOverlay]);

  const pushCloudConfig = useCallback(async () => {
    if (!userId) {
      return { ok: false, message: "请先登录后再上传" };
    }

    try {
      suppressEmptyCloudSyncRef.current = false;
      const localPayload = buildCloudPayloadFromState(state);
      const cloudMeta = await fetchCloudUserMeta(userId);
      if (cloudMeta) {
        syncDataVersionFloor(cloudMeta.dataVersion);
      }

      if (!cloudMeta || cloudMeta.dataVersion < localPayload.sync.dataVersion) {
        await withCloudSyncOverlay("上传当前配置", "正在把当前设备配置上传到云端...", () => upsertCloudUserData(userId, localPayload));
        lastCloudPayloadRef.current = JSON.stringify(localPayload);
        setState((current) => markAppStateSynced(current, localPayload.sync.dataVersion, localPayload.sync.updatedAt ?? undefined));
        setLocalOwnerUser(userId);
        clearPendingCloudSync(userId);
        markManualSyncUploadAt();
        return { ok: true, message: "已上传当前配置到云端" };
      }

      if (cloudMeta.dataVersion === localPayload.sync.dataVersion && cloudMeta.contentHash === localPayload.sync.contentHash) {
        lastCloudPayloadRef.current = JSON.stringify(localPayload);
        setState((current) => markAppStateSynced(current, localPayload.sync.dataVersion, cloudMeta.updatedAt ?? undefined));
        setLocalOwnerUser(userId);
        clearPendingCloudSync(userId);
        return { ok: true, message: "云端已是当前最新配置" };
      }

      const cloud = await withCloudSyncOverlay("检查并合并版本", "云端版本较新，正在拉取并合并后上传...", () => fetchCloudUserData(userId));
      if (!cloud) {
        await withCloudSyncOverlay("上传当前配置", "云端记录缺失，正在补写当前设备配置...", () => upsertCloudUserData(userId, localPayload));
        lastCloudPayloadRef.current = JSON.stringify(localPayload);
        setState((current) => markAppStateSynced(current, localPayload.sync.dataVersion, localPayload.sync.updatedAt ?? undefined));
        setLocalOwnerUser(userId);
        clearPendingCloudSync(userId);
        markManualSyncUploadAt();
        return { ok: true, message: "已上传当前配置到云端" };
      }

      const mergedPayload = mergeCloudPayloads(localPayload, cloud);
      applyPayloadAsRuntime(mergedPayload);
      await withCloudSyncOverlay("写回合并结果", "已合并手动上传与云端差异，正在保存...", () => upsertCloudUserData(userId, mergedPayload));
      lastCloudPayloadRef.current = JSON.stringify(mergedPayload);
      setState((current) => markAppStateSynced(current, mergedPayload.sync.dataVersion, mergedPayload.sync.updatedAt ?? undefined));
      setLocalOwnerUser(userId);
      clearPendingCloudSync(userId);
      markManualSyncUploadAt();
      return { ok: true, message: "云端版本较新，已自动合并后上传" };
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "上传云端失败";
      setError(message);
      return { ok: false, message };
    }
  }, [state, userId, withCloudSyncOverlay]);

  const pushCloudConfigUploadOnly = useCallback(async () => {
    if (!userId) {
      return { ok: false, message: "请先登录后再上传", status: "failed" as const };
    }

    try {
      suppressEmptyCloudSyncRef.current = false;
      const localPayload = buildCloudPayloadFromState(state);
      const cloudMeta = await fetchCloudUserMeta(userId);
      if (cloudMeta) {
        syncDataVersionFloor(cloudMeta.dataVersion);
      }

      if (!cloudMeta || cloudMeta.dataVersion < localPayload.sync.dataVersion) {
        await withCloudSyncOverlay("上传当前配置", "正在把当前设备配置上传到云端...", () => upsertCloudUserData(userId, localPayload));
        lastCloudPayloadRef.current = JSON.stringify(localPayload);
        setState((current) => markAppStateSynced(current, localPayload.sync.dataVersion, localPayload.sync.updatedAt ?? undefined));
        setLocalOwnerUser(userId);
        clearPendingCloudSync(userId);
        return { ok: true, status: "uploaded" as const, message: "已上传当前配置到云端" };
      }

      if (cloudMeta.dataVersion === localPayload.sync.dataVersion && cloudMeta.contentHash === localPayload.sync.contentHash) {
        lastCloudPayloadRef.current = JSON.stringify(localPayload);
        setState((current) => markAppStateSynced(current, localPayload.sync.dataVersion, cloudMeta.updatedAt ?? undefined));
        setLocalOwnerUser(userId);
        clearPendingCloudSync(userId);
        return { ok: true, status: "synced" as const, message: "云端已是当前最新配置" };
      }

      if (cloudMeta.dataVersion === localPayload.sync.dataVersion && cloudMeta.contentHash !== localPayload.sync.contentHash) {
        return { ok: true, status: "needs_user_resolution" as const, message: "检测到云端有并发改动，请手动同步处理冲突" };
      }

      return { ok: true, status: "cloud_newer" as const, message: "云端版本更新，建议先拉取或手动合并" };
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "上传云端失败";
      setError(message);
      return { ok: false, message, status: "failed" as const };
    }
  }, [state, userId, withCloudSyncOverlay]);

  const pullCloudConfig = useCallback(async () => {
    if (!userId) {
      return { ok: false, message: "请先登录后再拉取" };
    }

    try {
      const cloud = await withCloudSyncOverlay("拉取云端配置", "正在从云端获取最新配置并写入本地...", () => fetchCloudUserData(userId));
      if (!cloud) {
        return { ok: false, message: "云端暂无可用配置" };
      }
      syncDataVersionFloor(cloud.sync.dataVersion);

      const cloudState = hydrateAppStateFromCloudPayload(cloud);
      const initialPayload = createCloudPayload(cloudState, cloud.preferences);
      applyPayloadAsRuntime(initialPayload);
      setValuationSeries(getAllValuationSeries());

      const { funds: cloudFunds } = await hydrateCloudFundsForView(cloudState.funds);
      setState((current) => markAppStateSynced({
        ...current,
        funds: cloudFunds,
      }, initialPayload.sync.dataVersion, initialPayload.sync.updatedAt ?? undefined));
      setValuationSeries(getAllValuationSeries());
      pendingConflictRef.current = null;
      setConflictResolution({
        open: false,
        localSummary: { funds: 0, holdings: 0, transactions: 0, searchHistory: 0 },
        cloudSummary: { funds: 0, holdings: 0, transactions: 0, searchHistory: 0 },
        resolving: false,
      });
      setLocalOwnerUser(userId);
      clearPendingCloudSync(userId);
      return { ok: true, message: "已从云端拉取配置" };
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "拉取云端配置失败";
      setError(message);
      return { ok: false, message };
    }
  }, [hydrateCloudFundsForView, userId, withCloudSyncOverlay]);

  const refreshFunds = useCallback(async () => {
    if (refreshingRef.current || fundsRef.current.length === 0) return;
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/discover")) return;

    const token = ++refreshTokenRef.current;
    refreshingRef.current = true;
    setRefreshing(true);
    setError("");

    try {
      const refreshedResults = await Promise.allSettled(
        fundsRef.current.map(async (fund) => {
          const nextFund = await fetchFundBaseData(fund.code, fund);
          recordValuation(nextFund.code, { gsz: nextFund.gsz, gztime: nextFund.gztime });
          return nextFund;
        }),
      );

      const refreshed = refreshedResults.map((result, index) => {
        const previousFund = fundsRef.current[index];
        if (result.status !== "fulfilled") return previousFund;
        return mergeQuoteWithIntradayFallback(previousFund, result.value);
      });
      const successCount = refreshedResults.filter((item) => item.status === "fulfilled").length;
      const failedCount = refreshedResults.length - successCount;

      if (token === refreshTokenRef.current) {
        if (successCount > 0) {
          setState((current) => ({
            ...current,
            funds: refreshed,
            lastUpdatedAt: nowInMarket().format("YYYY-MM-DD HH:mm:ss"),
          }));
          setValuationSeries(getAllValuationSeries());
        }

        if (failedCount > 0) {
          setError(failedCount === refreshedResults.length ? "刷新失败" : `部分基金刷新失败（${failedCount}/${refreshedResults.length}）`);
        }
      }
    } catch (nextError) {
      if (token === refreshTokenRef.current) {
        setError(nextError instanceof Error ? nextError.message : "刷新失败");
      }
    } finally {
      if (token === refreshTokenRef.current) {
        refreshingRef.current = false;
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (state.funds.length === 0) {
      didInitialRefreshRef.current = false;
      skipNextInitialRefreshRef.current = false;
      return;
    }
    if (didInitialRefreshRef.current) return;

    didInitialRefreshRef.current = true;
    setPassiveRefreshAt((current) => current ?? Date.now());
    if (skipNextInitialRefreshRef.current) {
      skipNextInitialRefreshRef.current = false;
      return;
    }
    refreshFunds();
  }, [hydrated, state.funds.length, refreshFunds]);

  useEffect(() => {
    if (!hydrated) return;
    applyUserDataMutation((current) => settleConfirmedTransactions(current));
  }, [applyUserDataMutation, hydrated]);

  useEffect(() => {
    if (!hydrated) return;

    const settlePendingOnForeground = () => {
      applyUserDataMutation((current) => settleConfirmedTransactions(current));
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        settlePendingOnForeground();
      }
    };

    window.addEventListener("focus", settlePendingOnForeground);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", settlePendingOnForeground);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [applyUserDataMutation, hydrated]);

  useEffect(() => {
    if (!hydrated) return;

    let active = true;
    let timer: number | null = null;

    const runSettlementCheck = () => {
      applyUserDataMutation((current) => settleConfirmedTransactions(current));
    };

    const scheduleNextOpenCheck = () => {
      if (!active) return;
      const now = nowInMarket();
      const todayOpen = now.startOf("day").add(MARKET_OPEN_MINUTES, "minute");
      const nextCheckAt = now.isBefore(todayOpen) ? todayOpen : todayOpen.add(1, "day");
      const delay = Math.max(1000, nextCheckAt.diff(now, "millisecond"));
      timer = window.setTimeout(() => {
        if (!active) return;
        runSettlementCheck();
        scheduleNextOpenCheck();
      }, delay);
    };

    scheduleNextOpenCheck();
    return () => {
      active = false;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [applyUserDataMutation, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (state.refreshMs < 5000) return;
    if (state.funds.length === 0) return;

    setPassiveRefreshAt((current) => current ?? Date.now());

    const timer = window.setInterval(() => {
      console.info(`[refresh-ms] trigger: interval=${state.refreshMs}ms at=${nowInMarket().format("YYYY-MM-DD HH:mm:ss")} CST`);
      setPassiveRefreshAt(Date.now());
      refreshFunds();
    }, state.refreshMs);

    return () => window.clearInterval(timer);
  }, [hydrated, refreshFunds, state.funds.length, state.refreshMs]);

  useEffect(() => {
    if (!hydrated) return;
    if (state.funds.length === 0) return;

    const refreshOnForeground = () => {
      const now = Date.now();
      if (now - lastForegroundRefreshRef.current < 15000) return;
      lastForegroundRefreshRef.current = now;
      void refreshFunds();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshOnForeground();
      }
    };

    window.addEventListener("focus", refreshOnForeground);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshOnForeground);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [hydrated, refreshFunds, state.funds.length]);

  const backfillFundArchives = useCallback(async (fund: FundSnapshot) => {
    if (refreshingRef.current || document.hidden) return;
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/discover")) return;
    if (archiveBackfillInFlightRef.current.has(fund.code)) return;

    archiveBackfillInFlightRef.current.add(fund.code);
    archiveBackfillAttemptRef.current[fund.code] = Date.now();

    try {
      const nextFund = await fetchFundArchiveData(fund.code, fund);
      setState((current) => ({
        ...current,
        funds: current.funds.map((item) =>
          item.code === fund.code
            ? {
                ...item,
                holdings: nextFund.holdings,
                holdingsReportDate: nextFund.holdingsReportDate,
                holdingsIsLastQuarter: nextFund.holdingsIsLastQuarter,
                archiveStatus: nextFund.archiveStatus,
                fundType: nextFund.fundType,
                riskLevel: nextFund.riskLevel,
                fundManager: nextFund.fundManager,
                fundCompany: nextFund.fundCompany,
                fundScale: nextFund.fundScale,
                trackingTarget: nextFund.trackingTarget,
                inceptionDate: nextFund.inceptionDate,
              }
            : item,
        ),
      }));
    } catch {
      setState((current) => ({
        ...current,
        funds: current.funds.map((item) => (item.code === fund.code ? { ...item, archiveStatus: item.archiveStatus || "pending" } : item)),
      }));
    } finally {
      archiveBackfillInFlightRef.current.delete(fund.code);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || document.hidden || refreshingRef.current || state.funds.length === 0) return;
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/discover")) return;

    const now = Date.now();
    const candidates = state.funds.filter((fund) => {
      if (!needsArchiveBackfill(fund)) return false;
      if (archiveBackfillInFlightRef.current.has(fund.code)) return false;
      const lastAttemptAt = archiveBackfillAttemptRef.current[fund.code] || 0;
      return now - lastAttemptAt >= 10_000;
    });

    if (candidates.length === 0) return;

    const queue = candidates.slice(0, MAX_ARCHIVE_PREFETCH_CONCURRENCY);

    const timer = window.setTimeout(() => {
      void Promise.allSettled(queue.map((item) => backfillFundArchives(item)));
    }, 220);

    return () => window.clearTimeout(timer);
  }, [backfillFundArchives, hydrated, state.funds]);

  useEffect(() => {
    if (!hydrated || document.hidden || state.funds.length === 0) return;
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/discover")) return;

    const now = Date.now();
    const queue = state.funds.filter((fund) => {
      if (!fund?.code) return false;
      if (historyPreheatDoneRef.current.has(fund.code)) return false;
      if (historyPreheatInFlightRef.current.has(fund.code)) return false;
      const lastAttemptAt = historyPreheatAttemptRef.current[fund.code] || 0;
      return now - lastAttemptAt >= 60_000;
    }).slice(0, MAX_HISTORY_PREFETCH_CONCURRENCY);

    if (queue.length === 0) return;

    const timer = window.setTimeout(() => {
      void Promise.allSettled(queue.map(async (fund) => {
        historyPreheatInFlightRef.current.add(fund.code);
        historyPreheatAttemptRef.current[fund.code] = Date.now();
        try {
          await fetchFundHistoricalNavSeries(fund.code, 360);
          historyPreheatDoneRef.current.add(fund.code);
        } catch {
          // retry in next cycle
        } finally {
          historyPreheatInFlightRef.current.delete(fund.code);
        }
      }));
    }, 680);

    return () => window.clearTimeout(timer);
  }, [hydrated, state.funds]);

  const addFund = useCallback(async (input: SearchFundResult) => {
    const existing = fundsRef.current.find((item) => item.code === input.code);
    if (existing) return existing;

    refreshingRef.current = true;
    setRefreshing(true);
    setError("");

    try {
      const snapshot = await fetchFundBaseData(input.code, {
        code: input.code,
        name: input.name,
      }, "interactive");

      recordValuation(snapshot.code, { gsz: snapshot.gsz, gztime: snapshot.gztime });
      setValuationSeries(getAllValuationSeries());

      applyUserDataMutation((current) => {
        const nextFunds = current.funds.some((item) => item.code === snapshot.code)
          ? current.funds
          : [snapshot, ...current.funds];

        return {
          ...current,
          funds: nextFunds,
          searchHistory: [input.name, ...current.searchHistory.filter((item) => item !== input.name)].slice(0, 6),
          lastUpdatedAt: nowInMarket().format("YYYY-MM-DD HH:mm:ss"),
        };
      });
      didInitialRefreshRef.current = true;
      return snapshot;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "添加基金失败");
      return null;
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [applyUserDataMutation]);

  const recordSearchHistory = useCallback((keyword: string) => {
    const trimmed = keyword.trim();
    if (!trimmed) return;

    applyUserDataMutation((current) => ({
      ...current,
      searchHistory: [trimmed, ...current.searchHistory.filter((item) => item !== trimmed)].slice(0, 6),
    }));
  }, [applyUserDataMutation]);

  const removeFund = useCallback((code: string) => {
    applyUserDataMutation((current) => {
      const holdings = { ...current.holdings };
      const transactions = { ...current.transactions };
      delete holdings[code];
      delete transactions[code];

      return {
        ...current,
        funds: current.funds.filter((item) => item.code !== code),
        favorites: current.favorites.filter((item) => item !== code),
        holdings,
        transactions,
      };
    });

    clearValuationSeries(code);
    setValuationSeries(getAllValuationSeries());
  }, [applyUserDataMutation]);

  const updateHolding = useCallback((code: string, next: FundHolding) => {
    const nextState = applyUserDataMutation((current) => ({
      ...current,
      holdings: {
        ...current.holdings,
        [code]: next,
      },
    }));
    persistRuntimeState(nextState);
  }, [applyUserDataMutation, persistRuntimeState]);

  const clearHolding = useCallback((code: string) => {
    const nextState = applyUserDataMutation((current) => ({
      ...current,
      holdings: {
        ...current.holdings,
        [code]: {
          share: null,
          cost: null,
          firstPurchaseDate: null,
        },
      },
      transactions: {
        ...current.transactions,
        [code]: [],
      },
    }));
    persistRuntimeState(nextState);
  }, [applyUserDataMutation, persistRuntimeState]);

  const addTransaction = useCallback((code: string, next: Omit<FundTransaction, "id">) => {
    const nextState = applyUserDataMutation((current) => {
      const tx: FundTransaction = {
        ...next,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        settledAt: null,
      };
      const nextTransactions = [tx, ...(current.transactions[code] || [])].sort((a, b) => b.date.localeCompare(a.date));
      const nextHoldings = { ...current.holdings };

      if (isTransactionConfirmedInMarket(tx)) {
        const holding = current.holdings[code];
        const currentShare = typeof holding?.share === "number" && Number.isFinite(holding.share) ? holding.share : 0;
        const currentCost = typeof holding?.cost === "number" && Number.isFinite(holding.cost) ? holding.cost : 0;
        const currentTotalCost = currentShare > 0 ? currentShare * currentCost : 0;
        const txShare = Number(tx.share);
        const txPrice = Number(tx.price);
        const txFee = Number(tx.fee || 0);

        if (tx.type === "buy" && txShare > 0 && txPrice > 0) {
          const nextShare = currentShare + txShare;
          const nextTotalCost = currentTotalCost + txShare * txPrice + (Number.isFinite(txFee) ? txFee : 0);
          const firstPurchaseDate = holding?.firstPurchaseDate && holding.firstPurchaseDate < tx.date ? holding.firstPurchaseDate : tx.date;
          nextHoldings[code] = {
            share: nextShare,
            cost: nextShare > 0 ? nextTotalCost / nextShare : null,
            firstPurchaseDate,
          };
          tx.settledAt = nowInMarket().format("YYYY-MM-DD");
        } else if (tx.type === "sell" && txShare > 0 && currentShare > 0) {
          const soldShare = Math.min(txShare, currentShare);
          const avgCost = currentShare > 0 ? currentTotalCost / currentShare : 0;
          const remainingShare = currentShare - soldShare;
          const remainingCost = currentTotalCost - soldShare * avgCost;
          nextHoldings[code] = remainingShare > 1e-8
            ? {
                share: remainingShare,
                cost: remainingShare > 0 ? remainingCost / remainingShare : null,
                firstPurchaseDate: holding?.firstPurchaseDate || null,
              }
            : {
                share: null,
                cost: null,
                firstPurchaseDate: null,
              };
          tx.settledAt = nowInMarket().format("YYYY-MM-DD");
        }
      }

      return {
        ...current,
        transactions: {
          ...current.transactions,
          [code]: nextTransactions,
        },
        holdings: nextHoldings,
      };
    });
    persistRuntimeState(nextState);
  }, [applyUserDataMutation, persistRuntimeState]);

  const updateTransaction = useCallback((code: string, id: string, next: Omit<FundTransaction, "id">) => {
    const nextState = applyUserDataMutation((current) => {
      const previousTransactions = current.transactions[code] || [];
      const previous = previousTransactions.find((item) => item.id === id);
      if (!previous) return current;

      const updatedTx: FundTransaction = {
        ...next,
        id,
        settledAt: null,
      };
      const nextTransactions = previousTransactions
        .map((item) => (item.id === id ? updatedTx : item))
        .sort((a, b) => b.date.localeCompare(a.date));
      const nextHoldings = { ...current.holdings };
      const afterRollback = rollbackConfirmedTransactionFromHolding(current.holdings[code], previous, nextTransactions);
      const finalHolding = addConfirmedTransactionToHolding(afterRollback, updatedTx);

      if (isTransactionConfirmedInMarket(updatedTx)) {
        updatedTx.settledAt = nowInMarket().format("YYYY-MM-DD");
      }

      nextHoldings[code] = finalHolding;

      return {
        ...current,
        transactions: {
          ...current.transactions,
          [code]: nextTransactions,
        },
        holdings: nextHoldings,
      };
    });
    persistRuntimeState(nextState);
  }, [applyUserDataMutation, persistRuntimeState]);

  const removeTransaction = useCallback((code: string, id: string) => {
    const nextState = applyUserDataMutation((current) => {
      const previousTransactions = current.transactions[code] || [];
      const removed = previousTransactions.find((item) => item.id === id);
      const nextTransactions = previousTransactions.filter((item) => item.id !== id);

      if (!removed || !removed.settledAt) {
        return {
          ...current,
          transactions: {
            ...current.transactions,
            [code]: nextTransactions,
          },
        };
      }

      const currentHolding = current.holdings[code];
      const currentShare = typeof currentHolding?.share === "number" && Number.isFinite(currentHolding.share) ? currentHolding.share : 0;
      const currentCost = typeof currentHolding?.cost === "number" && Number.isFinite(currentHolding.cost) ? currentHolding.cost : 0;
      const currentTotalCost = currentShare > 0 ? currentShare * currentCost : 0;
      const txShare = Number(removed.share);
      const txPrice = Number(removed.price);
      const txFee = Number(removed.fee || 0);
      const nextHoldings = { ...current.holdings };

      if (removed.type === "buy" && txShare > 0 && txPrice > 0 && currentShare > 0) {
        const deductedCost = txShare * txPrice + (Number.isFinite(txFee) ? txFee : 0);
        const nextShare = Math.max(0, currentShare - txShare);
        const nextTotalCost = Math.max(0, currentTotalCost - deductedCost);

        if (nextShare > 1e-8) {
          const remainingConfirmedBuyDates = nextTransactions
            .filter((item) => item.type === "buy" && isTransactionConfirmedInMarket(item))
            .map((item) => item.date)
            .sort((a, b) => a.localeCompare(b));

          const shouldRecomputeFirstDate = !currentHolding?.firstPurchaseDate || currentHolding.firstPurchaseDate === removed.date;
          const nextFirstPurchaseDate = shouldRecomputeFirstDate
            ? remainingConfirmedBuyDates[0] || null
            : currentHolding?.firstPurchaseDate || null;

          nextHoldings[code] = {
            share: nextShare,
            cost: nextTotalCost / nextShare,
            firstPurchaseDate: nextFirstPurchaseDate,
          };
        } else {
          nextHoldings[code] = {
            share: null,
            cost: null,
            firstPurchaseDate: null,
          };
        }
      } else if (removed.type === "sell" && txShare > 0) {
        // Selling at average cost keeps avg cost unchanged for the remaining position.
        // To undo a confirmed sell, restore shares at current average cost.
        if (currentShare > 0 && Number.isFinite(currentCost) && currentCost > 0) {
          const nextShare = currentShare + txShare;
          const nextTotalCost = currentTotalCost + txShare * currentCost;
          nextHoldings[code] = {
            share: nextShare,
            cost: nextTotalCost / nextShare,
            firstPurchaseDate: currentHolding?.firstPurchaseDate || null,
          };
        } else {
          // If the position was already cleared by a sell, reverse math loses prior avg cost.
          // Fallback to replaying remaining confirmed transactions from empty holding.
          nextHoldings[code] = applyConfirmedTransactionsToHolding(undefined, nextTransactions);
        }
      }

      return {
        ...current,
        transactions: {
          ...current.transactions,
          [code]: nextTransactions,
        },
        holdings: nextHoldings,
      };
    });
    persistRuntimeState(nextState);
  }, [applyUserDataMutation, persistRuntimeState]);

  const toggleFavorite = useCallback((code: string) => {
    applyUserDataMutation((current) => ({
      ...current,
      favorites: current.favorites.includes(code)
        ? current.favorites.filter((item) => item !== code)
        : [code, ...current.favorites],
    }));
  }, [applyUserDataMutation]);

  const setRefreshMs = useCallback((value: number) => {
    applyUserDataMutation((current) => ({
      ...current,
      refreshMs: value,
    }));
  }, [applyUserDataMutation]);

  const clearSearchHistory = useCallback(() => {
    applyUserDataMutation((current) => ({
      ...current,
      searchHistory: [],
    }));
  }, [applyUserDataMutation]);

  const refreshFromLocalState = useCallback(() => {
    if (!hydratedRef.current) return;
    const localState = loadAppState();
    const currentState = stateRef.current;
    const localVersion = localState.sync.dataVersion;
    const currentVersion = currentState.sync.dataVersion;
    const localHash = computeAppStateContentHash(localState);
    const currentHash = computeAppStateContentHash(currentState);

    if (localVersion < currentVersion) return;
    if (localVersion === currentVersion && localHash === currentHash) {
      return;
    }

    setState(localState);
    stateRef.current = localState;
    fundsRef.current = localState.funds;
  }, []);

  const clearAll = useCallback(() => {
    refreshTokenRef.current += 1;
    refreshingRef.current = false;
    seedingRef.current = false;
    setRefreshing(false);
    setSeeding(false);
    setError("");
    didInitialRefreshRef.current = false;
    setPassiveRefreshAt(null);
    const clearedState = markAppStateSynced(defaultAppState, defaultAppState.sync.lastSyncedVersion);
    setState(clearedState);
    setValuationSeries({});
    fundsRef.current = [];
    stateRef.current = clearedState;
    pendingConflictRef.current = null;
    setConflictResolution({
      open: false,
      localSummary: { funds: 0, holdings: 0, transactions: 0, searchHistory: 0 },
      cloudSummary: { funds: 0, holdings: 0, transactions: 0, searchHistory: 0 },
      resolving: false,
    });
    clearAppManagedLocalStorage();
    clearPendingCloudSync();
    lastCloudPayloadRef.current = "";
  }, []);

  const clearLocalOnly = useCallback(() => {
    suppressEmptyCloudSyncRef.current = true;
    skipNextCloudSyncRef.current = true;
    clearAll();
  }, [clearAll]);

  const seedDemoData = useCallback(async () => {
    if (seedingRef.current) return;
    seedingRef.current = true;
    setSeeding(true);

    // Keep spinner visible briefly so the action has clear feedback on mobile.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 280));

    refreshTokenRef.current += 1;
    refreshingRef.current = false;
    setRefreshing(false);
    setError("");
    const seed = buildDemoSeed();
    const nextSeedState = bumpAppStateVersion(normalizeAppState(seed.state));
    didInitialRefreshRef.current = true;
    setState(nextSeedState);
    setValuationSeries(seed.valuationSeries);
    fundsRef.current = nextSeedState.funds;
    stateRef.current = nextSeedState;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(APP_STATE_KEY, JSON.stringify(nextSeedState));
      window.localStorage.setItem(VALUATION_TIMESERIES_KEY, JSON.stringify(seed.valuationSeries));
      if (userId) {
        setLocalOwnerUser(userId);
      }
    }
    seedingRef.current = false;
    setSeeding(false);
  }, [userId]);

  const importBackupData = useCallback((payload: { appState: unknown; valuationSeries?: unknown }) => {
    try {
      const nextState = bumpAppStateVersion(normalizeAppState(payload.appState));
      syncDataVersionFloor(nextState.sync.dataVersion);
      const nextSeries = payload.valuationSeries === undefined
        ? getAllValuationSeries()
        : setAllValuationSeries(normalizeValuationSeries(payload.valuationSeries));

      refreshTokenRef.current += 1;
      refreshingRef.current = false;
      seedingRef.current = false;
      setRefreshing(false);
      setSeeding(false);
      setError("");
      didInitialRefreshRef.current = nextState.funds.length > 0;
      setPassiveRefreshAt(null);
      setState(nextState);
      setValuationSeries(nextSeries);
      fundsRef.current = nextState.funds;
      stateRef.current = nextState;

      return { ok: true, message: "导入成功，数据已更新" };
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "导入失败，请检查文件格式";
      return { ok: false, message };
    }
  }, []);

  const search = useCallback(async (keyword: string) => searchFunds(keyword, "interactive"), []);

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      hydrated,
      refreshing,
      seeding,
      error,
      passiveRefreshAt,
      valuationSeries,
      search,
      recordSearchHistory,
      addFund,
      refreshFunds,
      removeFund,
      clearHolding,
      updateHolding,
      addTransaction,
      updateTransaction,
      removeTransaction,
      toggleFavorite,
      setRefreshMs,
      clearSearchHistory,
      refreshFromLocalState,
      clearAll,
      clearLocalOnly,
      seedDemoData,
      importBackupData,
      pushCloudConfig,
      pushCloudConfigUploadOnly,
      pullCloudConfig,
      conflictResolution,
      cloudSyncStatus,
      resolveDataConflict,
    }),
    [
      addFund,
      addTransaction,
      clearAll,
      clearHolding,
      clearLocalOnly,
      clearSearchHistory,
      conflictResolution,
      cloudSyncStatus,
      error,
      hydrated,
      importBackupData,
      passiveRefreshAt,
      pullCloudConfig,
      pushCloudConfig,
      pushCloudConfigUploadOnly,
      refreshFunds,
      refreshing,
      removeFund,
      removeTransaction,
      updateTransaction,
      search,
      recordSearchHistory,
      resolveDataConflict,
      seeding,
      seedDemoData,
      setRefreshMs,
      state,
      refreshFromLocalState,
      toggleFavorite,
      updateHolding,
      valuationSeries,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useAppState = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppState must be used within AppProvider");
  }
  return context;
};
