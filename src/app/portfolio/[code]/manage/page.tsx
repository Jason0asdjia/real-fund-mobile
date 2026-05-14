"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";

import { FundManageView } from "@/components/fund-manage-view";

export default function PortfolioManagePage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");

  const redirectOnConfirm = from === "discover"
    ? "/portfolio"
    : from === "detail"
      ? `/portfolio/${params.code}`
      : null;

  return (
    <FundManageView
        code={params.code}
        redirectOnConfirm={redirectOnConfirm}
        onBack={() => {
          if (from === "detail") {
            if (window.history.length > 1) {
              router.back();
              return;
            }

            router.replace(`/portfolio/${params.code}`);
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
