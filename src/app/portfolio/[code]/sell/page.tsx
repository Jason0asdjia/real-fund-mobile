"use client";

import { useParams } from "next/navigation";

import { FundSellView } from "@/components/fund-sell-view";

export default function PortfolioSellPage() {
  const params = useParams<{ code: string }>();
  return <FundSellView code={params.code} />;
}
