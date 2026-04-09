"use client";

export const IMPORTANT_UI_PREFERENCE_KEYS = [
  "real-fund-mobile:portfolio-column-visibility",
  "real-fund-mobile:portfolio-column-order",
  "real-fund-mobile:market-indices",
  "real-fund-mobile:manual-sync-upload-at",
  "real-fund-mobile:manual-sync-pull-at",
  "real-fund-mobile:manual-sync-export-at",
  "real-fund-mobile:manual-sync-import-at",
] as const;

export type ImportantPreferenceMap = Record<(typeof IMPORTANT_UI_PREFERENCE_KEYS)[number], string>;

export const readImportantPreferences = (): Partial<ImportantPreferenceMap> => {
  if (typeof window === "undefined") return {};

  return IMPORTANT_UI_PREFERENCE_KEYS.reduce<Partial<ImportantPreferenceMap>>((acc, key) => {
    const value = window.localStorage.getItem(key);
    if (value != null) {
      acc[key] = value;
    }
    return acc;
  }, {});
};

export const applyImportantPreferences = (preferences: Partial<ImportantPreferenceMap>) => {
  if (typeof window === "undefined") return;

  IMPORTANT_UI_PREFERENCE_KEYS.forEach((key) => {
    const value = preferences[key];
    if (typeof value === "string") {
      window.localStorage.setItem(key, value);
    }
  });
};
