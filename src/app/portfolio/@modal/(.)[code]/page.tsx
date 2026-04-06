"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { FundDetailView } from "@/components/fund-detail-view";

export default function PortfolioModalDetailPage({ params }: { params: { code: string } }) {
  const router = useRouter();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.body.classList.add("app-modal-open");

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      document.body.classList.remove("app-modal-open");
    };
  }, []);

  return (
    <div className="detail-overlay" role="dialog" aria-modal="true" aria-label="基金详情页">
      <div className="detail-overlay__panel detail-overlay__panel--page">
        <FundDetailView code={params.code} onBack={() => router.push("/portfolio")} asModal />
      </div>
    </div>
  );
}
