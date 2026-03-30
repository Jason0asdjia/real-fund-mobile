import type { ValuationPoint } from "@/lib/types";

type SparklineProps = {
  points: ValuationPoint[];
};

export function Sparkline({ points }: SparklineProps) {
  if (!points.length) {
    return <div className="sparkline sparkline--empty">No Data</div>;
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const path = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * 100;
      const y = 100 - ((point.value - min) / range) * 100;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <svg className="sparkline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}
