"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Info, Repeat2 } from "lucide-react";
import { DatePicker } from "antd";
import dayjs from "dayjs";

import { useAppState } from "@/components/app-provider";
import { formatCurrency, formatSignedCurrency } from "@/lib/portfolio";
import { holdingDaysInMarket, isBeforeTradeCutoffInMarket, todayInMarket } from "@/lib/time";

type FundSellViewProps = {
  code: string;
};

const FEE_RATE = 0.0015;

const toNumber = (value: string) => {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;
  const next = Number(normalized);
  return Number.isFinite(next) ? next : null;
};

export function FundSellView({ code }: FundSellViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addTransaction, state } = useAppState();
  const fund = state.funds.find((item) => item.code === code);
  const holding = fund ? state.holdings[fund.code] : undefined;

  const [mode, setMode] = useState<"amount" | "share">("amount");
  const [amountInput, setAmountInput] = useState("");
  const [shareInput, setShareInput] = useState("");
  const [tradeDate, setTradeDate] = useState(todayInMarket());
  const [beforeClose, setBeforeClose] = useState(() => isBeforeTradeCutoffInMarket());
  const returnToDetail = searchParams.get("from") === "detail";

  const handleBack = () => {
    if (returnToDetail) {
      router.back();
      return;
    }
    router.replace(`/portfolio/${code}`);
  };

  useEffect(() => {
    document.body.classList.add("app-detail-open");
    return () => {
      document.body.classList.remove("app-detail-open");
    };
  }, []);

  if (!fund) {
    return (
      <div className="-mx-3 -mb-24 -mt-4 min-h-[calc(100dvh-5.5rem)] bg-white md:-mx-4 md:-mb-24 md:-mt-4">
        <header className="z-20 shrink-0 border-b border-[#e2e7ff] bg-white">
          <div className="relative min-h-12 px-3 py-1">
            <button
              type="button"
              className="absolute left-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 text-sm font-normal text-[#24467c]"
              onClick={() => router.push("/portfolio")}
            >
              <ChevronLeft size={16} />
              返回
            </button>
            <div className="mx-auto max-w-[72%] text-center">
              <h1 className="typo-body-strong">基金减仓</h1>
            </div>
          </div>
        </header>
      </div>
    );
  }

  const latestNavRaw = Number(fund.dwjz ?? 0);
  const latestNav = Number.isFinite(latestNavRaw) && latestNavRaw > 0 ? latestNavRaw : 0;
  const holdingShare = holding?.share != null && Number.isFinite(Number(holding.share)) ? Number(holding.share) : null;
  const holdingCost = holding?.cost != null && Number.isFinite(Number(holding.cost)) ? Number(holding.cost) : null;
  const holdingAmount = holdingShare != null && latestNav > 0 ? holdingShare * latestNav : null;
  const holdingProfit = holdingShare != null && holdingCost != null && latestNav > 0 ? (latestNav - holdingCost) * holdingShare : null;
  const maxSellShare = Math.max(Number(holding?.share || 0), 0);
  const maxSellAmount = Math.max(maxSellShare * latestNav, 0);
  const shareRaw = mode === "share" ? toNumber(shareInput) || 0 : latestNav > 0 ? (toNumber(amountInput) || 0) / latestNav : 0;
  const share = Math.min(Math.max(shareRaw, 0), maxSellShare);
  const amount = Math.min(Math.max(share * latestNav, 0), maxSellAmount);
  const estimatedFee = amount * FEE_RATE;

  const handleConfirm = () => {
    if (!latestNav || amount <= 0 || share <= 0) return;
    addTransaction(fund.code, {
      date: tradeDate,
      type: "sell",
      share,
      price: latestNav,
      fee: estimatedFee,
      note: beforeClose ? "15:00前下单" : "15:00后下单",
    });
    handleBack();
  };

  return (
    <div className="-mx-3 -mb-24 -mt-4 flex h-[calc(100dvh-5.5rem)] flex-col overflow-hidden bg-white text-[#131b2e] md:-mx-4 md:-mb-24 md:-mt-4">
      <header className="z-20 shrink-0 border-b border-[#e2e7ff] bg-white">
        <div className="relative min-h-12 px-3 py-1">
          <button
            type="button"
              className="absolute left-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 text-sm font-normal text-[#24467c]"
            onClick={handleBack}
          >
            <ChevronLeft size={16} />
            返回
          </button>
            <div className="mx-auto max-w-[calc(100%-7.5rem)] px-8 text-center">
              <h1 className="typo-fund-header-title font-normal">{fund.name}</h1>
              <p className="typo-fund-header-code font-normal">{fund.code}</p>
            </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        <section className="border-b border-[#e2e7ff] px-3 py-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="typo-label">持仓金额/份额</p>
              <p className="mt-1 text-xl font-normal tabular-nums text-[#131b2e]">{formatCurrency(holdingAmount)}</p>
            </div>
            <div className="text-right">
              <p className="typo-label">持有收益</p>
              <p className={`mt-1 text-xl font-normal tabular-nums ${(holdingProfit || 0) >= 0 ? "text-[#005bc0]" : "text-[#ba1a1a]"}`}>
                {formatSignedCurrency(holdingProfit)}
              </p>
            </div>
            <div className="border-t border-[#e2e7ff] pt-2">
              <p className="typo-label">持有天数</p>
              <p className="mt-1 text-base font-normal text-[#131b2e]">
                {holding?.firstPurchaseDate ? `${holdingDaysInMarket(holding.firstPurchaseDate) ?? 0}天` : "—"}
              </p>
            </div>
            <div className="border-t border-[#e2e7ff] pt-2 text-right">
              <p className="typo-label">最新净值（{fund.jzrq?.slice(5, 10) || "--"}）</p>
              <p className="mt-1 text-base font-normal tabular-nums text-[#131b2e]">{latestNav ? latestNav.toFixed(4) : "—"}</p>
            </div>
          </div>
        </section>

        <section className="border-b border-[#e2e7ff] px-3 py-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-sm font-normal text-[#131b2e]">{mode === "amount" ? "减仓金额 (CNY)" : "减仓份额 (SHARE)"}</label>
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#d5dbea] bg-white text-[#24467c]"
                onClick={() => setMode((prev) => (prev === "amount" ? "share" : "amount"))}
                aria-label="切换金额和份额"
              >
                <Repeat2 size={12} />
              </button>
            </div>
            <span className="text-[10px] font-medium text-[#747781]">费率: {(FEE_RATE * 100).toFixed(2)}%</span>
          </div>
          <div className="relative border-b border-[#d5dbea] pb-1">
            <span className="absolute left-0 top-1/2 -translate-y-1/2 text-lg font-normal text-[#131b2e]">{mode === "amount" ? "¥" : "份"}</span>
            <input
              type="number"
              inputMode="decimal"
              value={mode === "amount" ? amountInput : shareInput}
              onChange={(event) => (mode === "amount" ? setAmountInput(event.target.value) : setShareInput(event.target.value))}
              placeholder="0.00"
              className="w-full border-0 bg-transparent py-2 pl-6 pr-3 text-3xl font-normal tracking-tight text-[#131b2e] outline-none placeholder:text-[#9aa5bb] focus:ring-0"
            />
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {(mode === "amount" ? [1000, 5000, 10000] : [100, 500, 1000]).map((value) => (
              <button
                key={value}
                type="button"
                className="min-h-8 rounded border border-[#d5dbea] bg-white text-xs font-normal text-[#131b2e]"
                onClick={() => (mode === "amount" ? setAmountInput(String(Math.min(value, maxSellAmount))) : setShareInput(String(Math.min(value, maxSellShare))))}
              >
                {value.toLocaleString("zh-CN")}
              </button>
            ))}
            <button
              type="button"
              className="min-h-8 rounded border border-[#d5dbea] bg-white text-xs font-normal text-[#131b2e]"
              onClick={() => (mode === "amount" ? setAmountInput(String(maxSellAmount.toFixed(2))) : setShareInput(String(maxSellShare.toFixed(2))))}
            >
              MAX
            </button>
          </div>
          <div className="mt-2 text-[10px] font-medium text-[#747781]">
            {mode === "amount" ? `预计赎回份额: ${share.toFixed(2)} 份` : `预计成交金额: ${formatCurrency(amount)}`}
          </div>
          <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-[#747781]">
            <Info size={12} />
            <span>估算手续费: {formatCurrency(estimatedFee)}</span>
          </div>
        </section>

        <section className="divide-y divide-[#e2e7ff]">
          <div className="px-3 py-3">
            <label className="mb-1 block typo-label">交易确认时间</label>
            <DatePicker
              value={tradeDate ? dayjs(tradeDate, "YYYY-MM-DD") : null}
              format="YYYY-MM-DD"
              allowClear={false}
              inputReadOnly
              className="text-sm font-normal text-[#131b2e]"
              style={{ width: "100%" }}
              onChange={(_, dateString) => setTradeDate(Array.isArray(dateString) ? dateString[0] || "" : dateString || "")}
            />
          </div>
          <div className="px-3 py-3">
            <label className="mb-2 block typo-label">成交时间节点</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`rounded border px-2 py-2 text-center ${beforeClose ? "border-[#005bc0] bg-[#eef4ff]" : "border-[#d5dbea] bg-white"}`}
                onClick={() => setBeforeClose(true)}
              >
                <div className={`text-xs font-normal ${beforeClose ? "text-[#005bc0]" : "text-[#131b2e]"}`}>15:00前</div>
                <div className="text-[10px] text-[#747781]">下个交易日确认</div>
              </button>
              <button
                type="button"
                className={`rounded border px-2 py-2 text-center ${!beforeClose ? "border-[#005bc0] bg-[#eef4ff]" : "border-[#d5dbea] bg-white"}`}
                onClick={() => setBeforeClose(false)}
              >
                <div className={`text-xs font-normal ${!beforeClose ? "text-[#005bc0]" : "text-[#131b2e]"}`}>15:00后</div>
                <div className="text-[10px] text-[#747781]">后两个交易日确认</div>
              </button>
            </div>
            <p className="mt-2 typo-meta leading-relaxed">
              {beforeClose ? "今日15:00前交易，将于下个交易日确认份额。" : "今日15:00后交易，将于后两个交易日确认份额。"}
            </p>
          </div>
        </section>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#e2e7ff] bg-white/95 p-3 backdrop-blur">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!amount || !share || !latestNav || maxSellAmount <= 0}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-[#d5dbea] bg-white px-3 text-sm font-normal text-[#131b2e] disabled:opacity-40"
        >
          确认修改
        </button>
      </div>
    </div>
  );
}
