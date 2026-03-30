import type { AppState, FundSnapshot, FundTransaction, ValuationPoint } from "@/lib/types";

type DemoSeed = {
  state: AppState;
  valuationSeries: Record<string, ValuationPoint[]>;
};

type FundSeedConfig = {
  code: string;
  name: string;
  base: number;
  drift: number;
  wave: number;
  dwjz: string;
  lastNav: string;
  gszzl: number;
  zzl: number;
  holding: {
    share: number;
    cost: number;
    firstPurchaseDate: string;
  };
  transactions: Array<Omit<FundTransaction, "id">>;
  favorite?: boolean;
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);
const cloneDate = (date: Date) => new Date(date.getTime());

const createTransactions = (items: Array<Omit<FundTransaction, "id">>) =>
  items.map((item, index) => ({ ...item, id: `demo-${item.type}-${index + 1}-${item.date}` }));

const buildSeries = (code: string, base: number, drift: number, wave: number) => {
  const now = new Date();
  const points: ValuationPoint[] = [];

  for (let offset = 120; offset >= 1; offset -= 1) {
    const date = cloneDate(now);
    date.setDate(now.getDate() - offset);
    const progress = (120 - offset) / 119;
    const value = base + drift * progress + Math.sin(progress * 8.6 + code.length * 0.35) * wave;
    points.push({
      date: formatDate(date),
      time: "14:50",
      value: Number(value.toFixed(4)),
    });
  }

  const today = formatDate(now);
  const intradayBase = points[points.length - 1]?.value ?? base;
  const intradayOffsets = ["09:35", "10:10", "10:45", "11:20", "13:15", "13:50", "14:20", "14:50"];
  intradayOffsets.forEach((time, index) => {
    const value = intradayBase + Math.sin(index * 0.72 + code.length) * wave * 0.36 + index * drift * 0.011;
    points.push({
      date: today,
      time,
      value: Number(value.toFixed(4)),
    });
  });

  return points;
};

const fundConfigs: FundSeedConfig[] = [
  {
    code: "003333",
    name: "泰信智选成长灵活配置混合A",
    base: 0.92,
    drift: -0.08,
    wave: 0.03,
    dwjz: "0.8426",
    lastNav: "0.8382",
    gszzl: 0.58,
    zzl: -0.24,
    holding: { share: 4100, cost: 0.8924, firstPurchaseDate: "2025-10-15" },
    transactions: [
      { date: "2025-10-15", type: "buy", share: 2000, price: 0.9682, fee: 1.8, note: "首次建仓" },
      { date: "2025-12-12", type: "buy", share: 1800, price: 0.9134, fee: 1.4, note: "补仓" },
      { date: "2026-02-18", type: "sell", share: 900, price: 0.9578, fee: 1.2, note: "止盈一部分" },
      { date: "2026-03-10", type: "buy", share: 1200, price: 0.8264, fee: 1.0, note: "回补" },
    ],
    favorite: true,
  },
  {
    code: "007333",
    name: "嘉百馨升纯债C",
    base: 1.01,
    drift: 0.12,
    wave: 0.025,
    dwjz: "1.1270",
    lastNav: "1.1252",
    gszzl: 0.16,
    zzl: 0.03,
    holding: { share: 5500, cost: 1.0497, firstPurchaseDate: "2025-09-08" },
    transactions: [
      { date: "2025-09-08", type: "buy", share: 3500, price: 1.0311, fee: 1.5, note: "稳健仓位" },
      { date: "2026-01-22", type: "buy", share: 2000, price: 1.0822, fee: 1.3, note: "继续加仓" },
    ],
  },
  {
    code: "023333",
    name: "金鹰中证A500指数发起A",
    base: 1.18,
    drift: -0.02,
    wave: 0.02,
    dwjz: "1.1055",
    lastNav: "1.1093",
    gszzl: -0.34,
    zzl: 0.41,
    holding: { share: 3400, cost: 1.1541, firstPurchaseDate: "2025-11-01" },
    transactions: [
      { date: "2025-11-01", type: "buy", share: 2600, price: 1.2145, fee: 1.6, note: "指数底仓" },
      { date: "2026-02-05", type: "buy", share: 1400, price: 1.0962, fee: 1.1, note: "低位加仓" },
      { date: "2026-03-14", type: "sell", share: 600, price: 1.1428, fee: 1.0, note: "减仓测试" },
    ],
    favorite: true,
  },
  {
    code: "016161",
    name: "天弘永利优享债券A",
    base: 1.06,
    drift: 0.08,
    wave: 0.014,
    dwjz: "1.1379",
    lastNav: "1.1365",
    gszzl: 0.12,
    zzl: 0.05,
    holding: { share: 6200, cost: 1.0832, firstPurchaseDate: "2025-08-20" },
    transactions: [
      { date: "2025-08-20", type: "buy", share: 4000, price: 1.0516, fee: 1.4, note: "底仓" },
      { date: "2026-01-12", type: "buy", share: 2200, price: 1.1391, fee: 1.2, note: "滚动增配" },
    ],
  },
  {
    code: "011111",
    name: "华泰柏瑞行业严选混合A",
    base: 1.22,
    drift: -0.15,
    wave: 0.038,
    dwjz: "1.0825",
    lastNav: "1.0731",
    gszzl: 0.88,
    zzl: -0.62,
    holding: { share: 2800, cost: 1.1648, firstPurchaseDate: "2025-07-18" },
    transactions: [
      { date: "2025-07-18", type: "buy", share: 1800, price: 1.2562, fee: 1.4, note: "主题仓" },
      { date: "2025-12-30", type: "buy", share: 1000, price: 0.9993, fee: 1.0, note: "左侧补仓" },
    ],
  },
  {
    code: "013333",
    name: "东兴兴瑞一年定开C",
    base: 1.31,
    drift: 0.06,
    wave: 0.018,
    dwjz: "1.3755",
    lastNav: "1.3726",
    gszzl: 0.21,
    zzl: 0.08,
    holding: { share: 1900, cost: 1.2886, firstPurchaseDate: "2025-06-03" },
    transactions: [
      { date: "2025-06-03", type: "buy", share: 1200, price: 1.2453, fee: 1.0, note: "首发买入" },
      { date: "2025-10-09", type: "buy", share: 700, price: 1.3624, fee: 0.9, note: "续持" },
    ],
  },
  {
    code: "017777",
    name: "富国价值优势混合A",
    base: 1.48,
    drift: -0.11,
    wave: 0.041,
    dwjz: "1.2968",
    lastNav: "1.2875",
    gszzl: 0.72,
    zzl: -0.44,
    holding: { share: 2300, cost: 1.3521, firstPurchaseDate: "2025-05-16" },
    transactions: [
      { date: "2025-05-16", type: "buy", share: 1400, price: 1.4612, fee: 1.1, note: "价值仓" },
      { date: "2025-11-25", type: "sell", share: 500, price: 1.4026, fee: 1.0, note: "减仓" },
      { date: "2026-03-07", type: "buy", share: 1400, price: 1.2872, fee: 1.2, note: "回补" },
    ],
  },
  {
    code: "009999",
    name: "招商量化精选股票A",
    base: 1.14,
    drift: 0.1,
    wave: 0.033,
    dwjz: "1.2462",
    lastNav: "1.2388",
    gszzl: 0.6,
    zzl: 0.19,
    holding: { share: 3600, cost: 1.1685, firstPurchaseDate: "2025-09-30" },
    transactions: [
      { date: "2025-09-30", type: "buy", share: 1800, price: 1.1036, fee: 1.2, note: "量化策略" },
      { date: "2026-01-08", type: "buy", share: 1800, price: 1.2334, fee: 1.2, note: "趋势确认" },
    ],
  },
  {
    code: "018888",
    name: "易方达消费精选混合A",
    base: 1.36,
    drift: -0.18,
    wave: 0.046,
    dwjz: "1.1027",
    lastNav: "1.0945",
    gszzl: 0.75,
    zzl: -0.83,
    holding: { share: 2700, cost: 1.2143, firstPurchaseDate: "2025-04-11" },
    transactions: [
      { date: "2025-04-11", type: "buy", share: 1600, price: 1.3384, fee: 1.3, note: "消费配置" },
      { date: "2025-12-02", type: "buy", share: 1100, price: 1.0321, fee: 1.0, note: "低位吸纳" },
    ],
  },
  {
    code: "015555",
    name: "中欧医疗创新股票A",
    base: 1.58,
    drift: -0.24,
    wave: 0.052,
    dwjz: "1.2041",
    lastNav: "1.1932",
    gszzl: 0.91,
    zzl: -0.97,
    holding: { share: 2100, cost: 1.3369, firstPurchaseDate: "2025-03-28" },
    transactions: [
      { date: "2025-03-28", type: "buy", share: 1300, price: 1.4972, fee: 1.2, note: "医药仓位" },
      { date: "2025-10-18", type: "sell", share: 400, price: 1.4215, fee: 1.0, note: "降低波动" },
      { date: "2026-02-26", type: "buy", share: 1200, price: 1.1128, fee: 1.1, note: "再平衡" },
    ],
  },
];

export const buildDemoSeed = (): DemoSeed => {
  const now = new Date();
  const today = formatDate(now);
  const yesterday = cloneDate(now);
  yesterday.setDate(now.getDate() - 1);
  const lastTradeDay = formatDate(yesterday);

  const valuationSeries = Object.fromEntries(
    fundConfigs.map((item) => [item.code, buildSeries(item.code, item.base, item.drift, item.wave)]),
  );

  const funds: FundSnapshot[] = fundConfigs.map((item) => ({
    code: item.code,
    name: item.name,
    dwjz: item.dwjz,
    gsz: valuationSeries[item.code].at(-1)?.value ?? Number(item.dwjz),
    gztime: `${today} 14:50`,
    jzrq: lastTradeDay,
    gszzl: item.gszzl,
    zzl: item.zzl,
    lastNav: item.lastNav,
  }));

  const transactions: Record<string, FundTransaction[]> = Object.fromEntries(
    fundConfigs.map((item) => [item.code, createTransactions(item.transactions)]),
  );

  const holdings = Object.fromEntries(
    fundConfigs.map((item) => [item.code, item.holding]),
  );

  const favorites = fundConfigs.filter((item) => item.favorite).map((item) => item.code);
  const searchHistory = fundConfigs.slice(0, 8).map((item) => item.name);

  const state: AppState = {
    funds,
    holdings,
    transactions,
    favorites,
    refreshMs: 60000,
    searchHistory,
    lastUpdatedAt: now.toISOString(),
  };

  return { state, valuationSeries };
};
