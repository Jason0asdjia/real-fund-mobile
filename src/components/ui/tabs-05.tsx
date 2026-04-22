import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

export type Tabs05Item = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type Tabs05Props = {
  items: Tabs05Item[];
  pathname: string;
  className?: string;
  style?: CSSProperties;
};

export function Tabs05({ items, pathname, className, style }: Tabs05Props) {
  return (
    <nav className={clsx("bottom-nav", className)} style={style} aria-label="主导航">
      <div className="bottom-nav__list">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx("bottom-nav__item", active && "bottom-nav__item--active")}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={18} strokeWidth={2} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
