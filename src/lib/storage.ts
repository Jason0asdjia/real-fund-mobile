import type { AppState } from "@/lib/types";

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

export const loadAppState = (): AppState => {
  if (typeof window === "undefined") return defaultAppState;
  try {
    const raw = window.localStorage.getItem(APP_STATE_KEY);
    if (!raw) return defaultAppState;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      ...defaultAppState,
      ...parsed,
      funds: Array.isArray(parsed.funds) ? parsed.funds : [],
      holdings: parsed.holdings && typeof parsed.holdings === "object" ? parsed.holdings : {},
      transactions: parsed.transactions && typeof parsed.transactions === "object" ? parsed.transactions : {},
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      searchHistory: Array.isArray(parsed.searchHistory) ? parsed.searchHistory : [],
    };
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
