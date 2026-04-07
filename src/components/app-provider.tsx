"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { fetchFundData, searchFunds } from "@/lib/fund-api";
import { defaultAppState, loadAppState, saveAppState } from "@/lib/storage";
import type { AppState, FundHolding, FundSnapshot, FundTransaction, SearchFundResult, ValuationPoint } from "@/lib/types";
import { clearValuationSeries, getAllValuationSeries, recordValuation } from "@/lib/valuation-timeseries";
import { buildDemoSeed } from "@/lib/demo-data";

type AppContextValue = {
  state: AppState;
  hydrated: boolean;
  refreshing: boolean;
  seeding: boolean;
  error: string;
  valuationSeries: Record<string, ValuationPoint[]>;
  search: (keyword: string) => Promise<SearchFundResult[]>;
  addFund: (input: SearchFundResult) => Promise<void>;
  refreshFunds: () => Promise<void>;
  removeFund: (code: string) => void;
  clearHolding: (code: string) => void;
  updateHolding: (code: string, next: FundHolding) => void;
  addTransaction: (code: string, next: Omit<FundTransaction, "id">) => void;
  removeTransaction: (code: string, id: string) => void;
  toggleFavorite: (code: string) => void;
  setRefreshMs: (value: number) => void;
  clearAll: () => void;
  seedDemoData: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(defaultAppState);
  const [hydrated, setHydrated] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState("");
  const [valuationSeries, setValuationSeries] = useState<Record<string, ValuationPoint[]>>({});
  const fundsRef = useRef<FundSnapshot[]>([]);
  const refreshingRef = useRef(false);
  const seedingRef = useRef(false);
  const didInitialRefreshRef = useRef(false);
  const refreshTokenRef = useRef(0);

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

    const token = ++refreshTokenRef.current;
    refreshingRef.current = true;
    setRefreshing(true);
    setError("");

    try {
      const refreshed = await Promise.all(
        fundsRef.current.map(async (fund) => {
          const nextFund = await fetchFundData(fund.code, fund);
          recordValuation(nextFund.code, { gsz: nextFund.gsz, gztime: nextFund.gztime });
          return nextFund;
        }),
      );

      if (token === refreshTokenRef.current) {
        setState((current) => ({
          ...current,
          funds: refreshed,
          lastUpdatedAt: new Date().toISOString(),
        }));
        setValuationSeries(getAllValuationSeries());
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
      refreshFunds();
    }, state.refreshMs);

    return () => window.clearInterval(timer);
  }, [hydrated, refreshFunds, state.funds.length, state.refreshMs]);

  const addFund = useCallback(async (input: SearchFundResult) => {
    if (fundsRef.current.some((item) => item.code === input.code)) return;

    refreshingRef.current = true;
    setRefreshing(true);
    setError("");

    try {
      const snapshot = await fetchFundData(input.code, {
        code: input.code,
        name: input.name,
      });

      recordValuation(snapshot.code, { gsz: snapshot.gsz, gztime: snapshot.gztime });
      setValuationSeries(getAllValuationSeries());

      setState((current) => ({
        ...current,
        funds: [snapshot, ...current.funds],
        searchHistory: [input.name, ...current.searchHistory.filter((item) => item !== input.name)].slice(0, 6),
        lastUpdatedAt: new Date().toISOString(),
      }));
      didInitialRefreshRef.current = true;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "添加基金失败");
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
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

  const clearAll = useCallback(() => {
    refreshTokenRef.current += 1;
    refreshingRef.current = false;
    seedingRef.current = false;
    setRefreshing(false);
    setSeeding(false);
    setError("");
    didInitialRefreshRef.current = false;
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

  const search = useCallback(async (keyword: string) => searchFunds(keyword), []);

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      hydrated,
      refreshing,
      seeding,
      error,
      valuationSeries,
      search,
      addFund,
      refreshFunds,
      removeFund,
      clearHolding,
      updateHolding,
      addTransaction,
      removeTransaction,
      toggleFavorite,
      setRefreshMs,
      clearAll,
      seedDemoData,
    }),
    [addFund, addTransaction, clearAll, clearHolding, error, hydrated, refreshFunds, refreshing, removeFund, removeTransaction, search, seeding, seedDemoData, setRefreshMs, state, toggleFavorite, updateHolding, valuationSeries],
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
