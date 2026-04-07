# 前端数据字段与 API 完善说明

更新时间：2026-04-07

## 参考来源
- 参考仓库：`hzm0321/real-time-fund`
- 参考接口（公开 JSONP/HTML）：
  - `https://fundgz.1234567.com.cn/js/{code}.js`（基金实时估值）
  - `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code={code}`（历史净值）
  - `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code={code}`（前十重仓）
  - `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jbgk&code={code}`（基金基本概况）
  - `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?...`（基金搜索）

## 本次补充内容

### 1) 数据模型扩展（`src/lib/types.ts`）
- `FundSnapshot` 新增：
  - `source`、`quoteStatus`
  - `holdings`、`holdingsReportDate`、`holdingsIsLastQuarter`
  - `fundType`、`riskLevel`、`fundManager`、`fundCompany`
  - `fundScale`、`trackingTarget`、`inceptionDate`
- 新增 `FundHoldingStock` 类型（重仓股票结构）。
- `SearchFundResult` 新增：
  - `category`、`fundType`、`spell`

### 2) API 聚合增强（`src/lib/fund-api.ts`）
- 保留原有估值 + 历史净值逻辑，并新增：
  - `fetchHoldings`：抓取并解析前十重仓数据；
  - `fetchFundProfile`：抓取并解析基金概况字段。
- `fetchFundData` 现在会并行聚合 4 类数据：
  - 历史净值、实时估值、重仓、基础信息。
- 新增内存缓存：
  - 重仓缓存 1 小时；
  - 基础信息缓存 6 小时；
  - 减少高频刷新时的重复请求。
- 当估值失败时：
  - 自动回退到净值数据并打上 `source: "fallback"`、`quoteStatus: "official"`。

### 3) 页面数据接入（`src/components/fund-detail-view.tsx`）
- “前十重仓股”从静态 mock 改为读取 `fund.holdings` 实时数据。
- 头部展示披露日期：`holdingsReportDate`。
- 当重仓数据为空时显示兜底提示，不再硬编码固定股票。

### 4) 演示数据同步（`src/lib/demo-data.ts`）
- 演示种子数据补充了 `holdings` / `holdingsReportDate` / `source` / `quoteStatus`，方便离线场景验证页面。

## 对现有页面的直接收益
- 详情页重仓区与真实基金数据对齐，可直接展示“股票-占比-涨跌幅”结构。
- 数据层已具备基金基础资料字段，为后续在列表/详情页补充“基金经理、规模、风险等级”等信息打好基础。
- API 聚合和缓存能力增强后，刷新体验更稳定，且请求成本更可控。

## 说明
- 当前实现继续保持“纯前端 JSONP + HTML 解析”路线，不新增后端依赖。
- 因运行环境命令限制，本次未能在本地完成 `npm run build` 自动校验（PowerShell 与 WSL 命令不可用/超时），建议在你的本地开发终端再跑一次构建与 lint。
