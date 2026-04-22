"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Github, Loader2, ShieldAlert } from "lucide-react";

import { useAppState } from "@/components/app-provider";
import { useAuth } from "@/components/auth-provider";
import { BottomNav } from "@/components/bottom-nav";

const routeOrder = ["/portfolio", "/discover", "/market", "/history", "/settings", "/dashboard"];

const getSectionPath = (pathname: string) => {
  const matched = routeOrder.find((item) => pathname.startsWith(item));
  return matched || "/portfolio";
};

const getRouteIndex = (pathname: string) => {
  const index = routeOrder.findIndex((item) => pathname.startsWith(item));
  return index === -1 ? 0 : index;
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const isDevNoAuth = process.env.NODE_ENV !== "production";
  const pathname = usePathname();
  const { conflictResolution, resolveDataConflict, hydrated, state, cloudSyncStatus, refreshFromLocalState } = useAppState();
  const { user, authLoading, authError, isConfigured, signInWithGitHub } = useAuth();
  const sectionPath = getSectionPath(pathname);
  const previousIndexRef = useRef(getRouteIndex(pathname));

  const currentIndex = getRouteIndex(pathname);
  const direction = currentIndex >= previousIndexRef.current ? 1 : -1;
  const hasLocalRuntimeData = hydrated && (
    state.funds.length > 0
    || Object.keys(state.holdings).length > 0
    || Object.values(state.transactions).some((items) => Array.isArray(items) && items.length > 0)
  );

  useEffect(() => {
    previousIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    if (pathname !== "/portfolio") return;
    refreshFromLocalState();

    const refreshPortfolioSnapshot = () => {
      if (window.location.pathname === "/portfolio") {
        refreshFromLocalState();
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshPortfolioSnapshot();
      }
    };

    window.addEventListener("pageshow", refreshPortfolioSnapshot);
    window.addEventListener("popstate", refreshPortfolioSnapshot);
    window.addEventListener("focus", refreshPortfolioSnapshot);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pageshow", refreshPortfolioSnapshot);
      window.removeEventListener("popstate", refreshPortfolioSnapshot);
      window.removeEventListener("focus", refreshPortfolioSnapshot);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pathname, refreshFromLocalState]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("app-modal-open", conflictResolution.open || cloudSyncStatus.open);
    return () => {
      document.body.classList.remove("app-modal-open");
    };
  }, [cloudSyncStatus.open, conflictResolution.open]);

  if (authLoading && !isDevNoAuth && !hasLocalRuntimeData) {
    return (
      <div className="app-frame">
        <div className="ambient ambient--one" />
        <div className="ambient ambient--two" />
        <main className="app-main flex items-center justify-center p-4">
          <div className="flex items-center gap-2 rounded-lg border border-[#e2e7ff] bg-white px-4 py-3 text-sm font-medium text-[#57657a]">
            <Loader2 size={16} className="animate-spin" />
            正在加载用户状态...
          </div>
        </main>
      </div>
    );
  }

  if (!isConfigured && !isDevNoAuth) {
    return (
      <div className="app-frame">
        <div className="ambient ambient--one" />
        <div className="ambient ambient--two" />
        <main className="app-main flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#e2e7ff] bg-white p-5 text-[#131b2e]">
            <div className="mb-2 flex items-center gap-2 text-[#ba1a1a]">
              <ShieldAlert size={16} />
              <span className="text-sm font-semibold">未配置 Supabase</span>
            </div>
            <p className="m-0 text-sm leading-relaxed text-[#57657a]">
              请先配置 <code>NEXT_PUBLIC_SUPABASE_URL</code> 与 <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>，再使用 GitHub 登录查看用户数据。
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (!user && !isDevNoAuth && !hasLocalRuntimeData) {
    return (
      <div className="app-frame">
        <div className="ambient ambient--one" />
        <div className="ambient ambient--two" />
        <main className="app-main flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#e2e7ff] bg-white p-5 text-[#131b2e]">
            <h1 className="m-0 typo-page-title">登录后查看你的数据</h1>
            <p className="mt-2 text-sm text-[#57657a]">未登录状态不会展示持仓、交易与个人偏好数据。</p>
            {authError ? <p className="mt-2 text-xs leading-relaxed text-[#ba1a1a]">{authError}</p> : null}
            <button
              type="button"
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#d5dbea] bg-white px-4 text-sm font-semibold text-[#131b2e] shadow-[0_8px_24px_rgba(19,27,46,0.06)] transition-colors hover:bg-[#f7f9ff]"
              onClick={() => {
                void signInWithGitHub();
              }}
            >
              <Github size={16} />
              使用 GitHub 登录
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-frame">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />

      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={sectionPath}
          className="app-main"
          initial={{ opacity: 0, x: 28 * direction }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -18 * direction }}
          transition={{ duration: 0.24, ease: "easeOut" }}
        >
          {children}
        </motion.main>
      </AnimatePresence>

      <BottomNav />

      {conflictResolution.open ? (
        <div className="app-modal-backdrop">
          <div className="app-modal-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="app-modal-sheet__grabber" />
            <div className="app-modal-sheet__header">
              <h2 className="m-0 text-base font-bold text-[#131b2e]">检测到数据冲突</h2>
            </div>
            <div className="app-modal-sheet__content">
              <p className="text-sm leading-relaxed text-[#57657a]">
                该账号在云端已有数据，同时当前设备也有本地数据。请选择处理方式。
              </p>

              <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-[#e2e7ff] bg-[#f8f9ff] p-3 text-xs text-[#57657a]">
                <div>
                  <p className="m-0 font-semibold text-[#131b2e]">本地</p>
                  <p className="m-0 mt-1">基金 {conflictResolution.localSummary.funds}</p>
                  <p className="m-0">持仓 {conflictResolution.localSummary.holdings}</p>
                  <p className="m-0">交易 {conflictResolution.localSummary.transactions}</p>
                </div>
                <div>
                  <p className="m-0 font-semibold text-[#131b2e]">云端</p>
                  <p className="m-0 mt-1">基金 {conflictResolution.cloudSummary.funds}</p>
                  <p className="m-0">持仓 {conflictResolution.cloudSummary.holdings}</p>
                  <p className="m-0">交易 {conflictResolution.cloudSummary.transactions}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2">
                <button
                  type="button"
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#d5dbea] bg-white px-3 text-sm font-semibold text-[#131b2e] disabled:opacity-60"
                  disabled={conflictResolution.resolving}
                  onClick={() => {
                    void resolveDataConflict("keep_local");
                  }}
                >
                  保留本地（覆盖云端）
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#d5dbea] bg-white px-3 text-sm font-semibold text-[#131b2e] disabled:opacity-60"
                  disabled={conflictResolution.resolving}
                  onClick={() => {
                    void resolveDataConflict("keep_cloud");
                  }}
                >
                  保留云端
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#00193c] px-3 text-sm font-semibold !text-white disabled:opacity-60"
                  disabled={conflictResolution.resolving}
                  onClick={() => {
                    void resolveDataConflict("merge");
                  }}
                >
                  合并（推荐）
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {!conflictResolution.open && cloudSyncStatus.open ? (
        <div className="app-modal-backdrop">
          <div className="app-modal-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="app-modal-sheet__grabber" />
            <div className="app-modal-sheet__header">
              <h2 className="m-0 text-base font-bold text-[#131b2e]">{cloudSyncStatus.title}</h2>
            </div>
            <div className="app-modal-sheet__content pb-5">
              <div className="flex items-center gap-3 rounded-xl border border-[#e2e7ff] bg-[#f8f9ff] px-4 py-4 text-sm text-[#57657a]">
                <Loader2 size={18} className="animate-spin text-[#24467c]" />
                <span>{cloudSyncStatus.message}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
