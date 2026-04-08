import { HistoryView } from "@/components/history-view";

export default function HistoryPage({ searchParams }: { searchParams?: { fund?: string } }) {
  const initialFundFilter = typeof searchParams?.fund === "string" ? searchParams.fund : "all";
  return <HistoryView initialFundFilter={initialFundFilter} />;
}
