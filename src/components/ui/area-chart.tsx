"use client"

import * as React from "react"
import { Area, AreaChart as RechartsAreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

export type AreaChartDataPoint = {
  label: string
  value: number | null
}

type AreaChartProps = React.ComponentProps<"div"> & {
  data: AreaChartDataPoint[]
  config?: ChartConfig
  showGrid?: boolean
  showXAxis?: boolean
  showYAxis?: boolean
  color?: string
  areaOpacity?: number
  height?: number
  connectNulls?: boolean
  xTickInterval?: number
}

export function AreaChart({
  data,
  config,
  showGrid = false,
  showXAxis = true,
  showYAxis = false,
  color = "#adc7ff",
  areaOpacity = 0.3,
  height = 220,
  connectNulls = false,
  xTickInterval,
  className,
  ...props
}: AreaChartProps) {
  const chartConfig = React.useMemo<ChartConfig>(() => {
    if (config) return config
    return {
      value: {
        label: "净值",
        color,
      },
    }
  }, [config, color])

  const yDomain = React.useMemo<[number, number]>(() => {
    const values = data.map((d) => d.value).filter((v): v is number => v != null)
    if (!values.length) return [0, 1]
    const dataMin = Math.min(...values)
    const dataMax = Math.max(...values)
    if (dataMax === dataMin) return [dataMin - 0.01, dataMax + 0.01]
    const range = dataMax - dataMin
    const step = (() => {
      if (range < 0.02) return 0.005
      if (range < 0.05) return 0.01
      if (range < 0.2) return 0.02
      if (range < 0.5) return 0.05
      if (range < 1.5) return 0.1
      if (range < 4) return 0.2
      if (range < 10) return 0.5
      return 1
    })()
    const niceMin = Math.floor((dataMin - step * 0.5) / step) * step
    const niceMax = Math.ceil((dataMax + step * 0.5) / step) * step
    return [niceMin, niceMax]
  }, [data])

  return (
    <div className={className} style={{ height }} {...props}>
      <ChartContainer config={chartConfig} className="h-full w-full">
        <RechartsAreaChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
        >
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e7ff" />
          )}
          {showXAxis && (
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "#747781" }}
              tickMargin={4}
              interval={xTickInterval ?? ("preserveStartEnd" as const)}
            />
          )}
          {showYAxis && (
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "#747781" }}
              tickMargin={4}
              domain={yDomain}
              tickCount={5}
              tickFormatter={(value: number) => value.toFixed(2)}
              width={48}
            />
          )}
          <ChartTooltip
            content={
              <ChartTooltipContent
                indicator="line"
                labelFormatter={(label: string) => label}
                formatter={(value) => (typeof value === "number" ? value.toFixed(4) : value)}
              />
            }
          />
          <defs>
            <linearGradient id={`areaGradient-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={areaOpacity + 0.1} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            dataKey="value"
            type="monotone"
            stroke={color}
            strokeWidth={2}
            fill={`url(#areaGradient-${color.replace("#", "")})`}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0, fill: color }}
            connectNulls={connectNulls}
          />
        </RechartsAreaChart>
      </ChartContainer>
    </div>
  )
}
