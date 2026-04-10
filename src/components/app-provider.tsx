"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { buildCloudPayloadFromState, createCloudPayload, fetchCloudUserData, hasMeaningfulCloudData, hydrateAppStateFromCloudPayload, mergeCloudPayloads, upsertCloudUserData } from "@/lib/cloud-user-data";
import { fetchFundBaseData, fetchFundData, searchFunds } from "@/lib/fund-api";
import { applyConfirmedTransactionsToHolding, isTransactionConfirmedInMarket } from "@/lib/portfolio";
import { APP_STATE_KEY, defaultAppState, loadAppState, normalizeAppState, saveAppState } from "@/lib/storage";
import { isEstimateTimestampUsable, nowInMarket } from "@/lib/time";
import type { AppState, FundHolding, FundSnapshot, FundTransaction, SearchFundResult, ValuationPoint } from "@/lib/types";
import { IMPORTANT_UI_PREFERENCE_KEYS, applyImportantPreferences, readImportantPreferences } from "@/lib/user-preferences";
import { clearValuationSeries, getAllValuationSeries, normalizeValuationSeries, recordValuation, setAllValuationSeries, VALUATION_TIMESERIES_KEY } from "@/lib/valuation-timeseries";
import { buildDemoSeed } from "@/lib/demo-data";

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
  removeTransaction: (code: string, id: string) => void;
  toggleFavorite: (code: string) => void;
  setRefreshMs: (value: number) => void;
  clearSearchHistory: () => void;
  clearAll: () => void;
  clearLocalOnly: () => void;
  seedDemoData: () => Promise<void>;
  importBackupData: (payload: { appState: unknown; valuationSeries?: unknown }) => { ok: boolean; message: string };
  pushCloudConfig: () => Promise<{ ok: boolean; message: string }>;
  pullCloudConfig: () => Promise<{ ok: boolean; message: string }>;
  conflictResolution: {
    open: boolean;
    localSummary: { funds: number; holdings: number; transactions: number; searchHistory: number };
    cloudSummary: { funds: number; holdings: number; transactions: number; searchHistory: number };
    resolving: boolean;
  };
  resolveDataConflict: (strategy: "keep_local" | "keep_cloud" | "merge") => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);
const LOCAL_OWNER_USER_ID_KEY = "real-fund-mobile:owner-user-id";
const OFFICIAL_NAV_HISTORY_CACHE_KEY = "real-fund-mobile:official-nav-history";
const MAX_ARCHIVE_PREFETCH_CONCURRENCY = 3;

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

export function AppProvider({ children }: { children: React.ReactNode }) {
  const isDevNoAuth = process.env.NODE_ENV !== "production";
  const { user, authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<AppState>(defaultAppState);
  const [hydrated, setHydrated] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState("");
  const [passiveRefreshAt, setPassiveRefreshAt] = useState<number | null>(null);
  const [valuationSeries, setValuationSeries] = useState<Record<string, ValuationPoint[]>>({});
  const fundsRef = useRef<FundSnapshot[]>([]);
  const refreshingRef = useRef(false);
  const seedingRef = useRef(false);
  const didInitialRefreshRef = useRef(false);
  const refreshTokenRef = useRef(0);
  const lastForegroundRefreshRef = useRef(0);
  const archiveBackfillInFlightRef = useRef(new Set<string>());
  const archiveBackfillAttemptRef = useRef<Record<string, number>>({});
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
  const pendingConflictRef = useRef<
    | {
        localState: AppState;
        cloudState: AppState;
        localPayload: ReturnType<typeof createCloudPayload>;
        cloudPayload: ReturnType<typeof createCloudPayload>;
      }
    | null
  >(null);

  const applyPayloadAsRuntime = (payload: ReturnType<typeof createCloudPayload>) => {
    const nextState = hydrateAppStateFromCloudPayload(payload);
    applyImportantPreferences(payload.preferences);
    setPreferenceSignature(JSON.stringify(readImportantPreferences()));
    setState(nextState);
    fundsRef.current = nextState.funds;
    lastCloudPayloadRef.current = JSON.stringify(payload);
  };

  const hydrateCloudFundsForView = useCallback(async (funds: FundSnapshot[]) => {
    if (funds.length === 0) return funds;

    const hydratedResults = await Promise.allSettled(
      funds.map((fund) => fetchFundBaseData(fund.code, { code: fund.code, name: fund.name || fund.code }, "interactive")),
    );

    return hydratedResults.map((result, index) => {
      if (result.status !== "fulfilled") {
        return funds[index];
      }

      const nextFund = result.value;
      recordValuation(nextFund.code, { gsz: nextFund.gsz, gztime: nextFund.gztime });
      return nextFund;
    });
  }, []);

  useEffect(() => {
    if (authLoading) return;

    let active = true;

    const bootstrap = async () => {
      if (!userId) {
        if (!active) return;
        if (isDevNoAuth) {
          const localState = loadAppState();
          const localSeries = getAllValuationSeries();
          setState(localState);
          setValuationSeries(localSeries);
          fundsRef.current = localState.funds;
          setPreferenceSignature(JSON.stringify(readImportantPreferences()));
          setHydrated(true);
          return;
        }
        pendingConflictRef.current = null;
        setConflictResolution({
          open: false,
          localSummary: { funds: 0, holdings: 0, transactions: 0, searchHistory: 0 },
          cloudSummary: { funds: 0, holdings: 0, transactions: 0, searchHistory: 0 },
          resolving: false,
        });
        setState(defaultAppState);
        setValuationSeries({});
        fundsRef.current = [];
        setHydrated(true);
        return;
      }

      const localState = loadAppState();
      const localSeries = getAllValuationSeries();
      const localPreferences = readImportantPreferences();
      const localOwnerUserId = typeof window !== "undefined" ? window.localStorage.getItem(LOCAL_OWNER_USER_ID_KEY) : null;
      const shouldUseLocalForBootstrap = !localOwnerUserId || localOwnerUserId === userId;
      const bootstrapState = shouldUseLocalForBootstrap ? localState : defaultAppState;

      // Local-first bootstrap: keep route switches responsive on mobile,
      // then reconcile cloud payload in background.
      setState(bootstrapState);
      setValuationSeries(shouldUseLocalForBootstrap ? localSeries : {});
      fundsRef.current = bootstrapState.funds;
      setPreferenceSignature(JSON.stringify(localPreferences));
      setHydrated(true);

      try {
        const cloud = await fetchCloudUserData(userId);
        if (!active) return;

        const localPayload = createCloudPayload(localState, localPreferences);

        if (cloud) {
          const cloudState = hydrateAppStateFromCloudPayload(cloud);
          const cloudFunds = await hydrateCloudFundsForView(cloudState.funds);
          const cloudStateForRuntime = {
            ...cloudState,
            funds: cloudFunds,
          };
          const cloudPayload = createCloudPayload(cloudState, cloud.preferences);
          const shouldAskConflict = hasMeaningfulCloudData(localPayload) && hasMeaningfulCloudData(cloudPayload)
            && localOwnerUserId !== userId
            && JSON.stringify(localPayload) !== JSON.stringify(cloudPayload);

          if (shouldAskConflict) {
            pendingConflictRef.current = {
              localState,
              cloudState: cloudStateForRuntime,
              localPayload,
              cloudPayload: createCloudPayload(cloudStateForRuntime, cloud.preferences),
            };
            setConflictResolution({
              open: true,
              localSummary: getStateSummary(localState),
              cloudSummary: getStateSummary(cloudStateForRuntime),
              resolving: false,
            });
            setState(bootstrapState);
            setPreferenceSignature(JSON.stringify(localPreferences));
          } else {
            applyPayloadAsRuntime(createCloudPayload(cloudStateForRuntime, cloud.preferences));
            setLocalOwnerUser(userId);
          }

          setValuationSeries(getAllValuationSeries());
          return;
        }

        const bootState = shouldUseLocalForBootstrap ? localState : defaultAppState;
        const bootPayload = buildCloudPayloadFromState(bootState);
        await upsertCloudUserData(userId, bootPayload);
        if (!active) return;

        lastCloudPayloadRef.current = JSON.stringify(bootPayload);
        setPreferenceSignature(JSON.stringify(readImportantPreferences()));
        setState(bootState);
        setValuationSeries(shouldUseLocalForBootstrap ? localSeries : {});
        fundsRef.current = bootState.funds;
        setLocalOwnerUser(userId);
      } catch {
        if (!active) return;
        setState(bootstrapState);
        setValuationSeries(shouldUseLocalForBootstrap ? localSeries : {});
        fundsRef.current = bootstrapState.funds;
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, [authLoading, hydrateCloudFundsForView, isDevNoAuth, userId]);

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

    const timer = window.setInterval(() => {
      const next = capture();
      setPreferenceSignature((current) => (current === next ? current : next));
    }, 1500);

    return () => window.clearInterval(timer);
  }, [hydrated, userId]);

  useEffect(() => {
    if (!hydrated || !userId || conflictResolution.open) return;

    if (skipNextCloudSyncRef.current) {
      skipNextCloudSyncRef.current = false;
      return;
    }

    const payload = buildCloudPayloadFromState(state);
    const isMeaningfulPayload = hasMeaningfulCloudData(payload);
    if (suppressEmptyCloudSyncRef.current && !isMeaningfulPayload) {
      return;
    }
    if (isMeaningfulPayload) {
      suppressEmptyCloudSyncRef.current = false;
    }

    const signature = JSON.stringify(payload);
    if (signature === lastCloudPayloadRef.current) return;

    const timer = window.setTimeout(() => {
      void upsertCloudUserData(userId, payload)
        .then(() => {
          lastCloudPayloadRef.current = signature;
          setLocalOwnerUser(userId);
        })
        .catch(() => {
          // keep local runtime state; sync can retry on next state/preference change
        });
    }, 420);

    return () => window.clearTimeout(timer);
  }, [conflictResolution.open, hydrated, preferenceSignature, state, userId]);

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
      await upsertCloudUserData(userId, resolvedPayload);
      setLocalOwnerUser(userId);
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
  }, [userId]);

  const pushCloudConfig = useCallback(async () => {
    if (!userId) {
      return { ok: false, message: "请先登录后再上传" };
    }

    try {
      suppressEmptyCloudSyncRef.current = false;
      const payload = buildCloudPayloadFromState(state);
      await upsertCloudUserData(userId, payload);
      lastCloudPayloadRef.current = JSON.stringify(payload);
      setLocalOwnerUser(userId);
      return { ok: true, message: "已上传当前配置到云端" };
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "上传云端失败";
      setError(message);
      return { ok: false, message };
    }
  }, [state, userId]);

  const pullCloudConfig = useCallback(async () => {
    if (!userId) {
      return { ok: false, message: "请先登录后再拉取" };
    }

    try {
      const cloud = await fetchCloudUserData(userId);
      if (!cloud) {
        return { ok: false, message: "云端暂无可用配置" };
      }

      const cloudState = hydrateAppStateFromCloudPayload(cloud);
      const initialPayload = createCloudPayload(cloudState, cloud.preferences);
      applyPayloadAsRuntime(initialPayload);
      setValuationSeries(getAllValuationSeries());

      const cloudFunds = await hydrateCloudFundsForView(cloudState.funds);
      setState((current) => {
        const merged = {
          ...current,
          funds: cloudFunds,
        };
        return merged;
      });
      setValuationSeries(getAllValuationSeries());
      pendingConflictRef.current = null;
      setConflictResolution({
        open: false,
        localSummary: { funds: 0, holdings: 0, transactions: 0, searchHistory: 0 },
        cloudSummary: { funds: 0, holdings: 0, transactions: 0, searchHistory: 0 },
        resolving: false,
      });
      setLocalOwnerUser(userId);
      return { ok: true, message: "已从云端拉取配置" };
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "拉取云端配置失败";
      setError(message);
      return { ok: false, message };
    }
  }, [hydrateCloudFundsForView, userId]);

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
          const nextFund = await fetchFundData(fund.code, fund);
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
      return;
    }
    if (didInitialRefreshRef.current) return;

    didInitialRefreshRef.current = true;
    refreshFunds();
  }, [hydrated, state.funds.length, refreshFunds]);

  useEffect(() => {
    if (!hydrated) return;
    if (state.refreshMs < 5000) return;
    if (state.funds.length === 0) return;

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
      const nextFund = await fetchFundData(fund.code, fund);
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

      setState((current) => {
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
  }, []);

  const recordSearchHistory = useCallback((keyword: string) => {
    const trimmed = keyword.trim();
    if (!trimmed) return;

    setState((current) => ({
      ...current,
      searchHistory: [trimmed, ...current.searchHistory.filter((item) => item !== trimmed)].slice(0, 6),
    }));
  }, []);

  const removeFund = useCallback((code: string) => {
    setState((current) => {
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
  }, []);

  const updateHolding = useCallback((code: string, next: FundHolding) => {
    setState((current) => ({
      ...current,
      holdings: {
        ...current.holdings,
        [code]: next,
      },
    }));
  }, []);

  const clearHolding = useCallback((code: string) => {
    setState((current) => ({
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
  }, []);

  const addTransaction = useCallback((code: string, next: Omit<FundTransaction, "id">) => {
    setState((current) => {
      const tx: FundTransaction = {
        ...next,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
  }, []);

  const removeTransaction = useCallback((code: string, id: string) => {
    setState((current) => {
      const previousTransactions = current.transactions[code] || [];
      const removed = previousTransactions.find((item) => item.id === id);
      const nextTransactions = previousTransactions.filter((item) => item.id !== id);

      if (!removed || !isTransactionConfirmedInMarket(removed)) {
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
  }, []);

  const toggleFavorite = useCallback((code: string) => {
    setState((current) => ({
      ...current,
      favorites: current.favorites.includes(code)
        ? current.favorites.filter((item) => item !== code)
        : [code, ...current.favorites],
    }));
  }, []);

  const setRefreshMs = useCallback((value: number) => {
    setState((current) => ({
      ...current,
      refreshMs: value,
    }));
  }, []);

  const clearSearchHistory = useCallback(() => {
    setState((current) => ({
      ...current,
      searchHistory: [],
    }));
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
    setState(defaultAppState);
    setValuationSeries({});
    fundsRef.current = [];
    pendingConflictRef.current = null;
    setConflictResolution({
      open: false,
      localSummary: { funds: 0, holdings: 0, transactions: 0, searchHistory: 0 },
      cloudSummary: { funds: 0, holdings: 0, transactions: 0, searchHistory: 0 },
      resolving: false,
    });
    clearAppManagedLocalStorage();
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
    didInitialRefreshRef.current = true;
    setState(seed.state);
    setValuationSeries(seed.valuationSeries);
    fundsRef.current = seed.state.funds;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(APP_STATE_KEY, JSON.stringify(seed.state));
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
      const nextState = normalizeAppState(payload.appState);
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
      removeTransaction,
      toggleFavorite,
      setRefreshMs,
      clearSearchHistory,
      clearAll,
      clearLocalOnly,
      seedDemoData,
      importBackupData,
      pushCloudConfig,
      pullCloudConfig,
      conflictResolution,
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
      error,
      hydrated,
      importBackupData,
      passiveRefreshAt,
      pullCloudConfig,
      pushCloudConfig,
      refreshFunds,
      refreshing,
      removeFund,
      removeTransaction,
      search,
      recordSearchHistory,
      resolveDataConflict,
      seeding,
      seedDemoData,
      setRefreshMs,
      state,
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
