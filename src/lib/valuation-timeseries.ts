import type { ValuationPoint } from "@/lib/types";

const STORAGE_KEY = "real-fund-mobile:valuation-timeseries";
const MAX_POINTS = 240;

const readStore = (): Record<string, ValuationPoint[]> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeStore = (data: Record<string, ValuationPoint[]>) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

export const getAllValuationSeries = () => readStore();

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
