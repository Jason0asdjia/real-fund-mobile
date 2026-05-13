"use client"

import * as React from "react"
import { Pie, PieChart as RechartsPieChart } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

export type PieChartDataPoint = {
  name: string
  value: number
  fill?: string
}

type PieChartProps = React.ComponentProps<"div"> & {
  data: PieChartDataPoint[]
  config?: ChartConfig
  innerRadius?: number
  outerRadius?: number
  height?: number
  showLegend?: boolean
  valueFormatter?: (value: number) => string
}

const DEFAULT_COLORS = [
  "#2f5ce0",
  "#e0555e",
  "#2ca07a",
  "#e8923f",
  "#8b5cf6",
  "#3b82c4",
  "#d9467f",
  "#10b981",
  "#f59e0b",
  "#6b7fad",
]

export function PieChart({
  data,
  config,
  innerRadius = 0.55,
  outerRadius = 0.9,
  height = 240,
  showLegend = true,
  valueFormatter = (v) => `${v.toFixed(1)}%`,
  className,
  ...props
}: PieChartProps) {
  const colorData = React.useMemo(() =>
    data.map((item, i) => ({
      ...item,
      fill: item.fill || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    })),
    [data]
  )

  const chartConfig = React.useMemo<ChartConfig>(() => {
    if (config) return config
    const cfg: ChartConfig = { value: { label: "占比" } }
    colorData.forEach((item) => {
      cfg[item.name] = { label: item.name, color: item.fill }
    })
    return cfg
  }, [config, colorData])

  return (
    <div className={className} {...props}>
      <ChartContainer config={chartConfig} className="mx-auto w-full" style={{ height }}>
        <RechartsPieChart>
          <ChartTooltip
            content={
              <ChartTooltipContent nameKey="name" hideLabel />
            }
          />
          <Pie
            data={colorData}
            dataKey="value"
            nameKey="name"
            innerRadius={innerRadius * 100}
            outerRadius={outerRadius * 100}
            paddingAngle={2}
            strokeWidth={2}
            stroke="var(--background, #fff)"
            label={false}
          />
        </RechartsPieChart>
      </ChartContainer>
      {showLegend ? (
        <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1.5 px-1">
          {colorData.map((item, i) => (
            <div key={item.name} className="flex items-center gap-1.5 min-w-0">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.fill }}
              />
              <span className="truncate text-[11px] text-[#57657a]">{item.name}</span>
              <span className="ml-auto shrink-0 text-[11px] font-medium tabular-nums text-[#131b2e]">
                {valueFormatter(item.value)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
