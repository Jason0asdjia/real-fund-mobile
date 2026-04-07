"use client";

import { useRouter } from "next/navigation";

import { FundDetailView } from "@/components/fund-detail-view";

export default function PortfolioDetailPage({ params }: { params: { code: string } }) {
  const router = useRouter();
  return (
    <FundDetailView
      code={params.code}
      onBack={() => {
        if (window.history.length > 1) {
          router.back();
          return;
        }
        router.push("/portfolio");
      }}
    />
  );
}
