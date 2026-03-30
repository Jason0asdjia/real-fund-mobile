type ReturnTrendPoint = {
  label: string;
  value: number;
};

type ReturnTrendChartProps = {
  data: ReturnTrendPoint[];
  height?: number;
};

const formatCompactCurrency = (value: number) => {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(0)}`;
};

export function ReturnTrendChart({ data, height = 224 }: ReturnTrendChartProps) {
  if (!data.length) {
    return <div className="chart-empty">暂无收益分布数据</div>;
  }

  const maxAbs = Math.max(...data.map((item) => Math.abs(item.value)), 1);
  const chartPaddingY = 6;
  const chartRange = 100 - chartPaddingY * 2;

  const points = data.map((item, index) => {
    const x = (index / Math.max(data.length - 1, 1)) * 100;
    const y = 50 - (item.value / maxAbs) * (chartRange / 2);
    return { x, y, label: item.label, value: item.value };
  });

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");

  return (
    <div className="return-trend-chart">
      <div className="return-trend-chart__body">
        <div className="return-trend-chart__axis">
          <span>{formatCompactCurrency(maxAbs)}</span>
          <span>0</span>
          <span>{formatCompactCurrency(-maxAbs)}</span>
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }} aria-hidden="true">
          <line className="performance-chart__baseline" x1="0" y1="50" x2="100" y2="50" />
          <path className="return-trend-chart__line" d={linePath} />
          {points.map((point) => (
            <circle key={`${point.label}-${point.x}`} className={`return-trend-chart__dot ${point.value >= 0 ? "is-up" : "is-down"}`} cx={point.x} cy={point.y} r="1.2" />
          ))}
        </svg>
      </div>
      <div className="return-trend-chart__labels">
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor(data.length / 2)]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}
