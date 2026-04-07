"use client";

import { FundSellView } from "@/components/fund-sell-view";

export default function PortfolioSellPage({ params }: { params: { code: string } }) {
  return <FundSellView code={params.code} />;
}
