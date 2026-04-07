"use client";

import { useRouter } from "next/navigation";

import { FundManageView } from "@/components/fund-manage-view";

export default function PortfolioManagePage({ params }: { params: { code: string } }) {
  const router = useRouter();

  return (
    <FundManageView
      code={params.code}
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
