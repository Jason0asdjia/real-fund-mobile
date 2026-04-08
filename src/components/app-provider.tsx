"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { fetchFundBaseData, fetchFundData, searchFunds } from "@/lib/fund-api";
import { defaultAppState, loadAppState, saveAppState } from "@/lib/storage";
import { isEstimateTimestampUsable, nowInMarket } from "@/lib/time";
import type { AppState, FundHolding, FundSnapshot, FundTransaction, SearchFundResult, ValuationPoint } from "@/lib/types";
import { clearValuationSeries, getAllValuationSeries, recordValuation } from "@/lib/valuation-timeseries";
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
  seedDemoData: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

const needsArchiveBackfill = (fund: FundSnapshot) => {
  if (fund.archiveStatus === "ready" || fund.archiveStatus === "empty") return false;
  return !fund.holdingsReportDate && !fund.fundType && !fund.riskLevel && !fund.fundManager && !fund.fundCompany && !fund.fundScale && !fund.trackingTarget && !fund.inceptionDate;
};

const toFiniteNumber = (value: unknown) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
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
  const archiveBackfillCodeRef = useRef<string | null>(null);
  const archiveBackfillAttemptRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const nextState = loadAppState();
    setState(nextState);
    setValuationSeries(getAllValuationSeries());
    fundsRef.current = nextState.funds;
    setHydrated(true);
  }, []);

  useEffect(() => {
    fundsRef.current = state.funds;
  }, [state.funds]);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    seedingRef.current = seeding;
  }, [seeding]);

  useEffect(() => {
    if (!hydrated) return;
    saveAppState(state);
  }, [hydrated, state]);

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
    if (archiveBackfillCodeRef.current || refreshingRef.current || document.hidden) return;
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/discover")) return;

    archiveBackfillCodeRef.current = fund.code;
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
      archiveBackfillCodeRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!hydrated || document.hidden || refreshingRef.current || state.funds.length === 0) return;

    const now = Date.now();
    const candidate = state.funds.find((fund) => {
      if (!needsArchiveBackfill(fund)) return false;
      const lastAttemptAt = archiveBackfillAttemptRef.current[fund.code] || 0;
      return now - lastAttemptAt >= 60_000;
    });

    if (!candidate) return;

    const timer = window.setTimeout(() => {
      void backfillFundArchives(candidate);
    }, 1200);

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

      setState((current) => ({
        ...current,
        funds: [snapshot, ...current.funds],
        searchHistory: [input.name, ...current.searchHistory.filter((item) => item !== input.name)].slice(0, 6),
        lastUpdatedAt: nowInMarket().format("YYYY-MM-DD HH:mm:ss"),
      }));
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
    setState((current) => ({
      ...current,
      transactions: {
        ...current.transactions,
        [code]: [
          {
            ...next,
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          },
          ...(current.transactions[code] || []),
        ].sort((a, b) => b.date.localeCompare(a.date)),
      },
    }));
  }, []);

  const removeTransaction = useCallback((code: string, id: string) => {
    setState((current) => ({
      ...current,
      transactions: {
        ...current.transactions,
        [code]: (current.transactions[code] || []).filter((item) => item.id !== id),
      },
    }));
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
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  }, []);

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
      window.localStorage.setItem("real-fund-mobile:state", JSON.stringify(seed.state));
      window.localStorage.setItem("real-fund-mobile:valuation-timeseries", JSON.stringify(seed.valuationSeries));
    }
    seedingRef.current = false;
    setSeeding(false);
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
      seedDemoData,
    }),
    [
      addFund,
      addTransaction,
      clearAll,
      clearHolding,
      clearSearchHistory,
      error,
      hydrated,
      passiveRefreshAt,
      refreshFunds,
      refreshing,
      removeFund,
      removeTransaction,
      search,
      recordSearchHistory,
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
