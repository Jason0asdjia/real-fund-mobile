import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

export const MARKET_TIMEZONE = "Asia/Shanghai";
export const MARKET_ESTIMATE_START_MINUTES = 9 * 60 + 15;

dayjs.tz.setDefault(MARKET_TIMEZONE);

export const nowInMarket = () => dayjs().tz(MARKET_TIMEZONE);
export const todayInMarket = () => nowInMarket().format("YYYY-MM-DD");
export const toMarketDay = (value?: string | null) => value ? dayjs.tz(value, MARKET_TIMEZONE) : nowInMarket();
export const toMarketTime = (value?: string | null, format = "HH:mm") => toMarketDay(value).format(format);

export const holdingDaysInMarket = (startDate?: string | null) => {
  if (!startDate) return null;
  const start = toMarketDay(`${startDate}T00:00:00`).startOf("day");
  const now = nowInMarket().startOf("day");
  const diff = now.diff(start, "day");
  return diff >= 0 ? diff : null;
};

export const isLikelyTradingDay = () => {
  const day = nowInMarket().day();
  return day !== 0 && day !== 6;
};

export const hasEstimateWindowStarted = () => {
  if (!isLikelyTradingDay()) return false;
  const now = nowInMarket();
  return now.hour() * 60 + now.minute() >= MARKET_ESTIMATE_START_MINUTES;
};

export const formatClock = (value?: string | null) => {
  if (!value) return "未刷新";
  return toMarketDay(value).format("HH:mm");
};
