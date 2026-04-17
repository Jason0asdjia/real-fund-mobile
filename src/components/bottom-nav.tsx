"use client";

import clsx from "clsx";
import { BarChart3, History, Settings2, TrendingUp } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAppState } from "@/components/app-provider";

const items = [
  { href: "/portfolio", label: "持仓总览", icon: BarChart3 },
  { href: "/market", label: "行情中心", icon: TrendingUp },
  { href: "/history", label: "交易历史", icon: History },
  { href: "/settings", label: "个人中心", icon: Settings2 },
];

export function BottomNav() {
  const pathname = usePathname();
  const { state, passiveRefreshAt } = useAppState();
  const [flashActive, setFlashActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const lastPassiveRefreshRef = useRef<number | null>(passiveRefreshAt);
  const cycleStartRef = useRef<number | null>(passiveRefreshAt);

  useEffect(() => {
    if (!passiveRefreshAt) return;
    const isNewPassiveRefresh = lastPassiveRefreshRef.current !== null && lastPassiveRefreshRef.current !== passiveRefreshAt;

    lastPassiveRefreshRef.current = passiveRefreshAt;
    cycleStartRef.current = passiveRefreshAt;
    setProgress(Math.min(Math.max((Date.now() - passiveRefreshAt) / Math.max(state.refreshMs, 1), 0), 1));

    if (!isNewPassiveRefresh) {
      return;
    }

    setFlashActive(true);
    const timer = window.setTimeout(() => setFlashActive(false), 900);
    return () => window.clearTimeout(timer);
  }, [passiveRefreshAt, state.refreshMs]);

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
  }, [passiveRefreshAt, state.refreshMs]);

  return (
    <nav
      className={clsx("bottom-nav", flashActive && "bottom-nav--flash")}
      aria-label="主导航"
      style={{
        ["--bottom-nav-progress" as string]: progress.toString(),
        ["--bottom-nav-progress-angle" as string]: `${Math.max(0, Math.min(progress, 1)) * 360}deg`,
        ["--bottom-nav-progress-mid-angle" as string]: `${Math.max(0, Math.min(progress, 1)) * 208.8}deg`,
        ["--refresh-cycle" as string]: `${state.refreshMs}ms`,
      }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link key={item.href} href={item.href} className={clsx("bottom-nav__item", active && "bottom-nav__item--active")}>
            <Icon size={18} strokeWidth={2} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
