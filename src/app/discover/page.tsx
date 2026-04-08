"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CirclePlus, Loader2, Search, X } from "lucide-react";

import { useAppState } from "@/components/app-provider";

const fallbackPopularSearches = ["高增长科技", "标普500", "全球ESG领先", "债券阿尔法"];

export default function DiscoverPage() {
  const { state, search, addFund } = useAppState();
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Array<{ code: string; name: string; shortName?: string }>>([]);
  const [addingCode, setAddingCode] = useState<string | null>(null);

  const handleSearch = async (nextKeyword: string) => {
    setKeyword(nextKeyword);
    if (!nextKeyword.trim()) {
      setResults([]);
      setError("");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const found = await search(nextKeyword);
      setResults(found.slice(0, 10));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "搜索失败");
    } finally {
      setLoading(false);
    }
  };

  const showResultLayer = Boolean(keyword.trim()) || loading || Boolean(error);
  const popularSearches = state.searchHistory.length ? state.searchHistory : fallbackPopularSearches;

  const handleAddFund = async (item: { code: string; name: string; shortName?: string }) => {
    if (addingCode) return;
    setAddingCode(item.code);
    try {
      const snapshot = await addFund(item);
      if (!snapshot) return;
      router.push(`/portfolio/${item.code}/manage?from=discover`);
    } finally {
      setAddingCode(null);
    }
  };

  return (
    <div className="-mx-3 -mt-4 min-h-[calc(100dvh-5.5rem)] bg-white text-[#131b2e] md:-mx-4 md:-mt-4">
      <header className="sticky top-0 z-20 bg-white px-4 pb-3 pt-2">
        <div className="mb-3">
          <h1 className="m-0 typo-page-title">发现基金</h1>
        </div>

        <label className="flex min-h-12 items-center gap-2 rounded-xl border border-[#d5dbea] bg-white px-3 shadow-[0_10px_28px_rgba(19,27,46,0.06)]">
          <Search size={18} className="shrink-0 text-[#24467c]" />
          <input
            value={keyword}
            onChange={(event) => handleSearch(event.target.value)}
            placeholder="输入基金名称或代码"
            aria-label="搜索基金"
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-base font-semibold text-[#131b2e] outline-none placeholder:text-[#747781] focus:ring-0"
          />
          {keyword ? (
            <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#747781]" onClick={() => handleSearch("")} aria-label="清空搜索">
              <X size={16} />
            </button>
          ) : null}
        </label>
      </header>

      <main className="px-4 pb-24">
        {!showResultLayer ? (
          <>
            <section className="mb-8">
              <h2 className="mb-3 typo-section-title">历史搜索</h2>
              <div className="grid grid-cols-4 gap-2" aria-label="热门搜索">
                {popularSearches.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="min-w-0 rounded-full border border-[#d5dbea] bg-[#f2f3ff] px-2.5 py-2 text-xs font-semibold text-[#24467c]"
                    onClick={() => handleSearch(item)}
                    title={item}
                  >
                    <span className="block truncate">{item}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[#d5dbea] bg-[#f2f3ff] text-[#3e5e95]">
                <Search size={28} />
              </div>
              <h2 className="m-0 text-base font-extrabold">市场洞察</h2>
              <p className="mx-auto mt-2 max-w-[260px] text-xs leading-5 text-[#747781]">搜索基金代码或名称，快速加入追踪池并查看后续表现。</p>
            </section>
          </>
        ) : (
          <section className="overflow-hidden rounded-2xl bg-white shadow-[0_18px_48px_rgba(19,27,46,0.08)]">
            <div className="flex items-center justify-between bg-[#f2f3ff] px-4 py-2.5">
              <span className="text-[10px] font-bold tracking-[0.16em] text-[#747781]">
                {loading ? "搜索中" : `搜索结果 (${results.length})`}
              </span>
            </div>

            {error ? <p className="m-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
            {!loading && !error && !results.length ? <p className="m-3 rounded-xl bg-[#f2f3ff] px-3 py-4 text-center text-sm text-[#747781]">暂无匹配基金</p> : null}

            <div className="divide-y divide-[#f2f3ff] bg-white">
              {results.map((item) => {
                const added = state.funds.some((fund) => fund.code === item.code);
                const adding = addingCode === item.code;

                return (
                  <article key={item.code} className="flex items-center gap-3 px-4 py-3">
                    <Link href={`/portfolio/${item.code}`} className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <h2 className="m-0 truncate text-sm font-extrabold tracking-tight text-[#131b2e]">{item.name}</h2>
                        {item.shortName ? (
                          <span className="shrink-0 rounded bg-[#d7e2ff] px-1.5 py-0.5 text-[9px] font-bold text-[#24467c]">基金</span>
                        ) : null}
                      </div>
                      <p className="m-0 mt-1 text-[11px] font-semibold tabular-nums text-[#747781]">{item.code}</p>
                    </Link>

                      <button
                        type="button"
                        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${
                          added
                            ? "border-[#abc7ff] bg-[#d7e2ff] text-[#24467c]"
                            : "border-[#d5dbea] bg-white text-[#24467c]"
                        }`}
                        disabled={added || adding}
                        onClick={() => void handleAddFund(item)}
                        aria-label={added ? "已加入" : "加入基金"}
                      >
                      {adding ? <Loader2 size={16} className="animate-spin" /> : added ? <Check size={17} /> : <CirclePlus size={18} />}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
