# lib 模块说明

路径：`/src/lib`

## 责任

- 基金数据请求与解析
- 持仓与收益计算
- 本地存储、偏好、时间序列和云端同步

## 关键文件

- `/src/lib/fund-api.ts`：基金搜索/估值/历史净值请求
- `/src/lib/market-api.ts`：行情指数、基金板块、7x24 快讯请求
- `/src/lib/portfolio.ts`：持仓计算与统计
- `/src/lib/storage.ts`：本地存储读写
- `/src/lib/user-preferences.ts`：关键 UI 偏好读写与同步白名单
- `/src/lib/cloud-user-data.ts`：云端 payload、合并、拉取、上传
- `/src/lib/supabase-client.ts`：Supabase 客户端
- `/src/lib/valuation-timeseries.ts`：估值序列缓存
- `/src/lib/time.ts`：交易时间处理
- `/src/lib/types.ts`：业务类型定义
- `/src/lib/demo-data.ts`：演示数据生成

## API 与字段
- 基金搜索：`fundsuggest.eastmoney.com/FundSearchAPI`
- 基金实时估值：`fundgz.1234567.com.cn/js/{code}.js`
- 基金历史净值：`fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz`
- 行情指数：腾讯行情 `qt.gtimg.cn`
- 行情快讯 / 板块：东财公开接口（见 `market-api.ts`）
- `FundSnapshot` 当前承载：净值/估值、来源状态、基金基础资料、重仓披露信息等页面使用字段
- `SearchFundResult` 当前承载：代码、名称、分类、基金类型、拼音等搜索结果字段

## 基金数据取值规则（`/src/lib/fund-api.ts`）

### 1) 估值链路（双源）
- 主源：东方财富估值脚本 `fundgz.1234567.com.cn/js/{code}.js`
- 备源：腾讯基金行情 `qt.gtimg.cn/q=jj{code}`
- 触发规则：
  - 主源成功且 `gsz/gszzl/gztime` 完整 -> 直接使用
  - 主源失败或字段不完整 -> 切换腾讯估值备源
- `gztime` 规则：保留数据源日期语义，不再强制改成当天，避免把陈旧数据误判为盘中实时数据。

### 2) 官方净值链路（多源回退）
- 主源：东财历史净值（F10DataApi）
- 备源1：腾讯基金行情
- 备源2：新浪基金行情 `hq.sinajs.cn`
- 字段目标：`dwjz / jzrq / zzl / lastNav`
- 官方锁策略：当某基金已拿到“当前应有最新官方净值日”后，后续刷新跳过官方抓取并复用本地官方快照，避免请求失败导致回退；交易日 `15:00` 后若仍停留在上一净值日，会重新尝试官方抓取。

### 3) 来源标记（`FundSnapshot.source`）
- `eastmoney`：当前记录主要来自东方财富
- `tencent`：当前记录主要来自腾讯
- `sina`：当前记录主要来自新浪
- `danjuan`：历史兼容值（当前链路已不再写入）
- `fallback`：兼容历史状态值（现行链路尽量写具体来源）
- `officialSource`：官方链路实际来源（`eastmoney | tencent | sina | fallback`）
- `estimateSource`：估值链路实际来源（当前 `eastmoney | tencent | fallback`）

### 4) 刷新与防 ban 最小访问间隔
- `eastmoneyEstimate`: `1200ms`
- `eastmoneyHistory`: `1000ms`
- `tencentQuote`: `1500ms`
- `sinaQuote`: `1500ms`
- `eastmoneySearch`: `800ms`

额外策略：
- 同源请求串行队列（`runWithSourceInterval`）
- 估值缓存 `ESTIMATE_CACHE_MS = 45s`
- 超时保护：估值/官方回退请求均有 timeout
- 刷新分层：
  - `fetchFundBaseData`：轻量报价刷新（用于持仓页定时刷新）
  - `fetchFundArchiveData`：档案补齐（重仓/概况字段后台异步预取）
  - `fetchFundData`：兼容全量入口（base + archive）

### 5) 与页面计算直接相关的字段语义
- `dwjz/jzrq/zzl`：官方确定值（日终口径）
- `gsz/gztime/gszzl`：盘中估值口径
- `quoteStatus`：`estimated | official`
- `noValuation`：当前是否缺估值链路
- `officialConfirmedAt/officialConfirmedForDate`：官方值首次确认时间与对应净值日
- `officialSource/estimateSource/source`：官方来源、估值来源、当前活跃来源

## 存储与同步

### 本地状态

- `storage.ts` 管理 `AppState`、设备 ID、数据版本号下限
- `normalizeAppState()` 负责容错和结构修正
- 每次用户数据变更都会递增 `sync.dataVersion`

### 关键偏好

- `user-preferences.ts` 只管理需要跨设备同步的关键 UI 偏好
- 当前包括：持仓列显隐、持仓列顺序、行情页自选指数、手动同步时间戳

### 云端同步

- `cloud-user-data.ts` 将应用状态拆为 `coreState + preferences + sync`
- 同步策略是 `local-first, async-cloud-sync`
- 支持云端较新拉取、本地较新上传、同版本冲突合并
- 合并时会合并基金列表、交易记录、搜索历史、收藏和关键偏好

## 约束

- 保持纯函数优先，减少 UI 耦合
- 不破坏既有 localStorage 键结构
- 计算逻辑若影响 UI 呈现（收益率、净值格式等），需同步验证 portfolio/market/settings 页面
- 业务时间统一走 `time.ts`
- 当前实现以代码和本文件为准
