# app 模块说明

路径：`/src/app`

## 责任

- App Router 路由与页面入口
- 全局布局、壳层挂载、页面级组合
- 页面展示口径，尤其是持仓页指标定义

## 当前页面结构

- `layout.tsx`：全局布局、Provider 挂载、PWA 元数据、全局样式
- `page.tsx`：首页重定向到 `/portfolio`
- `portfolio/page.tsx`：持仓总览主入口
- `portfolio/[code]/page.tsx`：基金详情
- `portfolio/[code]/manage|buy|sell/page.tsx`：持仓管理、买入、卖出
- `discover/page.tsx`：基金搜索、预览、添加
- `market/page.tsx`：指数、板块、快讯
- `history/page.tsx`：交易历史筛选页
- `settings/page.tsx`：刷新频率、演示数据、备份导入导出、手动云同步、账户信息
- `dashboard/page.tsx`：旧驾驶舱页面，代码保留但不在当前主导航

## 页面层约束

- 页面默认按移动端优先布局
- 字体、间距、弹窗和导航约束遵循根目录 `AGENT.md`
- 页面侧只做展示编排；状态写入、刷新、同步逻辑优先复用 `components/app-provider.tsx`

## Typography

- 页面主标题：`typo-page-title`
- 分区标题：`typo-section-title`
- 标签：`typo-label`
- 主金额和主指标：`typo-value-hero`、`typo-value-emphasis`
- 主文案和辅助信息：`typo-body-strong`、`typo-meta`、`typo-micro`

## 持仓页规则

核心计算入口：`portfolio/page.tsx` 里的 `buildRows`

### 数据口径

- 官方链路：`dwjz`、`jzrq`、`zzl`、`officialConfirmedAt`
- 估值链路：`gsz`、`gztime`、`gszzl`
- 估值是否可用统一走 `isEstimateTimestampUsable`
- 已确认官方净值会触发“官方锁”，避免后续刷新把官方值回退到旧日期

### 列规则

- `最新净值`：显示 `dwjz`，时间显示 `jzrq -> MM-DD`
- `估算净值`：估值可展示时显示 `gsz`，否则 `—`
- `昨日涨幅`：显示官方 `zzl`
- `估值涨幅`：显示 `gszzl`
- `估算收益`：优先 `(estimateNav - cost) * share`，无估值时回退 `holdingProfit`
- `持仓金额`：固定官方口径 `share * dwjz`
- `持有天数`：`holdingDaysInMarket(firstPurchaseDate)`，按北京时间自然日切日
- `当日收益`：当天官方已出时走官方涨幅，否则优先走估值涨幅
- `持有收益`：固定官方口径 `(dwjz - cost) * share`
- 开发模式下会显示当前实际使用的数据来源标签

### 汇总口径

- 总资产：`sum(row.holdingAmount)`
- 当日收益：`sum(row.todayProfit)`
- 累计收益：`sum(row.holdingProfit)`

### 页面内持久化

- 持仓页滚动位置使用 `sessionStorage`
- 列显隐和列顺序使用 `localStorage`
- 市场页自选指数使用 `localStorage`

## 相关文件

- `portfolio/page.tsx`
- `market/page.tsx`
- `settings/page.tsx`
- `globals.css`
