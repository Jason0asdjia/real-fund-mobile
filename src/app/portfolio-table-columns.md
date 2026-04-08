# 持仓表格列取值与计算规则（`/src/app/portfolio/page.tsx`）

更新时间：以当前代码实现为准（核心入口：`buildRows`）。

---

## 1) 口径总览

- 官方链路：`dwjz / jzrq / zzl / officialConfirmedAt`
- 估值链路：`gsz / gztime / gszzl`
- 交易确认链路：`applyConfirmedTransactionsToHolding`（仅已确认加减仓影响持仓）

> 备注：交易确认日规则当前按“工作日近似（跳过周末）”，未接入交易所法定节假日 API。

---

## 2) 核心变量中文释义（代码变量 -> 含义）

### 2.1 行级计算变量（`portfolio/page.tsx`）

- `hasTodayData`：该基金是否已经拿到“今天官方净值”（`jzrq === 今天`）。
- `hasTodayValuation`：是否拿到“今天估值时间戳”（`gztime` 是今天）。
- `canUseEstimate`：当前行是否允许使用估值（今天未出官方 + 今天有估值 + `gsz` 有效）。
- `hasTodayEstimate`：估值字段是否是今天有效样本（用于 `estimateNav` 计算）。
- `latestNav`：官方净值数值（由 `dwjz` 转数值）。
- `estimateNav`：估值净值数值（由 `gsz` 转数值）。
- `lastNav`：前一日净值（`lastNav` 字段）。
- `officialChangePercent`：官方涨跌幅（优先 `zzl`，缺失时回退 `(latestNav-lastNav)/lastNav`）。
- `yesterdayChangePercent`：昨日涨幅展示值（仅取 `zzl`，不做净值差回推）。
- `useOfficialForTodayProfit`：当日收益是否切到官方口径（`hasTodayData && officialChangePercent != null`）。
- `activeTodayChangePercent`：当日收益实际使用的涨跌幅（官方优先，否则估值）。
- `hasValidPosition`：份额有效且大于 0。
- `hasCostPosition`：份额有效 + 成本有效。
- `holdingAmount`：持仓金额（当前固定官方口径：`share * latestNav`）。
- `holdingProfit`：持有收益（官方口径：`(latestNav - cost) * share`）。
- `estimatedHoldingProfit`：累计收益汇总口径（优先估值，缺失时回退 `holdingProfit`）。

### 2.2 时间戳变量（`portfolio/page.tsx`）

- `officialUpdatedAt`：官方日期时间（由 `jzrq` 格式化为 `MM-DD`）。
- `officialConfirmedUpdatedAt`：官方首次确认时间（`officialConfirmedAt` 与 `officialConfirmedForDate===jzrq` 时显示 `MM-DD HH:mm`，否则回退 `officialUpdatedAt`）。
- `yesterdayChangeUpdatedAt`：昨日涨幅对应时间（优先 `officialConfirmedAt`，否则回退 `officialUpdatedAt`）。
- `estimateUpdatedAt`：估值时间（`gztime` -> `MM-DD HH:mm`）。
- `holdingAmountUpdatedAt`：持仓金额时间（当前绑定 `officialConfirmedUpdatedAt`）。
- `currentValueUpdatedAt`：当前值时间（当日收益官方态用官方确认时间，否则估值时间，再否则官方日期）。
- `estimatedProfitUpdatedAt`：估算收益时间（估值可用时用估值时间，否则官方日期）。
- `holdingDaysUpdatedAt`：持有天数时间（按项目时区当天日期 `MM-DD`，自然日 0 点切日）。

### 2.3 数据层变量（`lib/fund-api.ts`）

- `effectiveLatestNav / effectiveLatestDate`：本轮最终采用的官方净值与净值日期。
- `useEstimateOfficial`：是否采用估值接口携带的官方快照（用于修复“历史源滞后”场景）。
- `computedOfficialGrowth`：本轮计算得到的官方涨跌幅候选值。
- `effectiveOfficialGrowth`：最终写入 `zzl` 的值（候选无效时沿用上一笔）。
- `officialConfirmedAt / officialConfirmedForDate`：首次拿到某一净值日官方确认值的时间与对应日期。

### 2.4 持仓确认变量（`lib/portfolio.ts`）

- `isTransactionConfirmedInMarket`：交易是否已确认（15:00 前 T+1，15:00 后 T+2，周末顺延）。
- `applyConfirmedTransactionsToHolding`：把“已确认交易”折算为当前可见份额/成本/首次买入日。

---

## 3) 预处理规则（影响所有列）

1. 行内持仓先由 `applyConfirmedTransactionsToHolding(holding, transactions)` 计算：
   - 未确认交易不进入份额/成本；
   - 15:00 前交易按 T+1 确认，15:00 后按 T+2 确认（周末顺延）。
2. 当日官方数据判定：`hasTodayData = fund.jzrq === todayInMarket()`。
3. 估值可用判定：`canUseEstimate = !hasTodayData && gztime 为今日 && gsz 有效`。

---

## 4) 各列规则

### 1) 最新净值（`latestNav`）
- 值：`formatNav(fund.dwjz)`（官方净值）
- 时间：`officialConfirmedUpdatedAt`
  - 当 `officialConfirmedAt` 且 `officialConfirmedForDate === jzrq`：显示 `MM-DD HH:mm`
  - 否则回退 `officialUpdatedAt`（`jzrq` 的 `MM-DD`）

### 2) 估算净值（`estimateNav`）
- 值：`fund.noValuation ? "—" : formatNav(fund.gsz)`
- 时间：`estimateUpdatedAt`（`gztime -> MM-DD HH:mm`）

### 3) 昨日涨幅（`yesterdayChangePercent`）
- 值：仅官方 `zzl`；`Number.isFinite(Number(fund.zzl)) ? Number(fund.zzl) : null`
- 兜底：若本次未拿到新 `zzl`，数据层会沿用上次 `zzl`
- 时间：`yesterdayChangeUpdatedAt`
  - 优先 `officialConfirmedAt -> MM-DD HH:mm`
  - 无则回退 `officialUpdatedAt`

### 4) 估值涨幅（`estimateChangePercent`）
- 值：`gszzl`
- 时间：`estimateUpdatedAt`

### 5) 估算收益（`totalChangePercent`，金额）
- 值：
  - 有估值：`(estimateNav - cost) * share`
  - 无估值：回退 `metrics?.profitTotal`
- 时间：`estimatedProfitUpdatedAt`
  - 有估值时：`estimateUpdatedAt`
  - 无估值时：`officialUpdatedAt`

### 6) 持仓金额（`holdingAmount`）
- 值：官方口径，`share * latestNav(dwjz)`；`latestNav` 无效则为 `0`
- 时间：`holdingAmountUpdatedAt = officialConfirmedUpdatedAt`

### 7) 持有天数（`holdingDays`）
- 值：`holdingDaysInMarket(firstPurchaseDate)`（自然日、北京时间 0 点切日）
- 时间：`holdingDaysUpdatedAt = 当日 MM-DD`

### 8) 当日收益（`todayProfit`）
- 值：
  - 当天官方已出：用官方涨幅链路
  - 否则估值可用：用估值涨幅链路
  - 否则 `null`
- 状态：`todayProfitStatus = official | estimated | none`
- 时间：
  - `official`：`officialConfirmedUpdatedAt`
  - `estimated`：`currentValueUpdatedAt`

### 9) 持有收益（`holdingProfit`）
- 值：官方口径，`(dwjz - cost) * share`
- 时间：`officialConfirmedUpdatedAt`

---

## 5) 日内/跨日场景矩阵（review 依据）

### 场景 A：交易日盘前（官方仍是上一交易日）
- 最新净值/持仓金额/持有收益：显示上一官方值与官方时间。
- 估算净值/估值涨幅：可能显示 `—` 或上一估值样本（取决于 `gztime` 是否是今天）。
- 当日收益：多为 `none` 或估值态（视估值是否已开始）。

### 场景 B：交易日盘中（今天估值持续更新，官方仍未出）
- 最新净值/持仓金额/持有收益：保持上一官方值（符合“官方口径固定”设想）。
- 当日收益/估算收益：走估值链路，时间显示估值时间。
- 昨日涨幅：显示最近一次可用官方 `zzl`（没有新 `zzl` 时保留上次值+时间）。

### 场景 C：收盘后，今天官方确认值已到
- 最新净值、昨日涨幅、持仓金额、持有收益：切换到今天官方值。
- 对应时间：统一走首次官方确认时间（或官方日期回退）。
- 当日收益：状态从 estimated 切到 official（勾选图标）。

### 场景 D：跨日到次日盘中（次日官方未出）
- 最新净值等官方列：保持昨日官方值与时间。
- 当日收益：恢复估值链路（如果有次日估值）。
- 持有天数：按自然日在 0 点切日 +1。

### 场景 E：有加减仓但尚未确认
- 表格份额/成本/金额/收益不立即变动。
- 到确认日后才并入持仓，随后影响持仓金额与收益列。

---

## 6) review 结论（当前实现是否符合设想）

### 符合项（✅）

1. 官方口径列（最新净值 / 持仓金额 / 持有收益）在盘中不会被估值污染，收盘后拿到官方值后更新。
2. 昨日涨幅按官方 `zzl` 展示，拿不到新值时保留上一次值与时间，不会错误清空。
3. 当日收益具备 official/estimated 状态切换，且时间跟随当前口径。
4. 加减仓只有在确认日后才影响持仓展示。

### 已知边界（⚠️）

1. 交易确认日目前只跳过周末，不识别法定节假日（极端节假日周可能提前确认）。
2. 持有天数为自然日 0 点切日，不是交易日/收盘口径（这是当前已确认需求）。

---

## 7) 顶部汇总口径（与列不同）

- 总资产：`sum(row.holdingAmount)`（当前为官方口径）
- 当日收益：`sum(row.todayProfit)`
- 累计收益（持有收益）：`sum(row.holdingProfit)`（官方口径）

---

## 8) 相关实现文件

- `/src/app/portfolio/page.tsx`（列计算与显示）
- `/src/lib/portfolio.ts`（交易确认与持仓折算）
- `/src/lib/fund-api.ts`（官方确认时间、`zzl` 续用、官方快照合并策略）
- `/src/lib/time.ts`（自然日、交易时段、时间格式化）
