"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Filter, Loader2, Minus, Plus, Search, Trash2, X } from "lucide-react";

import { useAppState } from "@/components/app-provider";
import { fetchFundPreviewData } from "@/lib/fund-api";
import type { FundSnapshot, SearchFundResult } from "@/lib/types";

const fallbackPopularSearches = ["高增长科技", "标普500", "全球ESG领先", "债券阿尔法"];
const defaultFundTag = "基金";

const tagColorMap: Record<string, string> = {
  equity: "border-[#dbe8ff] bg-[#f2f7ff] text-[#24467c]",
  index: "border-[#d7dce8] bg-[#f2f4f8] text-[#4b556b]",
  bond: "border-[#f5dcc6] bg-[#fff5ec] text-[#8f5a2c]",
  fund: "border-[#dbe8ff] bg-[#f2f7ff] text-[#24467c]",
};

const normalizeTag = (raw?: string) => {
  const text = raw?.trim();
  if (!text) return defaultFundTag;
  if (text.length <= 6) return text.toUpperCase();
  return text.slice(0, 6).toUpperCase();
};

export default function DiscoverPage() {
  const { state, search, recordSearchHistory, addFund, removeFund, clearSearchHistory } = useAppState();
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<SearchFundResult[]>([]);
  const [resultSnapshots, setResultSnapshots] = useState<Record<string, FundSnapshot>>({});
  const [resultLoadingCodes, setResultLoadingCodes] = useState<Record<string, boolean>>({});
  const [addingCode, setAddingCode] = useState<string | null>(null);
  const [removeConfirmCode, setRemoveConfirmCode] = useState<string | null>(null);
  const latestSearchTokenRef = useRef(0);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("app-modal-open", Boolean(removeConfirmCode));
    return () => {
      document.body.classList.remove("app-modal-open");
    };
  }, [removeConfirmCode]);

  const handleSearch = useCallback(async (nextKeyword: string) => {
    if (!nextKeyword.trim()) {
      setResults([]);
      setResultSnapshots({});
      setResultLoadingCodes({});
      setError("");
      setLoading(false);
      return;
    }

    const token = ++latestSearchTokenRef.current;
    setLoading(true);
    setError("");

    try {
      const found = await search(nextKeyword);
      if (token !== latestSearchTokenRef.current) return;
      setResults(found.slice(0, 10));
    } catch (nextError) {
      if (token !== latestSearchTokenRef.current) return;
      setError(nextError instanceof Error ? nextError.message : "搜索失败");
    } finally {
      if (token === latestSearchTokenRef.current) {
        setLoading(false);
      }
    }
  }, [search]);

  useEffect(() => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      latestSearchTokenRef.current += 1;
      void handleSearch("");
      return;
    }

    const timer = window.setTimeout(() => {
      void handleSearch(trimmed);
    }, /^\d{6}$/.test(trimmed) ? 120 : 260);

    return () => {
      window.clearTimeout(timer);
    };
  }, [handleSearch, keyword]);

  const showResultLayer = Boolean(keyword.trim()) || loading || Boolean(error);
  const popularSearches = state.searchHistory.length ? state.searchHistory : fallbackPopularSearches;

  const handleAddFund = async (item: SearchFundResult) => {
    if (addingCode) return;
    const targetCode = item.resolvedCode || item.code;
    setAddingCode(targetCode);
    try {
      const snapshot = await addFund({ ...item, code: targetCode });
      if (!snapshot) return;
      router.push(`/portfolio/${snapshot.code}/manage?from=discover`);
    } finally {
      setAddingCode(null);
    }
  };

  const confirmTargetFund = removeConfirmCode ? state.funds.find((fund) => fund.code === removeConfirmCode) : null;

  const hasHolding = (code: string) => {
    const holding = state.holdings[code];
    return typeof holding?.share === "number" && Number.isFinite(holding.share) && holding.share > 0;
  };

  useEffect(() => {
    if (!results.length) {
      setResultSnapshots({});
      setResultLoadingCodes({});
      return;
    }

    let active = true;
    setResultLoadingCodes(Object.fromEntries(results.map((item) => [item.code, true])));

    const loadSnapshots = async () => {
      const fetched = await Promise.allSettled(
        results.map(async (item) => {
          const targetCode = item.resolvedCode || item.code;
          const existing = state.funds.find((fund) => fund.code === targetCode);
          if (existing) return [item.code, existing] as const;
          const snapshot = await fetchFundPreviewData(targetCode, { code: targetCode, name: item.name });
          return [item.code, snapshot] as const;
        }),
      );

      if (!active) return;

      const nextSnapshots = fetched.reduce<Record<string, FundSnapshot>>((acc, result) => {
        if (result.status === "fulfilled") {
          const [code, snapshot] = result.value;
          acc[code] = snapshot;
        }
        return acc;
      }, {});

      setResultSnapshots(nextSnapshots);
      setResultLoadingCodes(
        results.reduce<Record<string, boolean>>((acc, item) => {
          acc[item.code] = !nextSnapshots[item.code];
          return acc;
        }, {}),
      );
    };

    void loadSnapshots();

    return () => {
      active = false;
    };
  }, [results, state.funds]);

  return (
    <div className="-mx-3 -mt-4 flex h-[calc(100dvh-5.5rem)] flex-col overflow-hidden bg-white text-[#131b2e] md:-mx-4 md:-mt-4">
      <header className="sticky top-0 z-20 border-b border-[#f0f2f7] bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <label className="flex min-h-9 flex-1 items-center gap-2 rounded-md border border-[#e5e8f0] bg-[#f5f7fb] px-2.5">
            <Search size={14} className="shrink-0 text-[#8a93a4]" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="输入基金名称或代码"
              aria-label="搜索基金"
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs font-medium text-[#131b2e] outline-none placeholder:text-[#8a93a4] focus:ring-0"
            />
            {keyword ? (
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[#8a93a4]"
                onClick={() => setKeyword("")}
                aria-label="清空搜索"
              >
                <X size={14} />
              </button>
            ) : null}
          </label>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden pb-2">
        <section className="shrink-0 px-4 py-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[10px] font-bold tracking-[0.14em] text-[#747781]">历史搜索</h2>
            <button
              type="button"
              onClick={clearSearchHistory}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[#9aa5bb] hover:bg-[#f2f4f8]"
              aria-label="清除历史搜索"
            >
              <Trash2 size={13} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {popularSearches.map((item) => (
              <button
                key={item}
                type="button"
                className="min-w-0 rounded-[4px] border border-[#e5e8f0] bg-[#f5f7fb] px-2.5 py-1.5 text-[11px] font-medium text-[#4d5b74]"
                onClick={() => {
                  setKeyword(item);
                  void handleSearch(item);
                }}
                title={item}
              >
                <span className="block truncate">{item}</span>
              </button>
            ))}
          </div>
        </section>

        {showResultLayer ? (
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
            <div className="flex items-center justify-between border-y border-[#f0f2f7] bg-[#f9fafc] px-4 py-2">
              <span className="text-[10px] font-bold tracking-[0.14em] text-[#747781]">{loading ? "搜索中" : `搜索结果 (${results.length})`}</span>
              <Filter size={14} className="text-[#9aa5bb]" />
            </div>

            {error ? <p className="m-3 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
            {!loading && !error && !results.length ? (
              <div className="mx-3 mb-3 pt-6">
                <div className="rounded-md bg-[#f5f7fb] px-3 py-4 text-center text-sm text-[#747781]">暂无匹配基金</div>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="divide-y divide-[#f1f3f8]">
                {results.map((item) => {
                  const targetCode = item.resolvedCode || item.code;
                  const fundInState = state.funds.find((fund) => fund.code === targetCode);
                  const previewFund = fundInState || resultSnapshots[item.code];
                  const change = Number(previewFund?.gszzl ?? previewFund?.zzl ?? NaN);
                  const nav = Number(previewFund?.gsz ?? previewFund?.dwjz ?? NaN);
                  const added = Boolean(fundInState);
                  const adding = addingCode === targetCode;
                  const previewLoading = resultLoadingCodes[item.code] && !previewFund;
                  const rawTag = item.fundType || item.category || item.shortName || defaultFundTag;
                  const tag = normalizeTag(rawTag);
                  const tagTone = tagColorMap[tag.toLowerCase()] || tagColorMap.fund;

                  return (
                    <article key={item.code} className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <Link
                      href={`/portfolio/${targetCode}`}
                      className="min-w-0 flex-1"
                      onClick={() => recordSearchHistory(item.name)}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <h3 className="truncate text-[15px] font-bold tracking-tight text-[#131b2e]">{item.name}</h3>
                        <span className={`shrink-0 rounded-[3px] border px-1.5 py-0.5 text-[9px] font-bold tracking-tight ${tagTone}`}>{tag}</span>
                      </div>
                      <p className="mt-1 text-[11px] font-medium text-[#747781]">{item.code}</p>
                    </Link>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        {previewLoading ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className="h-4 w-12 animate-pulse rounded bg-[#eef2fa]" />
                            <span className="h-3 w-16 animate-pulse rounded bg-[#eef2fa]" />
                          </div>
                        ) : (
                          <>
                            <p className={`text-[15px] font-bold ${Number.isFinite(change) ? (change >= 0 ? "text-[#0a8f63]" : "text-[#d43f3a]") : "text-[#747781]"}`}>
                              {Number.isFinite(change) ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "—"}
                            </p>
                            <p className="text-[10px] text-[#9aa5bb]">净值: {Number.isFinite(nav) ? nav.toFixed(4) : "—"}</p>
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#dde2ec] bg-white text-[#5c677d]"
                        onClick={() => {
                          if (added) {
                            if (hasHolding(targetCode)) {
                              setRemoveConfirmCode(targetCode);
                              return;
                            }
                            removeFund(targetCode);
                            return;
                          }
                          void handleAddFund(item);
                        }}
                        disabled={adding}
                        aria-label={added ? "查看基金" : "加入基金"}
                      >
                        {adding ? <Loader2 size={14} className="animate-spin" /> : added ? <Minus size={16} /> : <Plus size={16} />}
                      </button>
                    </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        ) : (
          <section className="px-4 pb-6 pt-10 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full border border-[#edf1f8] bg-[#f8fafd] text-[#95a0b5]">
              <Search size={26} />
            </div>
            <h2 className="text-base font-extrabold text-[#131b2e]">市场洞察</h2>
            <p className="mx-auto mt-1 max-w-[240px] text-xs leading-5 text-[#747781]">搜索特定的基金代码以查看实时分类账分录和表现指标。</p>
          </section>
        )}

        {removeConfirmCode ? (
          <div className="app-modal-backdrop" onClick={() => setRemoveConfirmCode(null)}>
            <div className="app-modal-sheet" onClick={(event) => event.stopPropagation()} role="alertdialog" aria-modal="true" aria-labelledby="discover-remove-title" aria-describedby="discover-remove-desc">
              <div className="app-modal-sheet__grabber" />
              <div className="app-modal-sheet__header">
                <h3 id="discover-remove-title" className="m-0 text-base font-bold text-[#131b2e]">该基金有持仓记录</h3>
                <button
                  type="button"
                  onClick={() => setRemoveConfirmCode(null)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#53617a] hover:bg-slate-100"
                  aria-label="关闭弹窗"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="app-modal-sheet__content">
                <p id="discover-remove-desc" className="m-0 text-sm leading-6 text-[#4a5265]">
                  {confirmTargetFund?.name || "该基金"} 已有持仓。你可以继续删除（会从持仓表中移除），或先进入基金详情查看后再决定。
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
                    onClick={() => {
                      setRemoveConfirmCode(null);
                      removeFund(removeConfirmCode);
                    }}
                  >
                    <span className="block leading-tight">删除基金</span>
                    <span className="mt-0.5 block text-xs font-medium leading-tight text-red-600">（含历史交易）</span>
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-[#00193c] px-3 py-2 text-sm font-semibold !text-white"
                    onClick={() => {
                      const code = removeConfirmCode;
                      if (!code) return;
                      const target = state.funds.find((fund) => fund.code === code);
                      if (target) {
                        recordSearchHistory(target.name);
                      }
                      setRemoveConfirmCode(null);
                      router.push(`/portfolio/${code}`);
                    }}
                  >
                    进入基金详情
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
