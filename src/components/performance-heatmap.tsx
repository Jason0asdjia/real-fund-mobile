type HeatmapCell = {
  label: string;
  value: number;
};

type PerformanceHeatmapProps = {
  data: HeatmapCell[];
};

const levelClass = (value: number) => {
  if (value >= 0.75) return "is-level-4";
  if (value >= 0.45) return "is-level-3";
  if (value >= 0.2) return "is-level-2";
  if (value > 0) return "is-level-1";
  if (value <= -0.75) return "is-negative-4";
  if (value <= -0.45) return "is-negative-3";
  if (value <= -0.2) return "is-negative-2";
  if (value < 0) return "is-negative-1";
  return "is-neutral";
};

export function PerformanceHeatmap({ data }: PerformanceHeatmapProps) {
  return (
    <div className="heatmap-grid" aria-label="盈亏日历热力图">
      {data.map((item) => (
        <div key={item.label} className={`heatmap-cell ${levelClass(item.value)}`} title={`${item.label} ${item.value.toFixed(2)}`} />
      ))}
    </div>
  );
}
