import dayjs from "dayjs";
import type { ConfigType, Dayjs } from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

export const MARKET_TIMEZONE = "Asia/Shanghai";
export const MARKET_ESTIMATE_START_MINUTES = 9 * 60 + 15;
export const MARKET_TRADE_CUTOFF_MINUTES = 15 * 60;

dayjs.tz.setDefault(MARKET_TIMEZONE);

export const nowInMarket = () => dayjs().tz(MARKET_TIMEZONE);
export const todayInMarket = () => nowInMarket().format("YYYY-MM-DD");

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;

export const toMarketDay = (value?: string | null) => {
  if (!value) return nowInMarket();

  if (DATE_ONLY_PATTERN.test(value)) {
    return dayjs.tz(`${value}T00:00:00`, MARKET_TIMEZONE);
  }

  if (LOCAL_DATETIME_PATTERN.test(value)) {
    return dayjs.tz(value.replace(" ", "T"), MARKET_TIMEZONE);
  }

  const parsed = dayjs(value);
  if (parsed.isValid()) {
    return parsed.tz(MARKET_TIMEZONE);
  }

  return nowInMarket();
};

export const toMarketTime = (value?: string | null, format = "HH:mm") => toMarketDay(value).format(format);
export const formatMarketDate = (value?: ConfigType | null, format = "YYYY-MM-DD") => {
  if (value == null) return nowInMarket().format(format);
  if (typeof value === "string") return toMarketDay(value).format(format);

  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.tz(MARKET_TIMEZONE).format(format) : nowInMarket().format(format);
};

export const formatClock = (value?: string | null) => {
  if (!value) return "未刷新";
  return toMarketDay(value).format("HH:mm");
};

export const formatLocalTimestamp = (value?: string | number | Date | null) => {
  const date = value == null ? new Date() : value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

export const shiftMarketDay = (value?: ConfigType | null, amount = 0, unit: dayjs.ManipulateType = "day"): Dayjs => {
  if (value == null) return nowInMarket().add(amount, unit);
  if (typeof value === "string") return toMarketDay(value).add(amount, unit);

  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.tz(MARKET_TIMEZONE).add(amount, unit) : nowInMarket().add(amount, unit);
};

export const getDaysInMarketMonth = (month: string) => {
  const start = toMarketDay(`${month}-01T00:00:00`).startOf("month");
  return start.daysInMonth();
};

export const getMarketWeekday = (value?: ConfigType | null) => {
  if (value == null) return nowInMarket().day();
  if (typeof value === "string") return toMarketDay(value).day();

  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.tz(MARKET_TIMEZONE).day() : nowInMarket().day();
};

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

type EstimateTimestampOptions = {
  allowPreviousCloseCarry?: boolean;
};

const getPreviousLikelyTradingDay = (value: Dayjs) => {
  let cursor = value.subtract(1, "day").startOf("day");
  while (cursor.day() === 0 || cursor.day() === 6) {
    cursor = cursor.subtract(1, "day");
  }
  return cursor;
};

export const isEstimateTimestampUsable = (value?: string | null, options: EstimateTimestampOptions = {}) => {
  if (!value) return false;

  const estimateTime = toMarketDay(value);
  if (!estimateTime.isValid()) return false;

  const now = nowInMarket();
  if (estimateTime.isAfter(now.add(2, "minute"))) return false;

  const estimateMinutes = estimateTime.hour() * 60 + estimateTime.minute();
  if (estimateMinutes < MARKET_ESTIMATE_START_MINUTES || estimateMinutes > MARKET_TRADE_CUTOFF_MINUTES) return false;

  const estimateDate = estimateTime.format("YYYY-MM-DD");
  const today = now.format("YYYY-MM-DD");
  if (estimateDate === today) {
    const nowMinutes = now.hour() * 60 + now.minute();
    if (nowMinutes < MARKET_ESTIMATE_START_MINUTES) return false;
    return true;
  }

  if (!options.allowPreviousCloseCarry) return false;

  const nowMinutes = now.hour() * 60 + now.minute();
  if (nowMinutes >= MARKET_ESTIMATE_START_MINUTES) return false;

  const previousTradingDate = getPreviousLikelyTradingDay(now).format("YYYY-MM-DD");
  return estimateDate === previousTradingDate;
};

export const isBeforeTradeCutoffInMarket = (value?: ConfigType | null) => {
  if (value == null) {
    const current = nowInMarket();
    return current.hour() * 60 + current.minute() < MARKET_TRADE_CUTOFF_MINUTES;
  }

  if (typeof value === "string") {
    const current = toMarketDay(value);
    return current.hour() * 60 + current.minute() < MARKET_TRADE_CUTOFF_MINUTES;
  }

  const current = dayjs(value);
  if (!current.isValid()) {
    const fallback = nowInMarket();
    return fallback.hour() * 60 + fallback.minute() < MARKET_TRADE_CUTOFF_MINUTES;
  }

  const marketTime = current.tz(MARKET_TIMEZONE);
  return marketTime.hour() * 60 + marketTime.minute() < MARKET_TRADE_CUTOFF_MINUTES;
};
