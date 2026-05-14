"use client";

import { useParams } from "next/navigation";

import { FundBuyView } from "@/components/fund-buy-view";

export default function PortfolioBuyPage() {
  const params = useParams<{ code: string }>();
  return <FundBuyView code={params.code} />;
}
