"use client";

import clsx from "clsx";
import { BarChart3, Compass, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/portfolio", label: "持仓总览", icon: BarChart3 },
  { href: "/discover", label: "发现", icon: Compass },
  { href: "/settings", label: "设置", icon: Settings2 },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="主导航">
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;

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
