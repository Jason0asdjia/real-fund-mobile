import type { FundSnapshot, SearchFundResult } from "@/lib/types";

const FUND_GZ_TIMEOUT_MS = 8000;

const loadScript = (url: string) =>
  new Promise<any>((resolve, reject) => {
    if (typeof document === "undefined" || !document.body) {
      reject(new Error("无浏览器环境"));
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
      reject(new Error("脚本加载失败"));
    };
    document.body.appendChild(script);
  });

const requestFundEstimateData = (code: string) =>
  new Promise<FundSnapshot>((resolve, reject) => {
    if (typeof document === "undefined" || !document.body) {
      reject(new Error("无浏览器环境"));
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
        done(reject, new Error("基金估值容器初始化失败"));
        return;
      }

      frameDocument.open();
      frameDocument.write("<!doctype html><html><body></body></html>");
      frameDocument.close();

      (frameWindow as any).jsonpgz = (json: any) => {
        if (!json) {
          done(reject, new Error("基金估值数据无效"));
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
        });
      };

      const script = frameDocument.createElement("script");
      script.src = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
      script.async = true;
      script.onerror = () => done(reject, new Error("基金估值加载失败"));
      frameDocument.body.appendChild(script);
    };

    document.body.appendChild(iframe);
    timer = window.setTimeout(() => done(reject, new Error("基金估值请求超时")), FUND_GZ_TIMEOUT_MS);
  });

const parseNetValuesFromHtml = (content: string) => {
  if (!content || content.includes("暂无数据")) return [];
  const rowMatches = content.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const results: Array<{ date: string; nav: number; growth: number | null }> = [];

  for (const row of rowMatches) {
    const cells = row.match(/<td[^>]*>(.*?)<\/td>/gi) || [];
    if (cells.length < 2) continue;
    const text = cells.map((cell) => cell.replace(/<[^>]+>/g, "").trim());
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

const fetchHistoricalNetValues = async (code: string) => {
  const url = `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code=${code}&page=1&per=2&sdate=&edate=`;
  const apidata = await loadScript(url);
  return parseNetValuesFromHtml(apidata?.content || "");
};

export const fetchFundData = async (code: string, previousFund?: FundSnapshot | null): Promise<FundSnapshot> => {
  const [history, estimate] = await Promise.allSettled([
    fetchHistoricalNetValues(code),
    requestFundEstimateData(code),
  ]);

  const historyList = history.status === "fulfilled" ? history.value : [];
  const latest = historyList.at(-1);
  const previousNav = historyList.length > 1 ? historyList.at(-2) : null;

  if (estimate.status === "fulfilled") {
    return {
      ...(previousFund || {}),
      ...estimate.value,
      code,
      name: estimate.value.name || previousFund?.name || "",
      dwjz: latest ? String(latest.nav) : estimate.value.dwjz,
      jzrq: latest?.date || estimate.value.jzrq,
      zzl: latest?.growth ?? estimate.value.zzl ?? null,
      lastNav: previousNav ? String(previousNav.nav) : previousFund?.lastNav ?? null,
    };
  }

  if (latest) {
    return {
      ...(previousFund || {}),
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
    };
  }

  throw new Error(`无法获取基金 ${code} 的数据`);
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
      reject(new Error("基金搜索失败"));
    };
    document.body.appendChild(script);
  });
};
