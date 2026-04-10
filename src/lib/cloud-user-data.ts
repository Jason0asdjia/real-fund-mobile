"use client";

import { defaultAppState, normalizeAppState } from "@/lib/storage";
import { isSupabaseConfigured, supabase } from "@/lib/supabase-client";
import { nowInMarket } from "@/lib/time";
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
  schemaVersion: number;
  sync: {
    dataVersion: number;
    updatedAt: string | null;
    deviceId: string;
    contentHash: string;
  };
  coreState: CloudCoreState;
  preferences: Partial<ImportantPreferenceMap>;
};

export type CloudUserDataMeta = CloudUserDataPayload["sync"] & {
  schemaVersion: number;
};

const buildPayloadContentHash = (coreState: CloudCoreState, preferences: Partial<ImportantPreferenceMap>) => JSON.stringify({ coreState, preferences });

export const createCloudPayload = (state: AppState, preferences: Partial<ImportantPreferenceMap>): CloudUserDataPayload => ({
  schemaVersion: 2,
  sync: {
    dataVersion: Math.max(state.sync.dataVersion, 1),
    updatedAt: state.sync.updatedAt ?? state.lastUpdatedAt,
    deviceId: state.sync.deviceId,
    contentHash: buildPayloadContentHash({
      funds: state.funds.map((fund) => ({ code: fund.code, name: fund.name || fund.code })),
      holdings: state.holdings,
      transactions: state.transactions,
      refreshMs: state.refreshMs,
      searchHistory: state.searchHistory,
      favorites: state.favorites,
    }, preferences),
  },
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

  const coreState = {
    funds: mergeFunds(localPayload.coreState.funds, cloudPayload.coreState.funds),
    holdings: mergedHoldings,
    transactions: mergedTransactions,
    refreshMs: localPayload.coreState.refreshMs || cloudPayload.coreState.refreshMs,
    searchHistory: mergedSearchHistory,
    favorites: mergedFavorites,
  };

  const preferences = {
    ...cloudPayload.preferences,
    ...localPayload.preferences,
  };

  const dataVersion = Math.max(localPayload.sync.dataVersion || 1, cloudPayload.sync.dataVersion || 1) + 1;
  const updatedAt = nowInMarket().format("YYYY-MM-DD HH:mm:ss");
  const deviceId = localPayload.sync.deviceId || cloudPayload.sync.deviceId || "";

  return {
    schemaVersion: Math.max(localPayload.schemaVersion || 1, cloudPayload.schemaVersion || 1, 2),
    sync: {
      dataVersion,
      updatedAt,
      deviceId,
      contentHash: buildPayloadContentHash(coreState, preferences),
    },
    coreState,
    preferences,
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
    sync: {
      dataVersion: Number(payload?.sync?.dataVersion) || 1,
      lastSyncedVersion: Number(payload?.sync?.dataVersion) || 1,
      updatedAt: payload?.sync?.updatedAt ?? null,
      lastSyncedAt: payload?.sync?.updatedAt ?? null,
      deviceId: payload?.sync?.deviceId ?? "",
    },
  });
};

const parseCloudPayload = (rawPayload: unknown): CloudUserDataPayload | null => {
  if (!isPlainObject(rawPayload)) return null;

  const schemaVersion = Number(rawPayload.schemaVersion ?? rawPayload.version);
  const coreState = rawPayload.coreState;
  const preferences = rawPayload.preferences;
  const sync = rawPayload.sync;
  const normalizedCoreState = isPlainObject(coreState)
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
      };
  const normalizedPreferences = isPlainObject(preferences) ? (preferences as Partial<ImportantPreferenceMap>) : {};
  const normalizedSync = isPlainObject(sync)
    ? {
        dataVersion: Number(sync.dataVersion) || 1,
        updatedAt: typeof sync.updatedAt === "string" ? sync.updatedAt : null,
        deviceId: typeof sync.deviceId === "string" ? sync.deviceId : "",
        contentHash: typeof sync.contentHash === "string" && sync.contentHash
          ? sync.contentHash
          : buildPayloadContentHash(normalizedCoreState, normalizedPreferences),
      }
    : {
        dataVersion: 1,
        updatedAt: null,
        deviceId: "",
        contentHash: buildPayloadContentHash(normalizedCoreState, normalizedPreferences),
      };

  return {
    schemaVersion: Number.isFinite(schemaVersion) ? schemaVersion : 1,
    sync: normalizedSync,
    coreState: normalizedCoreState,
    preferences: normalizedPreferences,
  };
};

const parseCloudUserMetaRecord = (value: unknown): CloudUserDataMeta | null => {
  if (!isPlainObject(value)) return null;

  const dataVersion = Number(value.data_version);
  const contentHash = typeof value.content_hash === "string" ? value.content_hash : "";
  const deviceId = typeof value.device_id === "string" ? value.device_id : "";
  const payload = parseCloudPayload(value.payload);

  if (!payload && !Number.isFinite(dataVersion) && !contentHash && !deviceId) {
    return null;
  }

  return {
    schemaVersion: payload?.schemaVersion ?? 1,
    dataVersion: Number.isFinite(dataVersion) && dataVersion >= 1 ? dataVersion : (payload?.sync.dataVersion ?? 1),
    updatedAt: payload?.sync.updatedAt ?? null,
    deviceId: deviceId || payload?.sync.deviceId || "",
    contentHash: contentHash || payload?.sync.contentHash || "",
  };
};

export const fetchCloudUserMeta = async (userId: string): Promise<CloudUserDataMeta | null> => {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data, error } = await supabase
    .from(USER_APP_DATA_TABLE)
    .select("data_version, content_hash, device_id, payload")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return parseCloudUserMetaRecord(data);
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

  return parseCloudPayload(data?.payload);
};

export const upsertCloudUserData = async (userId: string, payload: CloudUserDataPayload) => {
  if (!isSupabaseConfigured || !supabase) return;

  const { error } = await supabase
    .from(USER_APP_DATA_TABLE)
    .upsert({
      user_id: userId,
      data_version: payload.sync.dataVersion,
      content_hash: payload.sync.contentHash,
      device_id: payload.sync.deviceId,
      payload,
    }, { onConflict: "user_id" });

  if (error) {
    throw error;
  }
};
