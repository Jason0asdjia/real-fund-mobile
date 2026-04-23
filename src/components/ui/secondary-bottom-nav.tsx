"use client";

import clsx from "clsx";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type SecondaryBottomNavProps = {
  children: ReactNode;
  listClassName?: string;
  className?: string;
};

export function SecondaryBottomNav({ children, listClassName, className }: SecondaryBottomNavProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <nav className={clsx("bottom-nav bottom-nav--secondary", className)}>
      <div className={clsx("bottom-nav__list", listClassName)}>{children}</div>
    </nav>,
    document.body,
  );
}
