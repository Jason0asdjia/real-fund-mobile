"use client";

import { useRouter } from "next/navigation";

import { FundManageView } from "@/components/fund-manage-view";

export default function PortfolioManagePage({
  params,
  searchParams,
}: {
  params: { code: string };
  searchParams?: { from?: string };
}) {
  const router = useRouter();
  const redirectOnConfirm = searchParams?.from === "discover" ? "/portfolio" : null;

  return (
    <FundManageView
      code={params.code}
      redirectOnConfirm={redirectOnConfirm}
      onBack={() => {
        if (window.history.length > 1) {
          router.back();
          return;
        }
        router.push(`/portfolio/${params.code}`);
      }}
    />
  );
}
