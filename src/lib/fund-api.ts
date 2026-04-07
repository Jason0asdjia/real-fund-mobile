import type { FundHoldingStock, FundSnapshot, SearchFundResult } from "@/lib/types";
import { nowInMarket } from "@/lib/time";

const FUND_GZ_TIMEOUT_MS = 8000;
const HOLDINGS_CACHE_MS = 60 * 60 * 1000;
const PROFILE_CACHE_MS = 6 * 60 * 60 * 1000;

type CachedData<T> = {
  data: T;
  ts: number;
};

const holdingsCache = new Map<string, CachedData<{ holdings: FundHoldingStock[]; holdingsReportDate: string | null; holdingsIsLastQuarter: boolean }>>();
const profileCache = new Map<string, CachedData<Pick<FundSnapshot, "fundType" | "riskLevel" | "fundManager" | "fundCompany" | "fundScale" | "trackingTarget" | "inceptionDate">>>();

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
  const apidata = await loadScript(url);
  return parseNetValuesFromHtml(apidata?.content || "");
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

const requestFundEstimateData = (code: string) =>
  new Promise<FundSnapshot>((resolve, reject) => {
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
          jzrq: json.jzrq,
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

export const fetchFundData = async (code: string, previousFund?: FundSnapshot | null): Promise<FundSnapshot> => {
  const [history, estimate, holdingsResult, profileResult] = await Promise.allSettled([
    fetchHistoricalNetValues(code),
    requestFundEstimateData(code),
    fetchHoldings(code),
    fetchFundProfile(code),
  ]);

  const historyList = history.status === "fulfilled" ? history.value : [];
  const latest = historyList.at(-1);
  const previousNav = historyList.length > 1 ? historyList.at(-2) : null;
  const holdingsData = holdingsResult.status === "fulfilled"
    ? holdingsResult.value
    : {
      holdings: previousFund?.holdings || [],
      holdingsReportDate: previousFund?.holdingsReportDate || null,
      holdingsIsLastQuarter: previousFund?.holdingsIsLastQuarter || false,
    };
  const profileData = profileResult.status === "fulfilled"
    ? profileResult.value
    : {
      fundType: previousFund?.fundType || null,
      riskLevel: previousFund?.riskLevel || null,
      fundManager: previousFund?.fundManager || null,
      fundCompany: previousFund?.fundCompany || null,
      fundScale: previousFund?.fundScale || null,
      trackingTarget: previousFund?.trackingTarget || null,
      inceptionDate: previousFund?.inceptionDate || null,
    };
  const archiveFetchSucceeded = holdingsResult.status === "fulfilled" || profileResult.status === "fulfilled";
  const archiveHasData = Boolean(holdingsData.holdings.length || holdingsData.holdingsReportDate || hasProfileData(profileData));
  const archiveStatus = archiveHasData ? "ready" : archiveFetchSucceeded ? "empty" : previousFund?.archiveStatus || "pending";

  if (estimate.status === "fulfilled") {
    const estimateOfficialDate = estimate.value.jzrq || null;
    const historyLatestDate = latest?.date || null;
    const estimateOfficialNav = Number(estimate.value.dwjz);
    const useEstimateOfficial = Boolean(
      estimateOfficialDate
        && estimateOfficialDate !== historyLatestDate
        && Number.isFinite(estimateOfficialNav)
        && estimateOfficialNav > 0,
    );

    const effectiveLatestNav = useEstimateOfficial ? estimateOfficialNav : latest?.nav ?? null;
    const effectiveLatestDate = useEstimateOfficial ? estimateOfficialDate : latest?.date || estimate.value.jzrq;
    const effectiveLastNav = useEstimateOfficial ? latest?.nav ?? Number(previousFund?.lastNav) : previousNav?.nav ?? Number(previousFund?.lastNav);
    const effectiveOfficialGrowth =
      useEstimateOfficial && effectiveLastNav && effectiveLastNav > 0 && effectiveLatestNav != null
        ? ((effectiveLatestNav - effectiveLastNav) / effectiveLastNav) * 100
        : latest?.growth ?? estimate.value.zzl ?? null;

    return {
      ...(previousFund || {}),
      ...estimate.value,
      ...profileData,
      code,
      name: estimate.value.name || previousFund?.name || "",
      dwjz: effectiveLatestNav != null ? String(effectiveLatestNav) : estimate.value.dwjz,
      jzrq: effectiveLatestDate,
      zzl: effectiveOfficialGrowth,
      lastNav: effectiveLastNav && Number.isFinite(effectiveLastNav) ? String(effectiveLastNav) : previousFund?.lastNav ?? null,
      holdings: holdingsData.holdings,
      holdingsReportDate: holdingsData.holdingsReportDate,
      holdingsIsLastQuarter: holdingsData.holdingsIsLastQuarter,
      archiveStatus,
      source: "eastmoney",
      quoteStatus: "estimated",
    };
  }

  if (latest) {
    return {
      ...(previousFund || {}),
      ...profileData,
      code,
      name: previousFund?.name || `基金 ${code}`,
      dwjz: String(latest.nav),
      gsz: null,
      gztime: null,
      jzrq: latest.date,
      zzl: latest.growth,
      gszzl: null,
      lastNav: previousNav ? String(previousNav.nav) : null,
      noValuation: true,
      holdings: holdingsData.holdings,
      holdingsReportDate: holdingsData.holdingsReportDate,
      holdingsIsLastQuarter: holdingsData.holdingsIsLastQuarter,
      archiveStatus,
      source: "fallback",
      quoteStatus: "official",
    };
  }

  throw new Error(`Unable to fetch fund data for ${code}`);
};

export const searchFunds = async (keyword: string): Promise<SearchFundResult[]> => {
  const query = keyword.trim();
  if (!query) return [];
  if (typeof document === "undefined" || !document.body) return [];

  const callbackName = `SuggestData_${Date.now()}`;
  const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(query)}&callback=${callbackName}&_=${Date.now()}`;

  return new Promise((resolve, reject) => {
    (window as any)[callbackName] = (data: any) => {
      const results = Array.isArray(data?.Datas)
        ? data.Datas.filter((item: any) => item.CATEGORY === 700 || item.CATEGORY === "700" || item.CATEGORYDESC === "基金")
            .map((item: any) => ({
              code: item.CODE,
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
  });
};
