import { formatSignedCurrency } from "@/lib/portfolio";

type DistributionPoint = {
  label: string;
  value: number;
};

type ReturnDistributionProps = {
  title: string;
  data: DistributionPoint[];
};

export function ReturnDistribution({ title, data }: ReturnDistributionProps) {
  if (!data.length) {
    return <div className="chart-empty">暂无分布数据</div>;
  }

  const maxAbs = Math.max(...data.map((item) => Math.abs(item.value)), 1);

  return (
    <div className="distribution-card">
      <div className="distribution-card__head">
        <span>{title}</span>
        <small>{formatSignedCurrency(data.reduce((sum, item) => sum + item.value, 0))}</small>
      </div>
      <div className="distribution-bars">
        {data.map((item) => {
          const height = `${Math.max((Math.abs(item.value) / maxAbs) * 100, 8)}%`;
          return (
            <div key={item.label} className="distribution-bar__item">
              <div className="distribution-bar__track">
                <div className={`distribution-bar ${item.value >= 0 ? "is-up" : "is-down"}`} style={{ height }} />
              </div>
              <span>{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
