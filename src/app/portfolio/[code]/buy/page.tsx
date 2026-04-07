"use client";

import { FundBuyView } from "@/components/fund-buy-view";

export default function PortfolioBuyPage({ params }: { params: { code: string } }) {
  return <FundBuyView code={params.code} />;
}
