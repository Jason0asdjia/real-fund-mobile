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
- 页面字体、间距、标题层级等全局约束遵循 `/AGENT.md`
- 弹窗行为遵循 `/AGENT.md` 中的弹窗统一规范

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
> - **估值可用性**：`gztime` 需通过 `isEstimateTimestampUsable`
> - **官方锁定**：当某基金拿到“当前应有的最新官方净值日”后，后续刷新不再请求官方链路，避免刷新失败导致官方值回退

- `最新净值`（`latestNav`）
  - 展示：`dwjz`
  - 时间：`officialUpdatedAt`（由 `jzrq` 显示 `MM-DD`）
  - 规则：官方值一旦确认后按官方锁定策略持有；交易日 `15:00` 之后若仍是上一净值日，会重新参与官方抓取，拿到当日官方后再次锁定

- `估算净值`（`estimateNav`）
  - 展示：估值可展示时取 `gsz`，否则 `—`
  - 时间：`estimateUpdatedAt`（由 `gztime` 显示 `MM-DD HH:mm`）
  - 规则：支持收盘后到次日开盘前沿用上一交易日收盘估值展示

- `昨日涨幅`（`yesterdayChangePercent`）
  - 展示：`zzl`（百分比，来自官方口径）
  - 时间：`officialUpdatedAt`
  - 规则：若当前轮未拿到新官方涨幅，按“同官方日期可续用、跨日期不误续用”策略回退

- `估值涨幅`（`estimateChangePercent`）
  - 展示：`gszzl`（百分比）
  - 时间：`estimateUpdatedAt`

- `估算收益`（`totalChangePercent`，金额口径）
  - 优先：`(gsz - cost) * share`
  - 回退：`holdingProfit`（官方持有收益）
  - 时间：`estimatedProfitUpdatedAt`（估值可展示时显示估值时间，否则 `—`）

- `持仓金额`（`holdingAmount`）
  - 来源：官方口径 `share * dwjz`
  - 时间：`officialConfirmedUpdatedAt`

- `当日收益`（`todayProfit`）
  - 盘中：使用估值涨幅链路
  - 当天官方值已出：切换官方涨幅链路
  - 时间：`currentValueUpdatedAt`
  - 图标：`official`=圈内对号，`estimated`=圆圈

- `开发模式来源`（仅 `NODE_ENV !== production`）
  - 展示：`来源：{当前使用来源}`
  - 规则：动态跟随当前实际计算口径（官方态显示官方来源，估值态显示估值来源）

- `持有收益`（`holdingProfit`）
  - 仅官方口径：`(dwjz - cost) * share`
  - 时间：`officialUpdatedAt`
  - 规则：与最新净值同步，未发布当日官方时保持上一交易日日期

## 标题栏汇总口径（与表格列区分）

- 总资产：汇总 `row.holdingAmount`
- 当日收益：汇总 `row.todayProfit`
- 累计收益（持有收益）：汇总 `row.holdingProfit`（官方链路）

说明：当前标题栏“累计收益（持有收益）”与表格“持有收益”统一为官方口径。
