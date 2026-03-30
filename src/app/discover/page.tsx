"use client";

import { useState } from "react";
import { Search } from "lucide-react";

import { useAppState } from "@/components/app-provider";

export default function DiscoverPage() {
  const { state, search, addFund, refreshing } = useAppState();
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Array<{ code: string; name: string; shortName?: string }>>([]);

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

  return (
    <div className="screen">
      <section className="section-heading">
        <p>Discover</p>
        <h1>按基金代码或名称建立你的追踪池。</h1>
      </section>

      <label className="search-shell">
        <Search size={18} />
        <input value={keyword} onChange={(event) => handleSearch(event.target.value)} placeholder="例如 161725 / 招商中证白酒" aria-label="搜索基金" />
      </label>

      {state.searchHistory.length ? (
        <section className="chip-row" aria-label="最近搜索">
          {state.searchHistory.map((item) => (
            <button key={item} type="button" className="chip" onClick={() => handleSearch(item)}>
              {item}
            </button>
          ))}
        </section>
      ) : null}

      {loading ? <p className="status-banner">搜索中...</p> : null}
      {error ? <p className="status-banner status-banner--error">{error}</p> : null}

      <section className="result-list">
        {results.map((item) => {
          const added = state.funds.some((fund) => fund.code === item.code);

          return (
            <article key={item.code} className="result-card">
              <div>
                <p>{item.code}</p>
                <h2>{item.name}</h2>
              </div>

              <button type="button" className="primary-button" disabled={added || refreshing} onClick={() => addFund(item)}>
                {added ? "已加入" : "加入"}
              </button>
            </article>
          );
        })}
      </section>
    </div>
  );
}
