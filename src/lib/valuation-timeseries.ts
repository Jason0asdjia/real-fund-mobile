import type { ValuationPoint } from "@/lib/types";

export const VALUATION_TIMESERIES_KEY = "real-fund-mobile:valuation-timeseries";
const MAX_POINTS = 240;

const isPlainObject = (value: unknown): value is Record<string, unknown> => value != null && typeof value === "object" && !Array.isArray(value);

const normalizeValuationPoint = (value: unknown): ValuationPoint | null => {
  if (!isPlainObject(value)) return null;
  const date = typeof value.date === "string" ? value.date : "";
  const time = typeof value.time === "string" ? value.time : "";
  const numeric = Number(value.value);
  if (!date || !time || !Number.isFinite(numeric)) return null;
  return { date, time, value: numeric };
};

export const normalizeValuationSeries = (value: unknown): Record<string, ValuationPoint[]> => {
  if (!isPlainObject(value)) return {};
  const normalized: Record<string, ValuationPoint[]> = {};

  Object.entries(value).forEach(([code, points]) => {
    if (!Array.isArray(points)) return;
    const sanitized = points
      .map((item) => normalizeValuationPoint(item))
      .filter((item): item is ValuationPoint => item != null)
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
      .slice(-MAX_POINTS);

    if (sanitized.length > 0) {
      normalized[code] = sanitized;
    }
  });

  return normalized;
};

const readStore = (): Record<string, ValuationPoint[]> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(VALUATION_TIMESERIES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return normalizeValuationSeries(parsed);
  } catch {
    return {};
  }
};

const writeStore = (data: Record<string, ValuationPoint[]>) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VALUATION_TIMESERIES_KEY, JSON.stringify(data));
};

export const getAllValuationSeries = () => readStore();

export const setAllValuationSeries = (value: unknown) => {
  const normalized = normalizeValuationSeries(value);
  writeStore(normalized);
  return normalized;
};

export const clearValuationSeries = (code: string) => {
  const current = readStore();
  if (!(code in current)) return;
  delete current[code];
  writeStore(current);
};

export const recordValuation = (code: string, payload: { gsz?: number | null; gztime?: string | null }) => {
  const nextValue = Number(payload.gsz);
  const gztime = payload.gztime;
  if (!Number.isFinite(nextValue) || !gztime) return readStore()[code] || [];

  const date = gztime.slice(0, 10);
  const time = gztime.slice(11, 16);
  const point = { time, value: nextValue, date };
  const all = readStore();
  const existing = Array.isArray(all[code]) ? all[code] : [];

  const merged = [...existing.filter((item) => !(item.date === date && item.time === time)), point]
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .slice(-MAX_POINTS);

  all[code] = merged;
  writeStore(all);
  return merged;
};
