import type { CSSProperties } from "react";

type ChartPoint = {
  label: string;
  value: number;
};

type PerformanceLineChartProps = {
  data: ChartPoint[];
  stroke?: string;
  height?: number;
};

export function PerformanceLineChart({ data, stroke = "var(--accent)", height = 180 }: PerformanceLineChartProps) {
  if (!data.length) {
    return <div className="chart-empty">暂无走势数据</div>;
  }

  const values = data.map((item) => item.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const linePath = data
    .map((item, index) => {
      const x = (index / Math.max(data.length - 1, 1)) * 100;
      const y = 100 - ((item.value - min) / range) * 100;
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  const areaPath = `${linePath} L100,100 L0,100 Z`;
  const latest = data[data.length - 1];
  const baseline = min < 0 && max > 0 ? 100 - ((0 - min) / range) * 100 : null;

  return (
    <div className="performance-chart" style={{ "--chart-stroke": stroke } as CSSProperties}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }} aria-hidden="true">
        {baseline != null ? <line className="performance-chart__baseline" x1="0" y1={baseline} x2="100" y2={baseline} /> : null}
        <path className="performance-chart__area" d={areaPath} />
        <path className="performance-chart__line" d={linePath} />
      </svg>
      <div className="performance-chart__labels">
        <span>{data[0]?.label}</span>
        <span>{latest?.label}</span>
      </div>
    </div>
  );
}
