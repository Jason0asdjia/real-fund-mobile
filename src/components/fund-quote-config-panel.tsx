"use client";

import { useEffect, useState } from "react";

import { useAppState } from "@/components/app-provider";
import { fetchBestValuationSource, fetchFundBestSource, isQdiiFund } from "@/lib/fund-api";
import type { FundSnapshot } from "@/lib/types";

type FundQuoteConfigPanelProps = {
  fund: FundSnapshot;
  className?: string;
  onFundPatched?: (patch: Partial<FundSnapshot>) => void;
  onApplyTransientConfig?: (patch: Partial<FundSnapshot>) => Promise<void> | void;
};

export function FundQuoteConfigPanel({ fund, className = "", onFundPatched, onApplyTransientConfig }: FundQuoteConfigPanelProps) {
  const { refreshFunds, state, updateFundQuoteConfig } = useAppState();
  const [qdiiEligible, setQdiiEligible] = useState(false);
  const [bestSource, setBestSource] = useState<1 | 2 | 3 | 4 | null>(null);
  const [accuracyLabel, setAccuracyLabel] = useState<string | null>(null);
  const isFundInList = state.funds.some((item) => item.code === fund.code);

  useEffect(() => {
    let active = true;

    void Promise.all([
      isQdiiFund(fund.code).catch(() => false),
      fetchFundBestSource(fund.code).catch(() => null),
      Number.isFinite(Number(fund.zzl)) && fund.jzrq
        ? fetchBestValuationSource(fund.code, fund.jzrq, Number(fund.zzl)).catch(() => null)
        : Promise.resolve(null),
    ]).then(([qdii, nextBestSource, accuracy]) => {
      if (!active) return;
      setQdiiEligible(qdii);
      setBestSource(nextBestSource);
      setAccuracyLabel(
        accuracy?.isTodayAccuracy
          ? "今日推荐"
          : accuracy?.isYesterdayAccuracy
            ? "昨日推荐"
            : null,
      );
    });

    return () => {
      active = false;
    };
  }, [fund.code, fund.jzrq, fund.zzl]);

  const handleQuoteConfigChange = async (next: { dataSource?: 1 | 2 | 3 | 4; autoSource?: boolean }) => {
    const patch = {
      ...(next.dataSource !== undefined ? { dataSource: next.dataSource } : {}),
      ...(next.autoSource !== undefined ? { autoSource: next.autoSource } : {}),
    } satisfies Partial<FundSnapshot>;

    onFundPatched?.(patch);

    if (!isFundInList) {
      await onApplyTransientConfig?.(patch);
      return;
    }

    updateFundQuoteConfig(fund.code, next);
    void refreshFunds();
  };

  const quoteSourceOptions = [
    { id: 1 as const, label: "东财" },
    { id: 2 as const, label: "新浪 2" },
    { id: 3 as const, label: "新浪 3" },
    ...(qdiiEligible || fund.dataSource === 4 ? [{ id: 4 as const, label: "QDII" }] : []),
  ];

  return (
    <div className={`rounded-xl border border-[#e2e7ff] bg-white ${className}`.trim()}>
      <div className="px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <p className="m-0 shrink-0 text-sm font-semibold text-[#131b2e]">估值数据源</p>
          <p className="m-0 min-w-0 text-right text-[11px] text-[#57657a]">
            {fund.autoSource ? "自动选择最佳源" : `当前手动源：${fund.dataSource ?? 1} 号`}
            {bestSource ? `，预计算最佳源：${bestSource} 号` : ""}
            {accuracyLabel ? `，${accuracyLabel}` : ""}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`inline-flex shrink-0 items-center rounded-md border px-3 py-1.5 text-[11px] font-semibold ${fund.autoSource ? "border-[#bfd4ff] bg-[#edf4ff] text-[#005bc0]" : "border-[#d5dbea] bg-white text-[#24467c]"}`}
            onClick={() => handleQuoteConfigChange({ autoSource: !fund.autoSource })}
          >
            自动
          </button>
          {quoteSourceOptions.map((option) => {
            const active = !fund.autoSource && (fund.dataSource ?? 1) === option.id;
            return (
              <button
                key={option.id}
                type="button"
                className={`inline-flex items-center rounded-md border px-3 py-1.5 text-[11px] font-semibold ${active ? "border-[#bfd4ff] bg-[#edf4ff] text-[#005bc0]" : "border-[#d5dbea] bg-white text-[#24467c]"}`}
                onClick={() => handleQuoteConfigChange({ dataSource: option.id, autoSource: false })}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
