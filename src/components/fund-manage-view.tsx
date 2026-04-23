"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Repeat2 } from "lucide-react";
import { DatePicker } from "antd";
import dayjs from "dayjs";
import { flushSync } from "react-dom";

import { useAppState } from "@/components/app-provider";
import { getHoldingMetrics } from "@/lib/portfolio";
import { holdingDaysInMarket, todayInMarket } from "@/lib/time";

type FundManageViewProps = {
  code: string;
  onBack?: () => void;
  asModal?: boolean;
  redirectOnConfirm?: string | null;
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

export function FundManageView({ code, onBack, asModal = false, redirectOnConfirm = null }: FundManageViewProps) {
  const router = useRouter();
  const { addFund, state, updateHolding } = useAppState();
  const fund = state.funds.find((item) => item.code === code);
  const [fundLoading, setFundLoading] = useState(false);
  const holding = fund ? state.holdings[fund.code] : undefined;
  const metrics = useMemo(() => (fund ? getHoldingMetrics(fund, holding) : null), [fund, holding]);

  const [mode, setMode] = useState<EditMode>("amount");
  const [amountInput, setAmountInput] = useState("");
  const [shareInput, setShareInput] = useState("");
  const [profitInput, setProfitInput] = useState("");
  const [dateInput, setDateInput] = useState("");
  const today = todayInMarket();
  const holdingDays = useMemo(() => {
    return holdingDaysInMarket(dateInput || null);
  }, [dateInput]);

  const officialNav = useMemo(() => {
    const dwjz = fund?.dwjz == null ? null : Number(fund.dwjz);
    return dwjz != null && Number.isFinite(dwjz) && dwjz > 0 ? dwjz : null;
  }, [fund?.dwjz]);
  const estimateNav = useMemo(() => {
    const gsz = fund?.gsz == null ? null : Number(fund.gsz);
    return gsz != null && Number.isFinite(gsz) && gsz > 0 ? gsz : null;
  }, [fund?.gsz]);
  const conversionNav = officialNav ?? estimateNav;

  const holdingShare = holding?.share != null && Number.isFinite(Number(holding.share)) ? Number(holding.share) : null;
  const holdingCost = holding?.cost != null && Number.isFinite(Number(holding.cost)) ? Number(holding.cost) : null;
  const amountForEdit = holdingShare != null && officialNav != null
    ? holdingShare * officialNav
    : metrics?.amount ?? null;
  const profitForEdit =
    holdingShare != null && holdingCost != null && officialNav != null
      ? (officialNav - holdingCost) * holdingShare
      : metrics?.profitTotal ?? null;

  useEffect(() => {
    if (asModal) return;
    document.body.classList.add("app-detail-open");
    return () => {
      document.body.classList.remove("app-detail-open");
    };
  }, [asModal]);

  useEffect(() => {
    if (fund) return;

    let active = true;
    setFundLoading(true);

    const ensureFund = async () => {
      try {
        await addFund({ code, name: code });
      } finally {
        if (active) {
          setFundLoading(false);
        }
      }
    };

    void ensureFund();

    return () => {
      active = false;
    };
  }, [addFund, code, fund]);

  useEffect(() => {
    const share = holdingShare;
    const amount = amountForEdit;
    const profit = profitForEdit;
    setShareInput(formatInputNumber(share, 4));
    setAmountInput(formatInputNumber(amount, 2));
    setProfitInput(formatInputNumber(profit, 2));
    setDateInput(holding?.firstPurchaseDate || todayInMarket());
  }, [amountForEdit, holding?.firstPurchaseDate, holdingShare, profitForEdit]);

  const inputShare = toNumber(shareInput);
  const inputAmount = toNumber(amountInput);
  const inputProfit = toNumber(profitInput);

  const derivedShare = mode === "share"
    ? inputShare
    : conversionNav && inputAmount != null
      ? inputAmount / conversionNav
      : null;
  const derivedAmount = mode === "amount"
    ? inputAmount
    : conversionNav && inputShare != null
      ? inputShare * conversionNav
      : null;
  const derivedCostAmount = derivedAmount != null && inputProfit != null ? derivedAmount - inputProfit : null;
  const derivedCostPerShare = derivedShare && derivedShare > 0 && derivedCostAmount != null ? derivedCostAmount / derivedShare : null;
  const profitToneClass = inputProfit == null ? "text-[#131b2e]" : inputProfit >= 0 ? "text-[#005bc0]" : "text-red-600";

  const applyProfitSign = (sign: "positive" | "negative") => {
    const trimmed = profitInput.trim();
    if (!trimmed) {
      setProfitInput(sign === "negative" ? "-" : "");
      return;
    }

    const unsigned = trimmed.replace(/^[+-]+/, "");
    setProfitInput(sign === "negative" ? `-${unsigned}` : unsigned);
  };

  const handleToggleMode = () => {
    if (!conversionNav || conversionNav <= 0) {
      setMode((prev) => (prev === "amount" ? "share" : "amount"));
      return;
    }

    if (mode === "amount") {
      const amountValue = toNumber(amountInput);
      if (amountValue != null) {
        setShareInput(formatInputNumber(amountValue / conversionNav, 2));
      }
      setMode("share");
      return;
    }

    const shareValue = toNumber(shareInput);
    if (shareValue != null) {
      setAmountInput(formatInputNumber(shareValue * conversionNav, 2));
    }
    setMode("amount");
  };

  if (!fund) {
    return (
      <div className={asModal ? "detail-page bg-white text-[#131b2e]" : "-mx-3 -mt-4 min-h-[calc(100dvh-5.5rem)] bg-white text-[#131b2e] md:-mx-4 md:-mt-4"}>
        <header className="border-b border-[#e2e7ff] bg-white">
          <div className="flex h-12 items-center justify-between px-3">
            {onBack ? (
              <button type="button" className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-sm font-normal text-[#24467c]" onClick={onBack}>
                <ChevronLeft size={16} />
                返回
              </button>
            ) : (
              <span />
            )}
            <h1 className="typo-body-strong">编辑持仓</h1>
            <span />
          </div>
        </header>
        <section className="px-3 py-6">
          <div className="rounded-xl border border-[#e2e7ff] bg-[#f8f9ff] p-4">
            <h2 className="m-0 typo-body-strong">{fundLoading ? "正在加载基金" : "未找到基金"}</h2>
            <p className="mb-0 mt-2 typo-body-strong font-medium text-[#57657a]">
              {fundLoading ? "正在尝试同步该基金数据，请稍候。" : "请返回持仓总览页重新进入。"}
            </p>
          </div>
        </section>
      </div>
    );
  }

  const handleConfirm = () => {
    const finalShare = derivedShare;
    const cost = derivedCostPerShare;

    flushSync(() => {
      updateHolding(fund.code, {
        share: finalShare,
        cost,
        firstPurchaseDate: dateInput || null,
      });
    });

    if (redirectOnConfirm) {
      router.replace(redirectOnConfirm);
      return;
    }

    if (onBack) {
      onBack();
      return;
    }

    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.replace(`/portfolio/${fund.code}`);
  };

  return (
    <div
      className={
        asModal
          ? "detail-page flex h-[100dvh] flex-col overflow-hidden bg-white text-[#131b2e]"
          : "-mx-3 -mb-24 -mt-4 flex h-[calc(100dvh-5.5rem)] flex-col overflow-y-auto overscroll-contain bg-white text-[#131b2e] md:-mx-4 md:-mb-24 md:-mt-4"
      }
    >
      <header className="z-20 shrink-0 border-b border-[#e2e7ff] bg-white">
        <div className="relative min-h-12 px-3 py-1">
          {onBack ? (
            <button
              type="button"
              className="absolute left-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-md px-1 py-0.5 text-sm font-normal text-[#24467c]"
              onClick={onBack}
            >
              <ChevronLeft size={16} />
              返回
            </button>
          ) : (
            <span />
          )}
          <div className="mx-auto max-w-[calc(100%-7.5rem)] px-8 text-center">
            <h1 className="typo-fund-header-title">{fund.name}</h1>
            <p className="typo-fund-header-code">{fund.code}</p>
          </div>
        </div>
      </header>

      <main className="pb-[calc(var(--bottom-nav-total-height)+0.7rem)]">
        <section className="border-b border-[#e2e7ff] px-3 py-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="block text-[length:var(--type-body-size)] font-medium tracking-[0.12em] text-[#747781]">{mode === "amount" ? "当前持仓" : "当前份额"}</span>
              <div className="flex items-center gap-2 rounded-lg border border-[#e2e7ff] bg-[#f8f9ff] p-1">
                <span className="block text-[length:var(--type-body-size)] font-medium text-[#747781]">{mode === "amount" ? "CNY" : "SHARE"}</span>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#d5dbea] bg-white text-[#24467c]"
                  onClick={handleToggleMode}
                  aria-label="切换金额和份额"
                >
                  <Repeat2 size={12} />
                </button>
              </div>
            </div>
            <div className="relative">
              <span className="absolute left-0 top-1/2 -translate-y-1/2 typo-value-emphasis font-semibold text-[#131b2e]">{mode === "amount" ? "¥" : "份"}</span>
              <input
                inputMode="decimal"
                value={mode === "amount" ? amountInput : shareInput}
                onChange={(event) => (mode === "amount" ? setAmountInput(event.target.value) : setShareInput(event.target.value))}
                placeholder="0.00"
                className="typo-value-emphasis w-full border-0 bg-transparent py-2 pl-6 pr-3 outline-none placeholder:text-[#9aa5bb] focus:ring-0"
                style={{ fontSize: "var(--type-metric-strong)", fontWeight: 700 }}
              />
            </div>
        </section>

        <section className="divide-y divide-[#e2e7ff]">
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 border-b border-[#d5dbea] px-3 py-4">
              <div className="flex items-center justify-between">
                <span className="block text-[length:var(--type-body-size)] font-medium tracking-[0.12em] text-[#747781]">持有收益</span>
                <input
                  inputMode="decimal"
                  value={profitInput}
                  onChange={(event) => setProfitInput(event.target.value)}
                  placeholder="0.00"
                  className={`typo-value-emphasis w-28 border-0 bg-transparent p-0 text-right outline-none placeholder:text-[#9aa5bb] focus:ring-0 ${profitToneClass}`}
                  style={{ fontSize: "var(--type-metric-strong)", fontWeight: 700 }}
                />
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-medium ${inputProfit != null && inputProfit >= 0 ? "border-[#bfd4ff] bg-[#edf4ff] text-[#005bc0]" : "border-[#d5dbea] bg-white text-[#24467c]"}`}
                  onClick={() => applyProfitSign("positive")}
                >
                  盈利 +
                </button>
                <button
                  type="button"
                  className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-medium ${inputProfit != null && inputProfit < 0 ? "border-[#ffc9c9] bg-[#fff1f1] text-red-600" : "border-[#d5dbea] bg-white text-[#24467c]"}`}
                  onClick={() => applyProfitSign("negative")}
                >
                  亏损 -
                </button>
              </div>
            </label>
            <label className="col-span-2 flex items-center justify-between border-b border-[#d5dbea] px-3 py-4">
                <span className="block text-[length:var(--type-body-size)] font-medium tracking-[0.12em] text-[#747781]">首次买入日期</span>
                  <DatePicker
                  value={dateInput ? dayjs(dateInput, "YYYY-MM-DD") : null}
                  format="YYYY-MM-DD"
                  allowClear
                  inputReadOnly
                  disabledDate={(current) => Boolean(current && current.endOf("day").isAfter(dayjs(today, "YYYY-MM-DD").endOf("day")))}
                  className="no-zoom-picker tabular-nums w-[138px] text-right text-base font-semibold text-[#131b2e]"
                  onChange={(_, dateString) => setDateInput(Array.isArray(dateString) ? dateString[0] || "" : dateString || "")}
                />
             </label>
          </div>
        </section>

        <section className="divide-y divide-[#e2e7ff]">
          <div className="flex items-center justify-between px-3 py-4">
            <div>
              <span className="block text-[length:var(--type-body-size)] font-medium tracking-[0.12em] text-[#747781]">最新净值</span>
              <span className="mt-1 block text-[11px] font-medium text-[#747781]">数据时间 {fund?.jzrq || "—"}</span>
            </div>
            <span className="block typo-value-emphasis tabular-nums">{officialNav != null ? officialNav.toFixed(4) : "—"}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-4">
            <span className="block text-[length:var(--type-body-size)] font-medium tracking-[0.12em] text-[#747781]">持仓成本</span>
            <span className={`block typo-value-emphasis tabular-nums ${(derivedCostPerShare || 0) >= 0 ? "text-[#005bc0]" : "text-red-600"}`}>
              {derivedCostPerShare != null ? derivedCostPerShare.toFixed(4) : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-4">
            <span className="block text-[length:var(--type-body-size)] font-medium tracking-[0.12em] text-[#747781]">持有天数</span>
            <span className="block typo-body-strong tabular-nums">{holdingDays == null ? "—" : `${holdingDays} 天`}</span>
          </div>
        </section>

      </main>

      <div className="bottom-nav">
        <div className="bottom-nav__list grid-cols-1">
          <button
            type="button"
            onClick={handleConfirm}
            className="bottom-nav__item rounded-lg text-sm font-semibold text-[#131b2e]"
          >
            <span>确认修改</span>
          </button>
        </div>
      </div>
    </div>
  );
}
