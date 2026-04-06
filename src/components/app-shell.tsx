"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { BottomNav } from "@/components/bottom-nav";

const routeOrder = ["/portfolio", "/discover", "/settings", "/dashboard"];

const getSectionPath = (pathname: string) => {
  const matched = routeOrder.find((item) => pathname.startsWith(item));
  return matched || "/portfolio";
};

const getRouteIndex = (pathname: string) => {
  const index = routeOrder.findIndex((item) => pathname.startsWith(item));
  return index === -1 ? 0 : index;
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sectionPath = getSectionPath(pathname);
  const previousIndexRef = useRef(getRouteIndex(pathname));

  const currentIndex = getRouteIndex(pathname);
  const direction = currentIndex >= previousIndexRef.current ? 1 : -1;

  useEffect(() => {
    previousIndexRef.current = currentIndex;
  }, [currentIndex]);

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
    </div>
  );
}
