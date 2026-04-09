"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ChangeEventHandler } from "react";
import { Bell, ChevronRight, Database, Download, HelpCircle, History, Loader2, ShieldCheck, Sparkles, Upload, Wallet } from "lucide-react";

import { useAppState } from "@/components/app-provider";
import { TwSelect } from "@/components/ui/tw-select";
import { getHoldingMetrics } from "@/lib/portfolio";
import { APP_STATE_KEY } from "@/lib/storage";
import { toMarketTime } from "@/lib/time";
import { VALUATION_TIMESERIES_KEY } from "@/lib/valuation-timeseries";

const APP_STORAGE_PREFIX = "real-fund-mobile:";

const isPlainObject = (value: unknown): value is Record<string, unknown> => value != null && typeof value === "object" && !Array.isArray(value);

const readAppLocalStorageSnapshot = () => {
  const snapshot: Record<string, string> = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(APP_STORAGE_PREFIX)) continue;
    const value = window.localStorage.getItem(key);
    if (value == null) continue;
    snapshot[key] = value;
  }
  return snapshot;
};

const applyAppLocalStorageSnapshot = (snapshot: Record<string, string>) => {
  const existingKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(APP_STORAGE_PREFIX)) continue;
    existingKeys.push(key);
  }

  existingKeys.forEach((key) => {
    if (!(key in snapshot)) {
      window.localStorage.removeItem(key);
    }
  });

  Object.entries(snapshot).forEach(([key, value]) => {
    window.localStorage.setItem(key, value);
  });
};

const tryParseJson = (raw: string) => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
};

const refreshOptions = [
  { label: "15 秒", value: 15000 },
  { label: "30 秒", value: 30000 },
  { label: "60 秒", value: 60000 },
  { label: "120 秒", value: 120000 },
];

const refreshSelectOptions = refreshOptions.map((item) => ({
  label: item.label,
  value: String(item.value),
}));

export default function SettingsPage() {
  const { state, seeding, setRefreshMs, clearAll, seedDemoData, valuationSeries, importBackupData } = useAppState();
  const [seededAt, setSeededAt] = useState<string | null>(null);
  const [clearingDemo, setClearingDemo] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [importingBackup, setImportingBackup] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const totals = useMemo(
    () =>
      state.funds.reduce(
        (acc, fund) => {
          const metrics = getHoldingMetrics(fund, state.holdings[fund.code]);
          acc.asset += metrics?.amount || 0;
          return acc;
        },
        { asset: 0 },
      ),
    [state.funds, state.holdings],
  );

  const handleSeedDemoData = () => {
    seedDemoData();
    setSeededAt(toMarketTime(undefined, "HH:mm"));
  };

  const handleClearDemoData = async () => {
    if (clearingDemo || seeding) return;
    setClearingDemo(true);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 280));
    clearAll();
    setSeededAt(null);
    setClearingDemo(false);
  };

  const handleExportData = () => {
    const exportedAt = toMarketTime(undefined, "YYYY-MM-DD HH:mm:ss");
    const localStorageSnapshot = readAppLocalStorageSnapshot();
    const payload = {
      version: 1,
      exportedAt,
      appState: state,
      valuationSeries,
      localStorageSnapshot,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `real-fund-mobile-backup-${toMarketTime(undefined, "YYYYMMDD-HHmmss")}.json`;
    anchor.click();
    window.URL.revokeObjectURL(url);
    setBackupMessage(`已导出备份文件（${toMarketTime(undefined, "HH:mm")}）`);
  };

  const handlePickImportFile = () => {
    if (importingBackup) return;
    importInputRef.current?.click();
  };

  const handleImportFile: ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || importingBackup) return;

    setImportingBackup(true);
    setBackupMessage(null);

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as unknown;

      const localStorageSnapshot = isPlainObject(parsed) && isPlainObject(parsed.localStorageSnapshot)
        ? Object.entries(parsed.localStorageSnapshot).reduce<Record<string, string>>((acc, [key, value]) => {
          if (key.startsWith(APP_STORAGE_PREFIX) && typeof value === "string") {
            acc[key] = value;
          }
          return acc;
        }, {})
        : null;

      if (localStorageSnapshot) {
        applyAppLocalStorageSnapshot(localStorageSnapshot);
      }

      const appStateFromSnapshot = localStorageSnapshot?.[APP_STATE_KEY] ? tryParseJson(localStorageSnapshot[APP_STATE_KEY]) : undefined;
      const valuationFromSnapshot = localStorageSnapshot?.[VALUATION_TIMESERIES_KEY]
        ? tryParseJson(localStorageSnapshot[VALUATION_TIMESERIES_KEY])
        : undefined;

      const appStatePayload = isPlainObject(parsed) && "appState" in parsed
        ? parsed.appState
        : appStateFromSnapshot ?? parsed;
      const valuationPayload = isPlainObject(parsed) && "valuationSeries" in parsed
        ? parsed.valuationSeries
        : valuationFromSnapshot;

      const result = importBackupData({ appState: appStatePayload, valuationSeries: valuationPayload });
      setBackupMessage(result.message);
    } catch {
      setBackupMessage("导入失败：文件内容不是有效 JSON 备份");
    } finally {
      setImportingBackup(false);
    }
  };

  return (
    <div className="-mx-3 -mt-4 bg-white px-4 pb-4 pt-4 md:-mx-4">
      <section className="mb-4 border-b border-[#e2e7ff] pb-4">
        <div className="flex items-center gap-4">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-xl border border-[#e2e7ff] bg-white text-[#24467c]">
            <Wallet size={24} />
            <span className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#00193c] text-white">
              <ShieldCheck size={11} />
            </span>
          </div>
          <div className="min-w-0">
            <h1 className="m-0 typo-page-title">个人中心</h1>
            <p className="m-0 mt-1 typo-body-strong text-[#57657a]">移动端账户设置与资产管理</p>
          </div>
        </div>
      </section>

      <section className="mb-6 grid grid-cols-2 gap-3">
        <article className="rounded-xl border border-[#e2e7ff] bg-white p-4">
          <p className="m-0 typo-section-title">总资产估值</p>
          <p className="m-0 mt-2 text-lg font-extrabold tracking-tight text-[#00193c]">
            ¥{new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(totals.asset)}
          </p>
          <p className="m-0 mt-1 text-[10px] font-semibold text-[#57657a]">{state.funds.length} 只基金</p>
        </article>
        <article className="rounded-xl border border-[#e2e7ff] bg-white p-4">
          <p className="m-0 typo-section-title">当前刷新频率</p>
          <div className="mt-2 max-w-[108px]">
            <TwSelect
              id="settings-refresh-select"
              value={String(state.refreshMs)}
              options={refreshSelectOptions}
              onValueChange={(value) => setRefreshMs(Number(value))}
            />
          </div>
        </article>
      </section>

      <section className="mb-5">
        <h2 className="px-1 text-[11px] font-bold tracking-[0.15em] text-[#747781]">资产与交易</h2>
        <div className="mt-2 rounded-xl border border-[#e2e7ff] bg-white">
          <Link href="/history" className="flex w-full items-center justify-between px-4 py-3.5 text-left">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#e2e7ff] bg-white text-[#24467c]">
                <History size={18} />
              </span>
              <span className="text-sm font-semibold text-[#131b2e]">交易记录</span>
            </div>
            <ChevronRight size={18} className="text-[#747781]" />
          </Link>
          <button
            type="button"
            className="flex w-full items-center justify-between border-t border-[#e2e7ff] px-4 py-3.5 text-left disabled:opacity-70"
            onClick={handleSeedDemoData}
            disabled={seeding || clearingDemo}
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#e2e7ff] bg-white text-[#24467c]">
                {seeding ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              </span>
              <span className="text-sm font-semibold text-[#131b2e]">{seeding ? "写入中..." : "写入演示数据"}</span>
            </div>
            <ChevronRight size={18} className="text-[#747781]" />
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between border-t border-[#e2e7ff] px-4 py-3.5 text-left disabled:opacity-70"
            onClick={handleClearDemoData}
            disabled={seeding || clearingDemo}
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#e2e7ff] bg-white text-[#24467c]">
                {clearingDemo ? <Loader2 size={18} className="animate-spin" /> : <Database size={18} />}
              </span>
              <span className="text-sm font-semibold text-[#131b2e]">{clearingDemo ? "删除中..." : "删除演示数据"}</span>
            </div>
            <ChevronRight size={18} className="text-[#747781]" />
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between border-t border-[#e2e7ff] px-4 py-3.5 text-left disabled:opacity-70"
            onClick={handleExportData}
            disabled={seeding || clearingDemo || importingBackup}
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#e2e7ff] bg-white text-[#24467c]">
                <Download size={18} />
              </span>
              <span className="text-sm font-semibold text-[#131b2e]">导出数据</span>
            </div>
            <ChevronRight size={18} className="text-[#747781]" />
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between border-t border-[#e2e7ff] px-4 py-3.5 text-left disabled:opacity-70"
            onClick={handlePickImportFile}
            disabled={seeding || clearingDemo || importingBackup}
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#e2e7ff] bg-white text-[#24467c]">
                {importingBackup ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              </span>
              <span className="text-sm font-semibold text-[#131b2e]">{importingBackup ? "导入中..." : "导入数据"}</span>
            </div>
            <ChevronRight size={18} className="text-[#747781]" />
          </button>
        </div>
        {seededAt ? <p className="mt-2 px-1 text-[11px] leading-relaxed text-[#57657a]">演示数据已写入（{seededAt}）</p> : null}
        {backupMessage ? <p className="mt-2 px-1 text-[11px] leading-relaxed text-[#57657a]">{backupMessage}</p> : null}
        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleImportFile}
        />
      </section>

      <section className="mb-5">
        <h2 className="px-1 text-[11px] font-bold tracking-[0.15em] text-[#747781]">个人设置</h2>
        <div className="mt-2 rounded-xl border border-[#e2e7ff] bg-white">
          <button type="button" className="flex w-full items-center justify-between px-4 py-3.5 text-left">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#e2e7ff] bg-white text-[#24467c]">
                <Bell size={18} />
              </span>
              <span className="text-sm font-semibold text-[#131b2e]">通知设置</span>
            </div>
            <ChevronRight size={18} className="text-[#747781]" />
          </button>
          <button type="button" className="flex w-full items-center justify-between border-t border-[#e2e7ff] px-4 py-3.5 text-left">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#e2e7ff] bg-white text-[#24467c]">
                <HelpCircle size={18} />
              </span>
              <span className="text-sm font-semibold text-[#131b2e]">帮助与反馈</span>
            </div>
            <ChevronRight size={18} className="text-[#747781]" />
          </button>
          <button type="button" className="flex w-full items-center justify-between border-t border-[#e2e7ff] px-4 py-3.5 text-left" onClick={() => clearAll()}>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#e2e7ff] bg-white text-[#24467c]">
                <Database size={18} />
              </span>
              <span className="text-sm font-semibold text-[#131b2e]">清空本地数据</span>
            </div>
            <ChevronRight size={18} className="text-[#747781]" />
          </button>
        </div>
      </section>

      <section>
        <button type="button" className="w-full rounded-xl border border-[#c4c6d1] bg-white py-3 text-sm font-bold text-red-600">
          退出登录
        </button>
      </section>
    </div>
  );
}
