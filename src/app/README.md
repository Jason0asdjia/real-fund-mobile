# app 模块说明

路径：`/src/app`

## 责任
- App Router 路由与页面入口
- 全局布局与导航挂载
- 页面级组合（portfolio/discover/market/settings）

## 关键文件
- `/src/app/layout.tsx`：全局布局、元数据、PWA 注册入口
- `/src/app/globals.css`：Tailwind 层（base/components/utilities）
- `/src/app/page.tsx`：首页重定向（当前指向 `/portfolio`）
- `/src/app/portfolio/page.tsx`：持仓总览（主入口）
- `/src/app/discover/page.tsx`：基金搜索与添加
- `/src/app/market/page.tsx`：行情中心
- `/src/app/settings/page.tsx`：个人中心
- `/src/app/dashboard/page.tsx`：历史驾驶舱页面（代码保留，默认不作为主导航入口）

## 约束
- 页面默认按移动端优先布局
- 优先使用 Tailwind utility 与组件层类
- 页面字体、间距、标题层级等全局约束遵循 `/agent.md`
- 弹窗行为遵循 `/agent.md` 中的弹窗统一规范

## Typography 约束（页面层）
- 页面主标题统一使用 `typo-page-title`。
- 分区标题统一使用 `typo-section-title`。
- 字段标签统一使用 `typo-label`。
- 主金额/主指标统一使用 `typo-value-hero`；强调指标使用 `typo-value-emphasis`。
- 列表主文案使用 `typo-body-strong`；辅助信息使用 `typo-meta`/`typo-micro`。
- 页面内禁止引入新的临时字号梯度，优先复用上述语义类。

## 持仓表格（`/src/app/portfolio/page.tsx`）列计算规则

> 口径约定：
> - **官方链路**：`dwjz/jzrq/zzl`（日终确定值）
> - **估值链路**：`gsz/gztime/gszzl`（盘中估算值）
> - **估值可用性**：`gztime` 需通过 `isEstimateTimestampUsable`（同日、非未来时刻、交易日且 09:15~15:00）

- `最新净值`（`latestNav`）
  - 展示：`dwjz`
  - 时间：`officialUpdatedAt`（由 `jzrq` 显示 `MM-DD`）
  - 规则：当日官方未发布时保留上一交易日日期；发布后切到当日日期

- `估算净值`（`estimateNav`）
  - 展示：`gsz`
  - 时间：`estimateUpdatedAt`（由 `gztime` 显示 `MM-DD HH:mm`）

- `昨日涨幅`（`yesterdayChangePercent`）
  - 展示：`zzl`（百分比）
  - 时间：`officialUpdatedAt`
  - 规则：当日官方未发布时保留上一交易日日期；发布后切到当日日期

- `估值涨幅`（`estimateChangePercent`）
  - 展示：`gszzl`（百分比）
  - 时间：`estimateUpdatedAt`

- `估算收益`（`totalChangePercent`，金额口径）
  - 优先：`(gsz - cost) * share`
  - 回退：`metrics.profitTotal`
  - 时间：`estimatedProfitUpdatedAt`（估值可用时显示估值时间，否则显示 `—`）

- `持仓金额`（`holdingAmount`）
  - 来源：`getHoldingMetrics().amount`
  - 盘中估值可用时跟随 `gsz`，否则回落官方链路
  - 时间：`currentValueUpdatedAt`

- `当日收益`（`todayProfit`）
  - 盘中：使用估值涨幅链路
  - 当天官方值已出：切换官方涨幅链路
  - 时间：`currentValueUpdatedAt`
  - 图标：`official`=圈内对号，`estimated`=圆圈

- `持有收益`（`holdingProfit`）
  - 仅官方口径：`(dwjz - cost) * share`
  - 时间：`officialUpdatedAt`
  - 规则：与最新净值同步，未发布当日官方时保持上一交易日日期

## 标题栏汇总口径（与表格列区分）

- 总资产：汇总 `row.holdingAmount`
- 当日收益：汇总 `row.todayProfit`
- 累计收益（持有收益）：汇总 `row.holdingProfit`（官方链路）

说明：当前标题栏“累计收益（持有收益）”与表格“持有收益”统一为官方口径。
