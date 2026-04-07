# lib 模块说明

路径：`/src/lib`

## 责任
- 基金数据请求与解析
- 持仓与收益计算
- 本地缓存与时间序列处理

## 关键文件
- `/src/lib/fund-api.ts`：基金搜索/估值/历史净值请求
- `/src/lib/portfolio.ts`：持仓计算与统计
- `/src/lib/storage.ts`：本地存储读写
- `/src/lib/valuation-timeseries.ts`：估值序列缓存
- `/src/lib/time.ts`：交易时间处理
- `/src/lib/types.ts`：业务类型定义
- `/src/lib/demo-data.ts`：演示数据生成

## 约束
- 保持纯函数优先，减少 UI 耦合
- 不破坏既有 localStorage 键结构
- 计算逻辑若影响 UI 呈现（收益率、净值格式等），需同步验证 portfolio/market/settings 页面
