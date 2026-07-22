"use client";

import clsx from "clsx";
import { BarChart3, History, Settings2, TrendingUp } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAppState } from "@/components/app-provider";
import { Tabs05 } from "@/components/ui/tabs-05";

const items = [
  { href: "/portfolio", label: "持仓总览", icon: BarChart3 },
  { href: "/market", label: "行情中心", icon: TrendingUp },
  { href: "/history", label: "交易历史", icon: History },
  { href: "/settings", label: "个人中心", icon: Settings2 },
];

export function BottomNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const { state, autoRefreshCycleStartedAt, manualRefreshInProgress } = useAppState();
  const [flashActive, setFlashActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const lastCycleStartRef = useRef<number | null>(autoRefreshCycleStartedAt);
  const cycleStartRef = useRef<number | null>(autoRefreshCycleStartedAt);

  useEffect(() => {
    if (!autoRefreshCycleStartedAt) return;

    const isNewCycle = lastCycleStartRef.current !== null && lastCycleStartRef.current !== autoRefreshCycleStartedAt;
    lastCycleStartRef.current = autoRefreshCycleStartedAt;
    cycleStartRef.current = autoRefreshCycleStartedAt;
    setProgress(Math.min(Math.max((Date.now() - autoRefreshCycleStartedAt) / Math.max(state.refreshMs, 1), 0), 1));

    if (!isNewCycle || manualRefreshInProgress) return;

    setFlashActive(true);
    const timer = window.setTimeout(() => setFlashActive(false), 900);
    return () => window.clearTimeout(timer);
  }, [autoRefreshCycleStartedAt, manualRefreshInProgress, state.refreshMs]);

  useEffect(() => {
    let frameId = 0;

    const tick = () => {
      if (!cycleStartRef.current) return;

      const cycle = Math.max(state.refreshMs, 1);
      const elapsed = Date.now() - cycleStartRef.current;
      const nextProgress = Math.min(Math.max(elapsed / cycle, 0), 1);
      setProgress((prev) => (Math.abs(prev - nextProgress) < 0.001 ? prev : nextProgress));

      if (nextProgress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [autoRefreshCycleStartedAt, state.refreshMs]);

  useEffect(() => {
    if (!manualRefreshInProgress) return;
    setProgress(0);
    setFlashActive(false);
  }, [manualRefreshInProgress]);

  return (
    <Tabs05
      items={items}
      pathname={pathname}
      className={clsx(className, flashActive && "bottom-nav--flash")}
      style={{
        ["--bottom-nav-progress" as string]: manualRefreshInProgress ? "0" : progress.toString(),
      }}
    />
  );
}
