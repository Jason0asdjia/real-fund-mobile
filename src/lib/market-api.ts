type JsonpEnvelope<T> = {
  data?: T;
};

type FastNewsRow = {
  showTime?: string;
  summary?: string;
  title?: string;
};

type FundBoardRow = {
  f12?: string;
  f13?: number;
  f14?: string;
  f3?: number;
};

export type MarketSnapshotItem = {
  label: string;
  value: string;
  change: number;
};

export type HotSectorItem = {
  name: string;
  change: number;
  points: number[];
};

export type FastNewsItem = {
  time: string;
  text: string;
};

const JSONP_TIMEOUT_MS = 8000;

const INDEX_TARGETS = [
  { label: "上证指数", code: "sh000001", varKey: "v_sh000001" },
  { label: "恒生指数", code: "hkHSI", varKey: "v_hkHSI" },
  { label: "纳斯达克", code: "usIXIC", varKey: "v_usIXIC" },
] as const;

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const formatValue = (value: number | null): string => {
  if (value == null) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseTencentIndexRaw = (raw: unknown): { value: number | null; change: number } => {
  if (typeof raw !== "string" || !raw) return { value: null, change: 0 };
  const parts = raw.split("~");
  const value = toNumber(parts[3]);
  const change = toNumber(parts[32]) ?? 0;
  return { value, change };
};

const loadScript = (url: string) =>
  new Promise<void>((resolve, reject) => {
    if (typeof document === "undefined" || !document.body) {
      reject(new Error("No browser environment"));
      return;
    }

    const script = document.createElement("script");
    let finished = false;

    const finalize = (handler: () => void) => {
      if (finished) return;
      finished = true;
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
      handler();
    };

    script.src = url;
    script.async = true;
    script.onload = () => finalize(resolve);
    script.onerror = () => finalize(() => reject(new Error("Market script load failed")));

    document.body.appendChild(script);
    window.setTimeout(() => finalize(() => reject(new Error("Market script timeout"))), JSONP_TIMEOUT_MS);
  });

const jsonp = <T>(url: string, callbackParam = "cb"): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    if (typeof document === "undefined" || !document.body || typeof window === "undefined") {
      reject(new Error("No browser environment"));
      return;
    }

    const callbackName = `MarketJsonp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const script = document.createElement("script");
    const callbackContainer = window as unknown as Record<string, unknown>;
    let finished = false;

    const finalize = (fn: () => void) => {
      if (finished) return;
      finished = true;
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
      delete callbackContainer[callbackName];
      fn();
    };

    callbackContainer[callbackName] = (payload: unknown) => {
      finalize(() => resolve(payload as T));
    };

    script.onerror = () => {
      finalize(() => reject(new Error("Market JSONP request failed")));
    };

    const separator = url.includes("?") ? "&" : "?";
    script.src = `${url}${separator}${callbackParam}=${callbackName}`;
    script.async = true;
    document.body.appendChild(script);

    window.setTimeout(() => {
      finalize(() => reject(new Error("Market JSONP timeout")));
    }, JSONP_TIMEOUT_MS);
  });

const buildSectorPoints = (change: number): number[] => {
  const base = [7, 8, 7, 10, 9, 12, 11, 13, 14, 16, 18];
  const trend = Math.max(-1, Math.min(1, change / 4));
  return base.map((point, index) => {
    const drift = ((index / (base.length - 1)) * 2 - 1) * trend * 2.4;
    const next = point + drift;
    return Math.max(1, Math.min(19, Number(next.toFixed(2))));
  });
};

const normalizeFundBoardName = (name: string) => {
  const cleaned = name
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/\s+/g, "")
    .replace(/联接|场内|场外|指数增强|LOF|QDII/gi, "");
  const etfIndex = cleaned.toUpperCase().indexOf("ETF");
  const base = etfIndex > 0 ? cleaned.slice(0, etfIndex) : cleaned;
  return base || name;
};

export const fetchMarketSnapshot = async (): Promise<MarketSnapshotItem[]> => {
  const codes = INDEX_TARGETS.map((item) => item.code).join(",");
  await loadScript(`https://qt.gtimg.cn/q=${encodeURIComponent(codes)}&_t=${Date.now()}`);
  const source = window as unknown as Record<string, unknown>;

  return INDEX_TARGETS.map((target) => {
    const parsed = parseTencentIndexRaw(source[target.varKey]);
    return {
      label: target.label,
      value: formatValue(parsed.value),
      change: parsed.change,
    };
  });
};

export const fetchHotSectors = async (limit = 2): Promise<HotSectorItem[]> => {
  const url = "https://88.push2delay.eastmoney.com/api/qt/clist/get?pn=1&pz=60&po=1&np=1&fltt=2&invt=2&fid=f3&fs=b:MK0021,b:MK0022,b:MK0023,b:MK0024&fields=f12,f13,f14,f3";
  const response = await jsonp<JsonpEnvelope<{ diff?: FundBoardRow[] }>>(url);
  const rows = Array.isArray(response.data?.diff) ? response.data.diff : [];

  const grouped = new Map<string, number[]>();
  rows.forEach((row) => {
    const rawName = typeof row.f14 === "string" ? row.f14.trim() : "";
    if (!rawName) return;
    const boardName = normalizeFundBoardName(rawName);
    if (!boardName) return;
    const rawChange = toNumber(row.f3);
    if (rawChange == null) return;
    const change = Math.abs(rawChange) > 100 ? rawChange / 100 : rawChange;
    const list = grouped.get(boardName) || [];
    list.push(change);
    grouped.set(boardName, list);
  });

  return [...grouped.entries()]
    .map(([name, changes]) => ({
      name,
      change: changes.reduce((sum, value) => sum + value, 0) / changes.length,
      points: buildSectorPoints(changes[0] ?? 0),
    }))
    .sort((a, b) => b.change - a.change)
    .slice(0, limit);
};

const parseNewsTime = (showTime?: string) => {
  if (!showTime) return "--:--";
  const match = showTime.match(/(\d{2}:\d{2})/);
  return match ? match[1] : "--:--";
};

export const fetchFastNews = async (limit = 4): Promise<FastNewsItem[]> => {
  const url = `https://np-weblist.eastmoney.com/comm/web/getFastNewsList?client=web&biz=web_724&fastColumn=102&sortEnd=&pageSize=${Math.max(limit, 8)}&req_trace=${Date.now()}`;
  const response = await jsonp<JsonpEnvelope<{ fastNewsList?: FastNewsRow[] }>>(url, "callback");
  const rows = Array.isArray(response.data?.fastNewsList) ? response.data.fastNewsList : [];

  return rows
    .map((row) => {
      const text = (row.summary || row.title || "").trim();
      return {
        time: parseNewsTime(row.showTime),
        text,
      };
    })
    .filter((item) => item.text)
    .slice(0, limit);
};
