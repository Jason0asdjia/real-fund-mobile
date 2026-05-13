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
  const redirectOnConfirm = searchParams?.from === "discover"
    ? "/portfolio"
    : searchParams?.from === "detail"
      ? `/portfolio/${params.code}`
      : null;

  return (
    <FundManageView
      code={params.code}
      redirectOnConfirm={redirectOnConfirm}
      onBack={() => {
        if (searchParams?.from === "detail") {
          if (window.history.length > 1) {
            router.back();
          } else {
            router.replace(`/portfolio/${params.code}`);
          }
          return;
        }
        if (window.history.length > 1) {
          router.back();
          return;
        }
        router.push(`/portfolio/${params.code}`);
      }}
    />
  );
}
