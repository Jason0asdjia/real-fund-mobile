import type { FundHoldingStock, FundSnapshot, SearchFundResult } from "@/lib/types";
import { nowInMarket } from "@/lib/time";

const FUND_GZ_TIMEOUT_MS = 8000;
const OFFICIAL_SOURCE_TIMEOUT_MS = 8000;
const HOLDINGS_CACHE_MS = 60 * 60 * 1000;
const PROFILE_CACHE_MS = 6 * 60 * 60 * 1000;
const ESTIMATE_CACHE_MS = 45 * 1000;

const SOURCE_MIN_INTERVAL_MS = {
  eastmoneyEstimate: 1200,
  eastmoneyHistory: 1000,
  tencentQuote: 1500,
  danjuanQuote: 2000,
  eastmoneySearch: 800,
} as const;

type CachedData<T> = {
  data: T;
  ts: number;
};

const holdingsCache = new Map<string, CachedData<{ holdings: FundHoldingStock[]; holdingsReportDate: string | null; holdingsIsLastQuarter: boolean }>>();
const profileCache = new Map<string, CachedData<Pick<FundSnapshot, "fundType" | "riskLevel" | "fundManager" | "fundCompany" | "fundScale" | "trackingTarget" | "inceptionDate">>>();
const estimateCache = new Map<string, CachedData<FundSnapshot>>();
const sourceLastRequestAt = new Map<keyof typeof SOURCE_MIN_INTERVAL_MS, number>();
const sourceQueue = new Map<keyof typeof SOURCE_MIN_INTERVAL_MS, Promise<void>>();
const previewInFlight = new Map<string, Promise<FundSnapshot>>();
const fullInFlight = new Map<string, Promise<FundSnapshot>>();

type RequestMode = "throttled" | "interactive";

type OfficialQuoteSnapshot = {
  latestNav: number | null;
  latestDate: string | null;
  latestGrowth: number | null;
  previousNav: number | null;
  name?: string | null;
  source: "history" | "tencent" | "danjuan";
};

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const runWithSourceInterval = async <T>(
  source: keyof typeof SOURCE_MIN_INTERVAL_MS,
  task: () => Promise<T>,
  mode: RequestMode = "throttled",
): Promise<T> => {
  if (mode === "interactive") {
    sourceLastRequestAt.set(source, Date.now());
    return task();
  }

  const previous = sourceQueue.get(source) || Promise.resolve();

  const nextTask = previous
    .catch(() => undefined)
    .then(async () => {
      const lastAt = sourceLastRequestAt.get(source) || 0;
      const wait = SOURCE_MIN_INTERVAL_MS[source] - (Date.now() - lastAt);
      if (wait > 0) {
        await sleep(wait);
      }

      sourceLastRequestAt.set(source, Date.now());
    });

  sourceQueue.set(source, nextTask);
  await nextTask;
  return task();
};

const runWithSourcePriority = async <T>(
  source: keyof typeof SOURCE_MIN_INTERVAL_MS,
  task: () => Promise<T>,
  priority: "high" | "normal" | "interactive" = "normal",
): Promise<T> => {
  if (priority === "interactive") {
    return runWithSourceInterval(source, task, "interactive");
  }

  if (priority === "high") {
    sourceLastRequestAt.set(source, 0);
  }
  return runWithSourceInterval(source, task);
};

const withInFlightDedup = <T>(store: Map<string, Promise<T>>, key: string, factory: () => Promise<T>) => {
  const existing = store.get(key);
  if (existing) return existing;

  const created = factory().finally(() => {
    if (store.get(key) === created) {
      store.delete(key);
    }
  });
  store.set(key, created);
  return created;
};

const toFiniteNumber = (value: unknown) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const resolveOfficialConfirmationMeta = (
  previousFund: FundSnapshot | null | undefined,
  officialDate: string | null,
) => {
  if (!officialDate) {
    return {
      officialConfirmedAt: previousFund?.officialConfirmedAt ?? null,
      officialConfirmedForDate: previousFund?.officialConfirmedForDate ?? null,
    };
  }

  if (previousFund?.officialConfirmedForDate === officialDate && previousFund.officialConfirmedAt) {
    return {
      officialConfirmedAt: previousFund.officialConfirmedAt,
      officialConfirmedForDate: officialDate,
    };
  }

  return {
    officialConfirmedAt: nowInMarket().format("YYYY-MM-DD HH:mm:ss"),
    officialConfirmedForDate: officialDate,
  };
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, reason: string): Promise<T> => {
  let timer: number | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(reason)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== null) window.clearTimeout(timer);
  }
};

const normalizeDate = (value?: string | null) => {
  if (!value) return null;
  const date = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  if (/^\d{8}$/.test(date)) return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  const matched = date.match(/(\d{4})[-/]?(\d{2})[-/]?(\d{2})/);
  if (!matched) return null;
  return `${matched[1]}-${matched[2]}-${matched[3]}`;
};

const hasValidEstimateFields = (snapshot: Pick<FundSnapshot, "gsz" | "gszzl" | "gztime">) => {
  const estimateNav = toFiniteNumber(snapshot.gsz);
  const estimateGrowth = toFiniteNumber(snapshot.gszzl);
  const estimateTime = typeof snapshot.gztime === "string" ? snapshot.gztime.trim() : "";
  return estimateNav != null && estimateGrowth != null && Boolean(estimateTime);
};

const loadScript = (url: string) =>
  new Promise<any>((resolve, reject) => {
    if (typeof document === "undefined" || !document.body) {
      reject(new Error("No browser environment"));
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => {
      if (document.body.contains(script)) document.body.removeChild(script);
      resolve((window as any).apidata);
    };
    script.onerror = () => {
      if (document.body.contains(script)) document.body.removeChild(script);
      reject(new Error("Script load failed"));
    };
    document.body.appendChild(script);
  });

const stripHtml = (value: string) =>
  value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

const parseNetValuesFromHtml = (content: string) => {
  if (!content || content.includes("暂无数据")) return [];
  const rowMatches = content.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const results: Array<{ date: string; nav: number; growth: number | null }> = [];

  for (const row of rowMatches) {
    const cells = row.match(/<td[^>]*>(.*?)<\/td>/gi) || [];
    if (cells.length < 2) continue;
    const text = cells.map((cell) => stripHtml(cell));
    const date = text[0];
    const nav = Number(text[1]);
    const growthCell = text.find((item) => /%/.test(item));
    const growth = growthCell ? Number(growthCell.replace("%", "")) : null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(nav)) {
      results.push({ date, nav, growth: Number.isFinite(growth) ? growth : null });
    }
  }

  return results.reverse();
};

const parseHoldingsReportDate = (content: string): string | null => {
  if (!content) return null;
  const text = stripHtml(content);
  const reportMatch = text.match(/(\d{4}-\d{2}-\d{2})\s*(?:季报|年报|中报|报告期|截止)/);
  if (reportMatch) return reportMatch[1];
  const dateOnlyMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return dateOnlyMatch ? dateOnlyMatch[1] : null;
};

const isLastQuarterReport = (reportDate: string | null): boolean => {
  if (!reportDate) return false;
  const now = nowInMarket();
  const month = now.month() + 1;
  const quarterEndMonth = month <= 3 ? 12 : month <= 6 ? 3 : month <= 9 ? 6 : 9;
  const quarterEndYear = month <= 3 ? now.year() - 1 : now.year();
  const quarterEndDate = `${quarterEndYear}-${String(quarterEndMonth).padStart(2, "0")}-${quarterEndMonth === 12 || quarterEndMonth === 3 ? "31" : "30"}`;
  return reportDate >= quarterEndDate;
};

const parseHoldingsFromHtml = (content: string): FundHoldingStock[] => {
  if (!content || content.includes("暂无数据")) return [];

  const headMatch = content.match(/<thead[\s\S]*?<\/thead>/i)?.[0] || "";
  const headCells = (headMatch.match(/<th[\s\S]*?<\/th>/gi) || []).map((item) => stripHtml(item).replace(/\s+/g, ""));

  let idxCode = -1;
  let idxName = -1;
  let idxWeight = -1;
  headCells.forEach((cell, index) => {
    if (idxCode < 0 && (cell.includes("股票代码") || cell.includes("证券代码"))) idxCode = index;
    if (idxName < 0 && (cell.includes("股票名称") || cell.includes("证券名称"))) idxName = index;
    if (idxWeight < 0 && (cell.includes("占净值比例") || cell.includes("占比"))) idxWeight = index;
  });

  const bodyMatch = content.match(/<tbody[\s\S]*?<\/tbody>/i)?.[0] || content;
  const rows = bodyMatch.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const holdings: FundHoldingStock[] = [];

  rows.forEach((row) => {
    const cells = (row.match(/<td[\s\S]*?<\/td>/gi) || []).map((item) => stripHtml(item));
    if (!cells.length) return;

    let code = "";
    let name = "";
    let weight = "";

    if (idxCode >= 0 && cells[idxCode]) {
      code = cells[idxCode].match(/\d{5,6}/)?.[0] || cells[idxCode];
    } else {
      code = cells.find((item) => /^\d{5,6}$/.test(item)) || "";
    }

    if (idxName >= 0 && cells[idxName]) {
      name = cells[idxName];
    } else {
      name = cells.find((item) => item && item !== code && !/%/.test(item)) || "";
    }

    if (idxWeight >= 0 && cells[idxWeight]) {
      const weightNum = cells[idxWeight].match(/([\d.]+)\s*%/)?.[1];
      weight = weightNum ? `${weightNum}%` : cells[idxWeight];
    } else {
      const matched = cells.find((item) => /[\d.]+\s*%/.test(item));
      const weightNum = matched?.match(/([\d.]+)\s*%/)?.[1];
      weight = weightNum ? `${weightNum}%` : "";
    }

    if (code || name || weight) {
      holdings.push({ code, name, weight, change: null });
    }
  });

  return holdings.slice(0, 10);
};

const fetchHistoricalNetValues = async (code: string) => {
  const url = `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code=${code}&page=1&per=2&sdate=&edate=`;
  const apidata = await withTimeout(
    runWithSourceInterval("eastmoneyHistory", () => loadScript(url)),
    OFFICIAL_SOURCE_TIMEOUT_MS,
    "Eastmoney history timeout",
  );
  return parseNetValuesFromHtml(apidata?.content || "");
};

const fetchHistoricalNetValuesPage = async (code: string, page: number, per: number, sdate = "") => {
  const startDate = sdate ? encodeURIComponent(sdate) : "";
  const url = `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code=${code}&page=${page}&per=${per}&sdate=${startDate}&edate=`;
  return withTimeout(
    runWithSourceInterval("eastmoneyHistory", () => loadScript(url)),
    OFFICIAL_SOURCE_TIMEOUT_MS,
    "Eastmoney history page timeout",
  );
};

export type FundHistoricalNavPoint = {
  date: string;
  nav: number;
};

export const fetchFundHistoricalNavSeries = async (code: string, maxCount = 240, sinceDate?: string): Promise<FundHistoricalNavPoint[]> => {
  const per = 49;
  const firstPage = await fetchHistoricalNetValuesPage(code, 1, per, sinceDate || "");
  const totalPages = Math.max(1, Number(firstPage?.pages) || 1);
  const cappedPages = Math.min(totalPages, Math.max(1, Math.ceil(maxCount / per)));
  const rows = parseNetValuesFromHtml(firstPage?.content || "");

  if (cappedPages > 1) {
    const restPages = await Promise.all(
      Array.from({ length: cappedPages - 1 }, (_, index) => fetchHistoricalNetValuesPage(code, index + 2, per, sinceDate || "")),
    );

    restPages.forEach((pageData) => {
      rows.push(...parseNetValuesFromHtml(pageData?.content || ""));
    });
  }

  const deduped = new Map<string, number>();
  rows.forEach((item) => {
    deduped.set(item.date, item.nav);
  });

  return [...deduped.entries()]
    .map(([date, nav]) => ({ date, nav }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-maxCount);
};

const requestTencentFundQuote = (code: string, priority: "high" | "normal" | "interactive" = "normal") =>
  runWithSourcePriority("tencentQuote", () =>
    withTimeout(
      new Promise<OfficialQuoteSnapshot>((resolve, reject) => {
        if (typeof document === "undefined" || !document.body) {
          reject(new Error("No browser environment"));
          return;
        }

        const key = `hq_str_jj${code}`;
        const script = document.createElement("script");
        script.src = `https://qt.gtimg.cn/q=jj${code}&r=${Date.now()}`;
        script.async = true;

        const cleanup = () => {
          if (document.body.contains(script)) document.body.removeChild(script);
        };

        script.onerror = () => {
          cleanup();
          reject(new Error("Tencent quote load failed"));
        };

        script.onload = () => {
          try {
            const raw = Reflect.get(window, key);
            cleanup();
            if (typeof raw !== "string") {
              reject(new Error("Tencent quote invalid"));
              return;
            }

            const fields = raw.split("~");
            const latestNav = toFiniteNumber(fields[5]);
            const latestGrowth = toFiniteNumber(fields[7]);
            const latestDate = normalizeDate(fields[8]);
            const previousNav = toFiniteNumber(fields[6]);
            const name = fields[1] || null;

            if (!latestNav || !latestDate) {
              reject(new Error("Tencent quote missing nav/date"));
              return;
            }

            resolve({
              latestNav,
              latestDate,
              latestGrowth,
              previousNav,
              name,
              source: "tencent",
            });
          } catch (error) {
            reject(error instanceof Error ? error : new Error("Tencent quote parse failed"));
          }
        };

        document.body.appendChild(script);
      }),
      OFFICIAL_SOURCE_TIMEOUT_MS,
      "Tencent quote timeout",
    ),
    priority,
  );

const requestDanjuanFundQuote = (code: string, priority: "high" | "normal" | "interactive" = "normal") =>
  runWithSourcePriority("danjuanQuote", () =>
    withTimeout(
      (async (): Promise<OfficialQuoteSnapshot> => {
        const response = await fetch(`https://danjuanfunds.com/djapi/fund/${encodeURIComponent(code)}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Danjuan quote request failed: ${response.status}`);

        const payload = await response.json() as Record<string, any>;
        const data = payload?.fund_derived || payload?.data?.fund_derived || payload?.data || payload;
        const latestNav = toFiniteNumber(data?.unit_nav);
        const latestDate = normalizeDate(data?.end_date);
        const latestGrowth = toFiniteNumber(data?.nav_growth ?? data?.nav_grtd);
        const previousNav = latestNav != null && latestGrowth != null && latestGrowth > -100
          ? latestNav / (1 + latestGrowth / 100)
          : null;

        if (!latestNav || !latestDate) throw new Error("Danjuan quote missing nav/date");

        return {
          latestNav,
          latestDate,
          latestGrowth,
          previousNav,
          name: payload?.fund_name || payload?.name || null,
          source: "danjuan",
        };
      })(),
      OFFICIAL_SOURCE_TIMEOUT_MS,
      "Danjuan quote timeout",
    ),
    priority,
  );

const buildOfficialFromHistory = (historyList: Array<{ date: string; nav: number; growth: number | null }>): OfficialQuoteSnapshot | null => {
  const latest = historyList.at(-1);
  if (!latest) return null;
  const previous = historyList.length > 1 ? historyList.at(-2) : null;
  return {
    latestNav: latest.nav,
    latestDate: latest.date,
    latestGrowth: toFiniteNumber(latest.growth),
    previousNav: previous?.nav ?? null,
    source: "history",
  };
};

const fetchOfficialQuoteWithFallback = async (code: string, mode: RequestMode = "throttled") => {
  const historyList = await fetchHistoricalNetValues(code);
  const historyQuote = buildOfficialFromHistory(historyList);
  if (historyQuote && historyQuote.latestDate) {
    return { historyList, official: historyQuote };
  }

  try {
    const tencentQuote = await requestTencentFundQuote(code, mode === "interactive" ? "interactive" : "normal");
    return { historyList, official: tencentQuote };
  } catch {
    // fallback to next provider
  }

  if (typeof window !== "undefined") {
    return { historyList, official: historyQuote };
  }

  const danjuanQuote = await requestDanjuanFundQuote(code, mode === "interactive" ? "interactive" : "normal");
  return { historyList, official: danjuanQuote };
};

const fetchFundArchivesContent = async (code: string, type: "jjcc" | "jbgk") => {
  const response = await fetch(`/api/fund-archives?code=${encodeURIComponent(code)}&type=${type}`);
  if (!response.ok) {
    throw new Error(`Fund archives request failed: ${type}`);
  }

  const data = (await response.json()) as { content?: string };
  return data.content || "";
};

const fetchHoldings = async (code: string): Promise<{ holdings: FundHoldingStock[]; holdingsReportDate: string | null; holdingsIsLastQuarter: boolean }> => {
  const cached = holdingsCache.get(code);
  if (cached && Date.now() - cached.ts < HOLDINGS_CACHE_MS) {
    return cached.data;
  }

  const content = await fetchFundArchivesContent(code, "jjcc");
  const holdingsReportDate = parseHoldingsReportDate(content);
  const holdingsIsLastQuarter = isLastQuarterReport(holdingsReportDate);
  const holdings = parseHoldingsFromHtml(content);
  const data = { holdings, holdingsReportDate, holdingsIsLastQuarter };

  holdingsCache.set(code, { data, ts: Date.now() });
  return data;
};

const parseProfileRows = (content: string) => {
  const rows = content.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const map = new Map<string, string>();
  rows.forEach((row) => {
    const cells = row.match(/<th[\s\S]*?<\/th>|<td[\s\S]*?<\/td>/gi) || [];
    for (let i = 0; i < cells.length - 1; i += 1) {
      const key = stripHtml(cells[i]).replace(/[：:]/g, "").trim();
      const value = stripHtml(cells[i + 1]);
      if (key && value && !map.has(key)) map.set(key, value);
    }
  });
  return map;
};

const pickProfileField = (rowMap: Map<string, string>, candidates: string[]) => {
  for (const key of candidates) {
    if (rowMap.has(key)) return rowMap.get(key) || null;
  }
  return null;
};

const hasProfileData = (profile: Pick<FundSnapshot, "fundType" | "riskLevel" | "fundManager" | "fundCompany" | "fundScale" | "trackingTarget" | "inceptionDate">) =>
  Boolean(profile.fundType || profile.riskLevel || profile.fundManager || profile.fundCompany || profile.fundScale || profile.trackingTarget || profile.inceptionDate);

const fetchFundProfile = async (code: string): Promise<Pick<FundSnapshot, "fundType" | "riskLevel" | "fundManager" | "fundCompany" | "fundScale" | "trackingTarget" | "inceptionDate">> => {
  const cached = profileCache.get(code);
  if (cached && Date.now() - cached.ts < PROFILE_CACHE_MS) {
    return cached.data;
  }

  const content = await fetchFundArchivesContent(code, "jbgk");
  const rowMap = parseProfileRows(content);

  const data = {
    fundType: pickProfileField(rowMap, ["基金类型", "类型"]),
    riskLevel: pickProfileField(rowMap, ["风险等级", "风险收益特征"]),
    fundManager: pickProfileField(rowMap, ["基金经理", "基金管理人"]),
    fundCompany: pickProfileField(rowMap, ["管理人", "基金管理人", "基金公司"]),
    fundScale: pickProfileField(rowMap, ["基金规模", "资产规模"]),
    trackingTarget: pickProfileField(rowMap, ["跟踪标的", "业绩比较基准"]),
    inceptionDate: pickProfileField(rowMap, ["成立日期", "发行日期"]),
  };

  profileCache.set(code, { data, ts: Date.now() });
  return data;
};

const requestFundEstimateData = (code: string, priority: "high" | "normal" | "interactive" = "normal") =>
  runWithSourcePriority("eastmoneyEstimate", async () => {
    const cached = estimateCache.get(code);
    if (cached && Date.now() - cached.ts < ESTIMATE_CACHE_MS) {
      return cached.data;
    }

    const result = await new Promise<FundSnapshot>((resolve, reject) => {
    if (typeof document === "undefined" || !document.body) {
      reject(new Error("No browser environment"));
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.display = "none";

    let finished = false;
    let timer: number | null = null;

    const done = (callback: (value: any) => void, payload: any) => {
      if (finished) return;
      finished = true;
      if (timer !== null) window.clearTimeout(timer);
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
      callback(payload);
    };

    iframe.onload = () => {
      const frameWindow = iframe.contentWindow;
      const frameDocument = iframe.contentDocument || frameWindow?.document;
      if (!frameWindow || !frameDocument) {
        done(reject, new Error("Fund iframe init failed"));
        return;
      }

      frameDocument.open();
      frameDocument.write("<!doctype html><html><body></body></html>");
      frameDocument.close();

      (frameWindow as any).jsonpgz = (json: any) => {
        if (!json) {
          done(reject, new Error("Fund estimate data invalid"));
          return;
        }

        done(resolve, {
          code: json.fundcode || code,
          name: json.name || "",
          dwjz: json.dwjz,
          gsz: Number(json.gsz),
          gztime: json.gztime,
          jzrq: normalizeDate(json.jzrq),
          gszzl: Number(json.gszzl),
          source: "eastmoney",
          quoteStatus: "estimated",
        });
      };

      const script = frameDocument.createElement("script");
      script.src = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
      script.async = true;
      script.onerror = () => done(reject, new Error("Fund estimate load failed"));
      frameDocument.body.appendChild(script);
    };

      document.body.appendChild(iframe);
      timer = window.setTimeout(() => done(reject, new Error("Fund estimate timeout")), FUND_GZ_TIMEOUT_MS);
    });

    estimateCache.set(code, { data: result, ts: Date.now() });
    return result;
  }, priority);

const requestTencentEstimateData = async (
  code: string,
  previousFund?: FundSnapshot | null,
  priority: "high" | "normal" | "interactive" = "normal",
): Promise<FundSnapshot> => {
  const quote = await requestTencentFundQuote(code, priority);
  const estimateNav = toFiniteNumber(quote.latestNav);

  const computedGrowth =
    toFiniteNumber(quote.latestGrowth)
    ?? (estimateNav != null && quote.previousNav != null && quote.previousNav > 0
      ? ((estimateNav - quote.previousNav) / quote.previousNav) * 100
      : null);

  if (estimateNav == null || computedGrowth == null) {
    throw new Error("Tencent estimate fields missing");
  }

  const now = nowInMarket();

  return {
    code,
    name: quote.name || previousFund?.name || `基金 ${code}`,
    dwjz: previousFund?.dwjz ?? (quote.previousNav != null ? String(quote.previousNav) : null),
    gsz: estimateNav,
    gztime: `${quote.latestDate} ${now.format("HH:mm:ss")}`,
    jzrq: previousFund?.jzrq ?? quote.latestDate,
    gszzl: computedGrowth,
    source: "tencent",
    quoteStatus: "estimated",
  };
};

const requestFundEstimateWithFallback = async (
  code: string,
  previousFund?: FundSnapshot | null,
  priority: "high" | "normal" | "interactive" = "normal",
) => {
  try {
    const primary = await requestFundEstimateData(code, priority);
    if (hasValidEstimateFields(primary)) return primary;
  } catch {
    // fallback to secondary estimate provider
  }

  return requestTencentEstimateData(code, previousFund, priority);
};

export const fetchFundPreviewData = async (code: string, previousFund?: FundSnapshot | null): Promise<FundSnapshot> => {
  return withInFlightDedup(previewInFlight, code, async () => {
    const estimate = await requestFundEstimateWithFallback(code, previousFund, "interactive");
    const preview = {
      ...(previousFund || {}),
      ...estimate,
      code,
      name: estimate.name || previousFund?.name || code,
    };
    return preview;
  });
};

export const fetchFundBaseData = async (
  code: string,
  previousFund?: FundSnapshot | null,
  mode: RequestMode = "throttled",
): Promise<FundSnapshot> => {
  const [officialResult, estimate] = await Promise.allSettled([
    fetchOfficialQuoteWithFallback(code, mode),
    requestFundEstimateWithFallback(code, previousFund, mode === "interactive" ? "interactive" : "normal"),
  ]);

  const historyList = officialResult.status === "fulfilled" ? officialResult.value.historyList : [];
  const officialQuote = officialResult.status === "fulfilled" ? officialResult.value.official : null;
  const latest = officialQuote?.latestNav != null && officialQuote.latestDate
    ? {
      nav: officialQuote.latestNav,
      date: officialQuote.latestDate,
      growth: officialQuote.latestGrowth,
    }
    : historyList.at(-1) || null;
  const previousNav = officialQuote?.previousNav != null
    ? { nav: officialQuote.previousNav }
    : historyList.length > 1
      ? historyList.at(-2)
      : null;

  if (estimate.status === "fulfilled") {
    const estimateOfficialDate = estimate.value.jzrq || null;
    const historyLatestDate = latest?.date || null;
    const estimateOfficialNav = Number(estimate.value.dwjz);
    const latestOfficialNav = latest?.nav ?? null;
    const estimateHasOfficialSnapshot = Boolean(
      estimateOfficialDate
        && Number.isFinite(estimateOfficialNav)
        && estimateOfficialNav > 0,
    );
    const estimateIsNewerOfficialDate = Boolean(
      estimateOfficialDate
        && historyLatestDate
        && estimateOfficialDate > historyLatestDate,
    );
    const estimateIsSameDateButDifferentNav = Boolean(
      estimateOfficialDate
        && historyLatestDate
        && estimateOfficialDate === historyLatestDate
        && latestOfficialNav != null
        && Math.abs(estimateOfficialNav - latestOfficialNav) > 1e-8,
    );
    const useEstimateOfficial = Boolean(
      estimateHasOfficialSnapshot
        && (!historyLatestDate || estimateIsNewerOfficialDate || estimateIsSameDateButDifferentNav),
    );

    const effectiveLatestNav = useEstimateOfficial ? estimateOfficialNav : latest?.nav ?? null;
    const effectiveLatestDate = useEstimateOfficial ? estimateOfficialDate : latest?.date || estimate.value.jzrq || null;
    const effectiveLastNav = useEstimateOfficial
      ? estimateIsSameDateButDifferentNav
        ? previousNav?.nav ?? Number(previousFund?.lastNav)
        : latest?.nav ?? Number(previousFund?.lastNav)
      : previousNav?.nav ?? Number(previousFund?.lastNav);
    const computedOfficialGrowth = useEstimateOfficial
      ? estimate.value.zzl ?? (effectiveLastNav && effectiveLastNav > 0 && effectiveLatestNav != null
        ? ((effectiveLatestNav - effectiveLastNav) / effectiveLastNav) * 100
        : null)
      : latest?.growth ?? estimate.value.zzl ?? null;
    const hasFreshOfficialGrowth = computedOfficialGrowth != null && Number.isFinite(Number(computedOfficialGrowth));
    const effectiveOfficialGrowth = hasFreshOfficialGrowth ? Number(computedOfficialGrowth) : toFiniteNumber(previousFund?.zzl) ?? null;
    const hasFreshOfficialSnapshot = Boolean(
      effectiveLatestDate
        && effectiveLatestNav != null
        && Number.isFinite(effectiveLatestNav)
        && effectiveLatestNav > 0,
    );
    const officialConfirmationMeta = hasFreshOfficialSnapshot
      ? resolveOfficialConfirmationMeta(previousFund, effectiveLatestDate)
      : {
          officialConfirmedAt: previousFund?.officialConfirmedAt ?? null,
          officialConfirmedForDate: previousFund?.officialConfirmedForDate ?? null,
        };

    const snapshot: FundSnapshot = {
      ...(previousFund || {}),
      ...estimate.value,
      code,
      name: estimate.value.name || officialQuote?.name || previousFund?.name || "",
      dwjz: effectiveLatestNav != null ? String(effectiveLatestNav) : estimate.value.dwjz,
      jzrq: effectiveLatestDate,
      zzl: effectiveOfficialGrowth,
      lastNav: effectiveLastNav && Number.isFinite(effectiveLastNav) ? String(effectiveLastNav) : previousFund?.lastNav ?? null,
      officialConfirmedAt: officialConfirmationMeta.officialConfirmedAt,
      officialConfirmedForDate: officialConfirmationMeta.officialConfirmedForDate,
      source: "eastmoney",
      quoteStatus: "estimated",
    };
    return snapshot;
  }

  if (latest) {
    const hasFreshOfficialGrowth = latest.growth != null && Number.isFinite(Number(latest.growth));
    const hasFreshOfficialSnapshot = latest.date && Number.isFinite(latest.nav) && latest.nav > 0;
    const officialConfirmationMeta = hasFreshOfficialSnapshot
      ? resolveOfficialConfirmationMeta(previousFund, latest.date)
      : {
          officialConfirmedAt: previousFund?.officialConfirmedAt ?? null,
          officialConfirmedForDate: previousFund?.officialConfirmedForDate ?? null,
        };

    const snapshot: FundSnapshot = {
      ...(previousFund || {}),
      code,
      name: officialQuote?.name || previousFund?.name || `基金 ${code}`,
      dwjz: String(latest.nav),
      gsz: null,
      gztime: null,
      jzrq: latest.date,
      zzl: hasFreshOfficialGrowth ? Number(latest.growth) : toFiniteNumber(previousFund?.zzl) ?? null,
      gszzl: null,
      lastNav: previousNav?.nav != null ? String(previousNav.nav) : previousFund?.lastNav ?? null,
      noValuation: true,
      officialConfirmedAt: officialConfirmationMeta.officialConfirmedAt,
      officialConfirmedForDate: officialConfirmationMeta.officialConfirmedForDate,
      source:
        officialQuote?.source === "history"
          ? "eastmoney"
          : officialQuote?.source === "tencent"
            ? "tencent"
            : "danjuan",
      quoteStatus: "official",
    };
    return snapshot;
  }

  throw new Error(`Unable to fetch fund base data for ${code}`);
};

export const fetchFundData = async (
  code: string,
  previousFund?: FundSnapshot | null,
  mode: RequestMode = "throttled",
): Promise<FundSnapshot> => {
  return withInFlightDedup(fullInFlight, code, async () => {
    const base = await fetchFundBaseData(code, previousFund, mode);
    const [holdingsResult, profileResult] = await Promise.allSettled([
      fetchHoldings(code),
      fetchFundProfile(code),
    ]);

  const holdingsData = holdingsResult.status === "fulfilled"
    ? holdingsResult.value
    : {
      holdings: base.holdings || previousFund?.holdings || [],
      holdingsReportDate: base.holdingsReportDate || previousFund?.holdingsReportDate || null,
      holdingsIsLastQuarter: base.holdingsIsLastQuarter || previousFund?.holdingsIsLastQuarter || false,
    };
  const profileData = profileResult.status === "fulfilled"
    ? profileResult.value
    : {
      fundType: base.fundType || previousFund?.fundType || null,
      riskLevel: base.riskLevel || previousFund?.riskLevel || null,
      fundManager: base.fundManager || previousFund?.fundManager || null,
      fundCompany: base.fundCompany || previousFund?.fundCompany || null,
      fundScale: base.fundScale || previousFund?.fundScale || null,
      trackingTarget: base.trackingTarget || previousFund?.trackingTarget || null,
      inceptionDate: base.inceptionDate || previousFund?.inceptionDate || null,
    };
  const archiveFetchSucceeded = holdingsResult.status === "fulfilled" || profileResult.status === "fulfilled";
  const archiveHasData = Boolean(holdingsData.holdings.length || holdingsData.holdingsReportDate || hasProfileData(profileData));
  const archiveStatus = archiveHasData ? "ready" : archiveFetchSucceeded ? "empty" : base.archiveStatus || previousFund?.archiveStatus || "pending";

    const snapshot: FundSnapshot = {
      ...base,
      ...profileData,
      holdings: holdingsData.holdings,
      holdingsReportDate: holdingsData.holdingsReportDate,
      holdingsIsLastQuarter: holdingsData.holdingsIsLastQuarter,
      archiveStatus,
    };
    return snapshot;
  });
};

export const searchFunds = async (keyword: string, mode: RequestMode = "throttled"): Promise<SearchFundResult[]> => {
  const query = keyword.trim();
  if (!query) return [];
  if (typeof document === "undefined" || !document.body) return [];

  const callbackName = `SuggestData_${Date.now()}`;
  const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(query)}&callback=${callbackName}&_=${Date.now()}`;

  return runWithSourceInterval("eastmoneySearch", () => new Promise((resolve, reject) => {
    (window as any)[callbackName] = (data: any) => {
      const results = Array.isArray(data?.Datas)
        ? data.Datas.filter((item: any) => item.CATEGORY === 700 || item.CATEGORY === "700" || item.CATEGORYDESC === "基金")
            .map((item: any) => ({
              code: item.CODE,
              resolvedCode: item.BACKCODE || item.CODE,
              name: item.NAME || item.SHORTNAME || item.CODE,
              shortName: item.SHORTNAME || "",
              category: item.CATEGORYDESC || "",
              fundType: item.FTYPE || "",
              spell: item.PINYIN || "",
            }))
        : [];
      delete (window as any)[callbackName];
      resolve(results);
    };

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => {
      if (document.body.contains(script)) document.body.removeChild(script);
    };
    script.onerror = () => {
      if (document.body.contains(script)) document.body.removeChild(script);
      delete (window as any)[callbackName];
      reject(new Error("Fund search failed"));
    };
    document.body.appendChild(script);
  }), mode);
};
