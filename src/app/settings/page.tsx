"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEventHandler } from "react";
import { Bell, ChevronRight, CloudDownload, CloudUpload, Database, Download, HelpCircle, History, Loader2, ShieldCheck, Upload, Wallet } from "lucide-react";

import { useAppState } from "@/components/app-provider";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useAuth } from "@/components/auth-provider";
import { TwSelect } from "@/components/ui/tw-select";
import { getHoldingMetrics } from "@/lib/portfolio";
import { APP_STATE_KEY } from "@/lib/storage";
import { formatLocalTimestamp, toMarketTime } from "@/lib/time";
import { VALUATION_TIMESERIES_KEY } from "@/lib/valuation-timeseries";

const APP_STORAGE_PREFIX = "real-fund-mobile:";
const MANUAL_SYNC_UPLOAD_AT_KEY = `${APP_STORAGE_PREFIX}manual-sync-upload-at`;
const MANUAL_SYNC_PULL_AT_KEY = `${APP_STORAGE_PREFIX}manual-sync-pull-at`;
const MANUAL_SYNC_EXPORT_AT_KEY = `${APP_STORAGE_PREFIX}manual-sync-export-at`;
const MANUAL_SYNC_IMPORT_AT_KEY = `${APP_STORAGE_PREFIX}manual-sync-import-at`;

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
  const { state, seeding, setRefreshMs, clearLocalOnly, valuationSeries, importBackupData, pushCloudConfig, pushCloudConfigUploadOnly, pullCloudConfig } = useAppState();
  const { user, signOut } = useAuth();
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [lastManualUploadAt, setLastManualUploadAt] = useState<string | null>(null);
  const [lastManualPullAt, setLastManualPullAt] = useState<string | null>(null);
  const [lastManualExportAt, setLastManualExportAt] = useState<string | null>(null);
  const [lastManualImportAt, setLastManualImportAt] = useState<string | null>(null);
  const [importingBackup, setImportingBackup] = useState(false);
  const [uploadingCloud, setUploadingCloud] = useState(false);
  const [pullingCloud, setPullingCloud] = useState(false);
  const [clearDataModalOpen, setClearDataModalOpen] = useState(false);
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
  const avatarUrl = useMemo(() => {
    const metadata = user?.user_metadata;
    if (!metadata || typeof metadata !== "object") return null;

    const candidates = [
      metadata.avatar_url,
      metadata.picture,
      metadata.avatar,
    ];

    return candidates.find((value): value is string => typeof value === "string" && value.length > 0) || null;
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const read = () => {
      setLastManualUploadAt(window.localStorage.getItem(MANUAL_SYNC_UPLOAD_AT_KEY));
      setLastManualPullAt(window.localStorage.getItem(MANUAL_SYNC_PULL_AT_KEY));
      setLastManualExportAt(window.localStorage.getItem(MANUAL_SYNC_EXPORT_AT_KEY));
      setLastManualImportAt(window.localStorage.getItem(MANUAL_SYNC_IMPORT_AT_KEY));
    };
    read();

    const timer = window.setInterval(read, 1500);
    return () => window.clearInterval(timer);
  }, []);

  const displayName = useMemo(() => {
    const metadata = user?.user_metadata;
    if (!metadata || typeof metadata !== "object") return "个人中心";

    const candidates = [
      metadata.user_name,
      metadata.preferred_username,
      metadata.full_name,
      metadata.name,
    ];

    return candidates.find((value): value is string => typeof value === "string" && value.trim().length > 0) || "个人中心";
  }, [user]);

  const handleExportData = async () => {
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
    const timestamp = formatLocalTimestamp();
    setLastManualExportAt(timestamp);
    window.localStorage.setItem(MANUAL_SYNC_EXPORT_AT_KEY, timestamp);

    let syncTip = "";
    if (user?.id) {
      const syncResult = await pushCloudConfigUploadOnly();
      if (!syncResult.ok) {
        syncTip = `，云端同步失败：${syncResult.message}`;
      } else if (syncResult.status === "uploaded" || syncResult.status === "synced") {
        syncTip = "，已同步至云端";
      } else if (syncResult.status === "cloud_newer") {
        syncTip = "，云端版本更新，未执行上传，请先拉取或手动合并";
      } else if (syncResult.status === "needs_user_resolution") {
        syncTip = "，检测到云端有并发改动，请手动同步处理冲突";
      }
    }

    setBackupMessage(`已导出备份文件（${toMarketTime(undefined, "HH:mm")}）${syncTip}`);
  };

  const handlePickImportFile = () => {
    if (importingBackup) return;
    importInputRef.current?.click();
  };

  const handlePushCloud = async () => {
    if (uploadingCloud || pullingCloud) return;
    setUploadingCloud(true);
    const timestamp = formatLocalTimestamp();
    setLastManualUploadAt(timestamp);
    window.localStorage.setItem(MANUAL_SYNC_UPLOAD_AT_KEY, timestamp);

    const result = await pushCloudConfig();
    if (!result.ok) {
      window.localStorage.removeItem(MANUAL_SYNC_UPLOAD_AT_KEY);
      setLastManualUploadAt(null);
    }
    setCloudMessage(result.message);
    setUploadingCloud(false);
  };

  const handlePullCloud = async () => {
    if (uploadingCloud || pullingCloud) return;
    setPullingCloud(true);
    const result = await pullCloudConfig();

    let nextMessage = result.message;
    if (result.ok) {
      const timestamp = formatLocalTimestamp();
      setLastManualPullAt(timestamp);
      window.localStorage.setItem(MANUAL_SYNC_PULL_AT_KEY, timestamp);

      const syncResult = await pushCloudConfig();
      if (!syncResult.ok) {
        nextMessage = `${result.message}（拉取时间回写云端失败：${syncResult.message}）`;
      }
    }
    setCloudMessage(nextMessage);
    setPullingCloud(false);
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
      if (result.ok) {
        const timestamp = formatLocalTimestamp();
        setLastManualImportAt(timestamp);
        window.localStorage.setItem(MANUAL_SYNC_IMPORT_AT_KEY, timestamp);

        if (user?.id) {
          const syncResult = await pushCloudConfig();
          if (!syncResult.ok) {
            setBackupMessage(`${result.message}（云端同步失败：${syncResult.message}）`);
          }
        }
      }
    } catch {
      setBackupMessage("导入失败：文件内容不是有效 JSON 备份");
    } finally {
      setImportingBackup(false);
    }
  };

  return (
    <div className="-mx-3 -mt-4 bg-white px-4 pt-4 md:-mx-4">
      <div className="-mx-4 border-b border-[#e2e7ff] bg-white px-4 pb-3 pt-4">
        <section className="mb-4 border-b border-[#e2e7ff] pb-4">
          <div className="flex items-center gap-4">
            <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-[#e2e7ff] bg-white text-[#24467c]">
              {avatarUrl ? (
                <div
                  className="h-full w-full bg-cover bg-center bg-no-repeat"
                  style={{ backgroundImage: `url(${avatarUrl})` }}
                  aria-label="GitHub avatar"
                />
              ) : (
                <Wallet size={24} />
              )}
              <span className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#00193c] text-white">
                <ShieldCheck size={11} />
              </span>
            </div>
            <div className="min-w-0">
              <h1 className="m-0 typo-page-title">{displayName}</h1>
              <p className="m-0 mt-1 typo-body-strong text-[#57657a]">{user?.email || "移动端账户设置与资产管理"}</p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
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
      </div>

      <main className="px-0 pb-3 pt-3">

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
            onClick={() => {
              void handleExportData();
            }}
            disabled={seeding || importingBackup}
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#e2e7ff] bg-white text-[#24467c]">
                <Upload size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#131b2e]">导出数据</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-[#57657a]">
                  {lastManualExportAt ? `上次导出：${lastManualExportAt}` : "上次导出：未记录"}
                </span>
              </span>
            </div>
            <ChevronRight size={18} className="text-[#747781]" />
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between border-t border-[#e2e7ff] px-4 py-3.5 text-left disabled:opacity-70"
            onClick={handlePickImportFile}
            disabled={seeding || importingBackup}
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#e2e7ff] bg-white text-[#24467c]">
                {importingBackup ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#131b2e]">{importingBackup ? "导入中..." : "导入数据"}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-[#57657a]">
                  {lastManualImportAt ? `上次导入：${lastManualImportAt}` : "上次导入：未记录"}
                </span>
              </span>
            </div>
            <ChevronRight size={18} className="text-[#747781]" />
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between border-t border-[#e2e7ff] px-4 py-3.5 text-left disabled:opacity-70"
            onClick={() => {
              void handlePushCloud();
            }}
            disabled={uploadingCloud || pullingCloud}
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#e2e7ff] bg-white text-[#24467c]">
                {uploadingCloud ? <Loader2 size={18} className="animate-spin" /> : <CloudUpload size={18} />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#131b2e]">{uploadingCloud ? "上传中..." : "上传配置到云端"}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-[#57657a]">
                  {lastManualUploadAt ? `上次上传：${lastManualUploadAt}` : "上次上传：未记录"}
                </span>
              </span>
            </div>
            <ChevronRight size={18} className="text-[#747781]" />
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between border-t border-[#e2e7ff] px-4 py-3.5 text-left disabled:opacity-70"
            onClick={() => {
              void handlePullCloud();
            }}
            disabled={uploadingCloud || pullingCloud}
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#e2e7ff] bg-white text-[#24467c]">
                {pullingCloud ? <Loader2 size={18} className="animate-spin" /> : <CloudDownload size={18} />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#131b2e]">{pullingCloud ? "拉取中..." : "拉取云端配置"}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-[#57657a]">
                  {lastManualPullAt ? `上次拉取：${lastManualPullAt}` : "上次拉取：未记录"}
                </span>
              </span>
            </div>
            <ChevronRight size={18} className="text-[#747781]" />
          </button>
        </div>
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
        <h2 className="px-1 text-[11px] font-bold tracking-[0.15em] text-[#747781]">数据版本</h2>
        <div className="mt-2 rounded-xl border border-[#e2e7ff] bg-white px-4 py-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#57657a]">本地版本</span>
            <span className="font-semibold tabular-nums text-[#131b2e]">
              v{state.sync.dataVersion}
              {state.sync.updatedAt ? ` · ${state.sync.updatedAt}` : ""}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs border-t border-[#e2e7ff]/40 pt-2">
            <span className="text-[#57657a]">云端版本</span>
            <span className="font-semibold tabular-nums text-[#131b2e]">
              {state.sync.lastSyncedVersion > 0
                ? `v${state.sync.lastSyncedVersion}${state.sync.lastSyncedAt ? ` · ${state.sync.lastSyncedAt}` : ""}`
                : "未同步"}
            </span>
          </div>
        </div>
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
          <button type="button" className="flex w-full items-center justify-between border-t border-[#e2e7ff] px-4 py-3.5 text-left" onClick={() => setClearDataModalOpen(true)}>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#e2e7ff] bg-white text-[#24467c]">
                <Database size={18} />
              </span>
              <span className="text-sm font-semibold text-[#131b2e]">清空本地数据</span>
            </div>
            <ChevronRight size={18} className="text-[#747781]" />
          </button>
        </div>
        {cloudMessage ? <p className="mt-2 px-1 text-[11px] leading-relaxed text-[#57657a]">{cloudMessage}</p> : null}
      </section>

      <section>
        <button
          type="button"
          className="w-full rounded-xl border border-[#c4c6d1] bg-white py-3 text-sm font-bold text-red-600"
          onClick={() => {
            void signOut();
          }}
        >
          退出登录
        </button>
      </section>
      </main>

      <ConfirmModal
        open={clearDataModalOpen}
        onClose={() => setClearDataModalOpen(false)}
        title="确认清空本地数据"
        confirmText="确认清空"
        variant="danger"
        onConfirm={() => {
          clearLocalOnly();
          setClearDataModalOpen(false);
        }}
      >
        <p className="m-0 text-sm leading-6 text-[#57657a]">将清空所有本地持仓、交易记录、搜索历史和偏好设置。此操作无法撤销。</p>
      </ConfirmModal>
    </div>
  );
}
