type ReturnPoint = {
  date: string;
  rate: number;
};

type MonthlyReturnCalendarProps = {
  month: string;
  points: ReturnPoint[];
};

const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

const toDate = (year: number, monthIndex: number, day: number) => new Date(year, monthIndex, day);

const formatRate = (value: number) => {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

const rateTextClass = (text: string) => {
  const length = text.replace(/\s+/g, "").length;
  if (length >= 9) return "monthly-return-calendar__rate monthly-return-calendar__rate--xs";
  if (length >= 7) return "monthly-return-calendar__rate monthly-return-calendar__rate--sm";
  return "monthly-return-calendar__rate";
};

export function MonthlyReturnCalendar({ month, points }: MonthlyReturnCalendarProps) {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;

  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
    return <div className="chart-empty">暂无日历数据</div>;
  }

  const firstDay = toDate(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingEmpty = (firstDay.getDay() + 6) % 7;
  const gridCount = Math.ceil((leadingEmpty + daysInMonth) / 7) * 7;

  const pointMap = new Map(points.map((item) => [item.date, item.rate]));

  const cells = Array.from({ length: gridCount }, (_, index) => {
    const day = index - leadingEmpty + 1;
    if (day < 1 || day > daysInMonth) {
      return { type: "empty" as const, key: `empty-${index}` };
    }

    const current = toDate(year, monthIndex, day);
    const dateText = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const weekend = current.getDay() === 0 || current.getDay() === 6;
    const rate = pointMap.get(dateText);

    if (weekend) {
      return {
        type: "closed" as const,
        key: dateText,
        day,
      };
    }

    if (typeof rate === "number") {
      return {
        type: "trade" as const,
        key: dateText,
        day,
        rate,
      };
    }

    return {
      type: "closed" as const,
      key: dateText,
      day,
    };
  });

  return (
    <div className="monthly-return-calendar">
      <div className="monthly-return-calendar__weekdays">
        {WEEK_LABELS.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>

      <div className="monthly-return-calendar__grid">
        {cells.map((cell) => {
          if (cell.type === "empty") {
            return <div key={cell.key} className="monthly-return-calendar__cell is-empty" />;
          }

          if (cell.type === "closed") {
            return (
              <div key={cell.key} className="monthly-return-calendar__cell is-closed">
                <strong>{cell.day}</strong>
                <small className="monthly-return-calendar__rate">休市</small>
              </div>
            );
          }

          const rateText = formatRate(cell.rate);

          return (
            <div key={cell.key} className={`monthly-return-calendar__cell ${cell.rate >= 0 ? "is-profit" : "is-loss"}`}>
              <strong>{cell.day}</strong>
              <small className={rateTextClass(rateText)}>{rateText}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}
