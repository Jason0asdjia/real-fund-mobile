# components 模块说明

路径：`/src/components`

## 责任
- 复用 UI 组件与页面片段
- 图表、表格、详情与操作流组件
- 应用壳层与导航

## 关键文件
- `/src/components/app-provider.tsx`：状态上下文
- `/src/components/app-shell.tsx`：主壳层容器
- `/src/components/bottom-nav.tsx`：底部导航
- `/src/components/fund-detail-view.tsx`：基金详情视图
- `/src/components/fund-manage-view.tsx`：持仓操作视图
- `/src/components/portfolio-table.tsx`：持仓表格
- `/src/components/service-worker-register.tsx`：SW 注册组件

## 约束
- 保持组件无副作用与可组合性
- 数值颜色使用 `is-up`/`is-down` 语义类
- 全局视觉与弹窗硬约束统一见 `/agent.md`
- 导航组件文案需与路由语义一致（当前：持仓总览/发现/行情中心/个人中心）

## 状态与刷新关键规则（`/src/components/app-provider.tsx`）

### 1) 刷新调度
- 所有基金刷新通过 `refreshFunds()` 汇总执行。
- 自动刷新周期绑定 `state.refreshMs`（设置页可配置）。
- 有并发保护：刷新进行中不会重入。

### 2) 估值粘性保留（防瞬时掉无估值）
- 刷新合并使用 `mergeQuoteWithIntradayFallback(previous, next)`。
- 若本次请求缺估值字段，但“今天盘内已有上次有效估值”，则保留旧 `gsz/gszzl/gztime`。
- 若本次成功拿到估值，立即覆盖并更新对应时间。

### 3) 演示数据写入/清理
- `seedDemoData()`：写入完整演示持仓、交易、估值序列。
- 设置页提供“写入演示数据 / 删除演示数据”两个入口，交互样式保持一致。
