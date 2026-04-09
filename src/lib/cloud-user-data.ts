"use client";

import { defaultAppState, normalizeAppState } from "@/lib/storage";
import { isSupabaseConfigured, supabase } from "@/lib/supabase-client";
import { readImportantPreferences, type ImportantPreferenceMap } from "@/lib/user-preferences";
import type { AppState, FundSnapshot } from "@/lib/types";

export const USER_APP_DATA_TABLE = "user_app_data";

export type CloudCoreState = {
  funds: Array<Pick<FundSnapshot, "code" | "name">>;
  holdings: AppState["holdings"];
  transactions: AppState["transactions"];
  refreshMs: number;
  searchHistory: string[];
  favorites: string[];
};

export type CloudUserDataPayload = {
  version: number;
  coreState: CloudCoreState;
  preferences: Partial<ImportantPreferenceMap>;
};

export const createCloudPayload = (state: AppState, preferences: Partial<ImportantPreferenceMap>): CloudUserDataPayload => ({
  version: 1,
  coreState: {
    funds: state.funds.map((fund) => ({ code: fund.code, name: fund.name || fund.code })),
    holdings: state.holdings,
    transactions: state.transactions,
    refreshMs: state.refreshMs,
    searchHistory: state.searchHistory,
    favorites: state.favorites,
  },
  preferences,
});

const isPlainObject = (value: unknown): value is Record<string, unknown> => value != null && typeof value === "object" && !Array.isArray(value);

export const buildCloudPayloadFromState = (state: AppState): CloudUserDataPayload => {
  return createCloudPayload(state, readImportantPreferences());
};

const hasAnyMeaningfulValue = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim().length > 0;
  return false;
};

export const hasMeaningfulCloudData = (payload: CloudUserDataPayload): boolean => {
  const core = payload.coreState;
  return [
    core.funds,
    core.holdings,
    core.transactions,
    core.searchHistory,
    core.favorites,
    payload.preferences,
  ].some((item) => hasAnyMeaningfulValue(item));
};

const mergeFunds = (localFunds: CloudCoreState["funds"], cloudFunds: CloudCoreState["funds"]) => {
  const mergedMap = new Map<string, Pick<FundSnapshot, "code" | "name">>();

  [...cloudFunds, ...localFunds].forEach((fund) => {
    if (!fund?.code) return;
    const existing = mergedMap.get(fund.code);
    mergedMap.set(fund.code, {
      code: fund.code,
      name: fund.name || existing?.name || fund.code,
    });
  });

  return Array.from(mergedMap.values());
};

export const mergeCloudPayloads = (localPayload: CloudUserDataPayload, cloudPayload: CloudUserDataPayload): CloudUserDataPayload => {
  const mergedTransactions = { ...cloudPayload.coreState.transactions };
  Object.entries(localPayload.coreState.transactions).forEach(([code, items]) => {
    const cloudItems = mergedTransactions[code] || [];
    const byId = new Map<string, AppState["transactions"][string][number]>();
    [...cloudItems, ...items].forEach((item) => {
      if (!item?.id) return;
      byId.set(item.id, item);
    });
    mergedTransactions[code] = Array.from(byId.values()).sort((a, b) => b.date.localeCompare(a.date));
  });

  const mergedHoldings = { ...cloudPayload.coreState.holdings };
  Object.entries(localPayload.coreState.holdings).forEach(([code, holding]) => {
    const cloudHolding = mergedHoldings[code];
    if (!cloudHolding) {
      mergedHoldings[code] = holding;
      return;
    }

    const localScore = Number(holding?.share != null) + Number(holding?.cost != null);
    const cloudScore = Number(cloudHolding?.share != null) + Number(cloudHolding?.cost != null);
    mergedHoldings[code] = localScore >= cloudScore ? holding : cloudHolding;
  });

  const mergedSearchHistory = Array.from(new Set([...localPayload.coreState.searchHistory, ...cloudPayload.coreState.searchHistory])).slice(0, 20);
  const mergedFavorites = Array.from(new Set([...localPayload.coreState.favorites, ...cloudPayload.coreState.favorites]));

  return {
    version: Math.max(localPayload.version || 1, cloudPayload.version || 1),
    coreState: {
      funds: mergeFunds(localPayload.coreState.funds, cloudPayload.coreState.funds),
      holdings: mergedHoldings,
      transactions: mergedTransactions,
      refreshMs: localPayload.coreState.refreshMs || cloudPayload.coreState.refreshMs,
      searchHistory: mergedSearchHistory,
      favorites: mergedFavorites,
    },
    preferences: {
      ...cloudPayload.preferences,
      ...localPayload.preferences,
    },
  };
};

export const hydrateAppStateFromCloudPayload = (payload: CloudUserDataPayload): AppState => {
  const core = payload?.coreState;
  return normalizeAppState({
    ...defaultAppState,
    funds: Array.isArray(core?.funds) ? core.funds : [],
    holdings: isPlainObject(core?.holdings) ? core.holdings : {},
    transactions: isPlainObject(core?.transactions) ? core.transactions : {},
    refreshMs: core?.refreshMs,
    searchHistory: core?.searchHistory,
    favorites: core?.favorites,
  });
};

export const fetchCloudUserData = async (userId: string): Promise<CloudUserDataPayload | null> => {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data, error } = await supabase
    .from(USER_APP_DATA_TABLE)
    .select("payload")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.payload || !isPlainObject(data.payload)) {
    return null;
  }

  const rawPayload = data.payload as Record<string, unknown>;
  const version = Number(rawPayload.version);
  const coreState = rawPayload.coreState;
  const preferences = rawPayload.preferences;

  return {
    version: Number.isFinite(version) ? version : 1,
    coreState: isPlainObject(coreState)
      ? {
          funds: Array.isArray(coreState.funds) ? (coreState.funds as Array<Pick<FundSnapshot, "code" | "name">>) : [],
          holdings: isPlainObject(coreState.holdings) ? (coreState.holdings as CloudCoreState["holdings"]) : {},
          transactions: isPlainObject(coreState.transactions) ? (coreState.transactions as CloudCoreState["transactions"]) : {},
          refreshMs: Number(coreState.refreshMs) || defaultAppState.refreshMs,
          searchHistory: Array.isArray(coreState.searchHistory) ? (coreState.searchHistory as string[]) : [],
          favorites: Array.isArray(coreState.favorites) ? (coreState.favorites as string[]) : [],
        }
      : {
          funds: [],
          holdings: {},
          transactions: {},
          refreshMs: defaultAppState.refreshMs,
          searchHistory: [],
          favorites: [],
        },
    preferences: isPlainObject(preferences) ? (preferences as Partial<ImportantPreferenceMap>) : {},
  };
};

export const upsertCloudUserData = async (userId: string, payload: CloudUserDataPayload) => {
  if (!isSupabaseConfigured || !supabase) return;

  const { error } = await supabase
    .from(USER_APP_DATA_TABLE)
    .upsert({
      user_id: userId,
      payload,
    }, { onConflict: "user_id" });

  if (error) {
    throw error;
  }
};
