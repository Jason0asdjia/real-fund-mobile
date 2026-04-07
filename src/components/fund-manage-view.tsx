"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Repeat2 } from "lucide-react";

import { useAppState } from "@/components/app-provider";
import { formatCurrency, formatSignedCurrency, getHoldingMetrics } from "@/lib/portfolio";
import { holdingDaysInMarket } from "@/lib/time";

type FundManageViewProps = {
  code: string;
  onBack?: () => void;
  asModal?: boolean;
};

type EditMode = "amount" | "share";

const toNumber = (value: string) => {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;
  const next = Number(normalized);
  return Number.isFinite(next) ? next : null;
};

const formatInputNumber = (value: number | null | undefined, digits = 2) => {
  if (value == null || !Number.isFinite(value)) return "";
  return value.toFixed(digits);
};

export function FundManageView({ code, onBack, asModal = false }: FundManageViewProps) {
  const { state, updateHolding } = useAppState();
  const fund = state.funds.find((item) => item.code === code);
  const holding = fund ? state.holdings[fund.code] : undefined;
  const metrics = useMemo(() => (fund ? getHoldingMetrics(fund, holding) : null), [fund, holding]);
  const holdingDays = useMemo(() => {
    return holdingDaysInMarket(holding?.firstPurchaseDate || null);
  }, [holding?.firstPurchaseDate]);

  const [mode, setMode] = useState<EditMode>("amount");
  const [amountInput, setAmountInput] = useState("");
  const [shareInput, setShareInput] = useState("");
  const [costInput, setCostInput] = useState("");
  const [dateInput, setDateInput] = useState("");

  useEffect(() => {
    if (asModal) return;
    document.body.classList.add("app-detail-open");
    return () => {
      document.body.classList.remove("app-detail-open");
    };
  }, [asModal]);

  useEffect(() => {
    const share = holding?.share ?? null;
    const cost = holding?.cost ?? null;
    const amount = share != null && cost != null ? share * cost : null;
    setShareInput(formatInputNumber(share, 2));
    setCostInput(formatInputNumber(cost, 4));
    setAmountInput(formatInputNumber(amount, 2));
    setDateInput(holding?.firstPurchaseDate || "");
  }, [holding?.cost, holding?.firstPurchaseDate, holding?.share]);

  if (!fund) {
    return (
      <div className={asModal ? "detail-page" : "-mx-3 -mt-4 min-h-[calc(100dvh-5.5rem)] bg-white md:-mx-4 md:-mt-4"}>
        <header className="sticky top-0 z-20 border-b border-[#e2e7ff] bg-white">
          <div className="flex h-12 items-center justify-between px-3">
            {onBack ? (
              <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-[#24467c]" onClick={onBack}>
                <ChevronLeft size={16} />
                返回
              </button>
            ) : (
              <span />
            )}
            <h1 className="text-base font-bold text-[#131b2e]">编辑持仓</h1>
            <span />
          </div>
        </header>
        <section className="px-3 py-6">
          <div className="rounded-xl border border-[#e2e7ff] bg-[#f8f9ff] p-4">
            <h2 className="m-0 text-base font-bold text-[#131b2e]">未找到基金</h2>
            <p className="mb-0 mt-2 text-sm text-[#57657a]">请返回持仓总览页重新进入。</p>
          </div>
        </section>
      </div>
    );
  }

  const handleConfirm = () => {
    const cost = toNumber(costInput);
    const inputShare = toNumber(shareInput);
    const inputAmount = toNumber(amountInput);

    const finalShare = mode === "share" ? inputShare : cost && inputAmount != null ? inputAmount / cost : inputShare;

    updateHolding(fund.code, {
      share: finalShare,
      cost,
      firstPurchaseDate: dateInput || null,
    });
  };

  return (
    <div
      className={
        asModal
          ? "detail-page flex h-[100dvh] flex-col overflow-hidden bg-white text-[#131b2e]"
          : "-mx-3 -mb-24 -mt-4 flex h-[calc(100dvh-5.5rem)] flex-col overflow-hidden bg-white text-[#131b2e] md:-mx-4 md:-mb-24 md:-mt-4"
      }
    >
      <header className="z-20 shrink-0 border-b border-[#e2e7ff] bg-white">
        <div className="relative min-h-12 px-3 py-1">
          {onBack ? (
            <button
              type="button"
              className="absolute left-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 text-sm font-semibold text-[#24467c]"
              onClick={onBack}
            >
              <ChevronLeft size={16} />
              返回
            </button>
          ) : (
            <span />
          )}
          <div className="mx-auto max-w-[72%] text-center">
            <h1 className="whitespace-normal break-words text-sm font-extrabold leading-tight text-[#131b2e]">{fund.name}</h1>
            <p className="text-[10px] font-semibold text-[#747781]">{fund.code}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden px-3 pb-28 pt-4">
        <section className="space-y-3">
          <div className="rounded-xl border border-[#e2e7ff] bg-[#f8f9ff] p-4">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[10px] font-semibold tracking-[0.14em] text-[#747781]">{mode === "amount" ? "当前持仓（元）" : "当前持仓（份额）"}</p>
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-semibold tracking-[0.14em] text-[#747781]">{mode === "amount" ? "CNY" : "SHARE"}</p>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#d5dbea] bg-white text-[#24467c]"
                  onClick={() => setMode((prev) => (prev === "amount" ? "share" : "amount"))}
                  aria-label="切换金额和份额"
                >
                  <Repeat2 size={12} />
                </button>
              </div>
            </div>
            <input
              inputMode="decimal"
              value={mode === "amount" ? amountInput : shareInput}
              onChange={(event) => (mode === "amount" ? setAmountInput(event.target.value) : setShareInput(event.target.value))}
              placeholder="0.00"
              className="w-full border-0 bg-transparent p-0 text-2xl font-extrabold tracking-tight text-[#00193c] outline-none placeholder:text-[#9aa5bb] focus:ring-0"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="rounded-xl border border-[#e2e7ff] bg-[#f8f9ff] p-3">
              <p className="mb-1 text-[10px] font-semibold tracking-[0.14em] text-[#747781]">持仓成本</p>
              <input
                inputMode="decimal"
                value={costInput}
                onChange={(event) => setCostInput(event.target.value)}
                placeholder="0.0000"
                className="w-full border-0 bg-transparent p-0 text-lg font-bold text-[#131b2e] outline-none placeholder:text-[#9aa5bb] focus:ring-0"
              />
            </label>
            <label className="rounded-xl border border-[#e2e7ff] bg-[#f8f9ff] p-3">
              <p className="mb-1 text-[10px] font-semibold tracking-[0.14em] text-[#747781]">首次买入日期</p>
              <input
                type="date"
                value={dateInput}
                onChange={(event) => setDateInput(event.target.value)}
                className="w-full border-0 bg-transparent p-0 text-sm font-bold text-[#131b2e] outline-none focus:ring-0"
              />
            </label>
          </div>

          <div className="rounded-xl border border-[#e2e7ff] bg-white p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.14em] text-[#747781]">当前持仓金额</p>
                <p className="mt-1 text-lg font-extrabold tabular-nums text-[#00193c]">{formatCurrency(metrics?.amount)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold tracking-[0.14em] text-[#747781]">当前累计收益</p>
                <p className={`mt-1 text-lg font-extrabold tabular-nums ${(metrics?.profitTotal || 0) >= 0 ? "text-[#005bc0]" : "text-red-600"}`}>
                  {formatSignedCurrency(metrics?.profitTotal)}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[10px] font-semibold text-[#747781]">持有天数：{holdingDays == null ? "—" : `${holdingDays} 天`}</p>
          </div>
        </section>

      </main>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#e2e7ff] bg-white/95 p-3 backdrop-blur">
        <button
          type="button"
          onClick={handleConfirm}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#00193c] px-3 text-sm font-bold text-white"
        >
          确认修改
        </button>
      </div>
    </div>
  );
}
