# 技术决策

面向 AI agent 和维护者的长期决策记录。当某个选择需要指导后续工作时，补充到这里。

## D001 - Local-First 运行时

决策：应用保持 local-first。本地状态和偏好先渲染，认证后再异步进行云同步。

原因：用户应能在未登录、网络不可用或未配置 Supabase 的情况下使用 PWA。云同步提升跨设备能力，但不能阻塞核心产品。

影响：

- `AppState`、估值序列和关键偏好必须可从本地读取。
- Supabase 冲突必须在本地渲染后解决。
- 清理流程必须针对应用自有 key，不能清空全部浏览器存储。

## D002 - 集中刷新流程

决策：基金刷新由 `src/components/app-provider.tsx` 统一协调，刷新间隔由 `state.refreshMs` 驱动。

原因：页面级轮询会造成数据不一致、耗电和难以排查的刷新竞态。

影响：

- 页面应消费状态并调用共享刷新动作，而不是创建独立定时器。
- 新增数据刷新行为必须遵守 `src/lib/fund-api.ts` 中的数据源限流和超时规则。

## D003 - 业务时间统一走 `time.ts`

决策：业务时间、交易时间和展示日期语义必须集中在 `src/lib/time.ts`。

原因：持仓收益、持有天数、官方净值确认和市场状态都依赖一致的时区处理。

影响：

- 避免在业务逻辑中直接使用裸日期 API。
- 缺少时间辅助方法时，应补充到 `time.ts`，不要在页面中复制逻辑。

## D004 - 官方净值稳定性

决策：当某基金已经到达预期最新官方净值日后，刷新不应因数据源失败或回退降级把它回滚到更旧的官方数据。

原因：官方确认后持仓汇总应保持稳定，盘中估值仍可继续更新。

影响：

- 保持 `officialConfirmedAt` 和 `officialConfirmedForDate` 语义。
- 修改官方抓取回退链路时，必须验证持仓展示和汇总。

## D005 - 偏好与核心业务数据分离

决策：UI 偏好属于应用自有偏好存储和选定同步 payload，不直接混入核心基金/交易实体。

原因：列显隐、列顺序、行情自选指数和未来行顺序描述的是展示方式，不是业务事实。

影响：

- 长期 UI 偏好持久化到 `localStorage`。
- 会话级视图状态持久化到 `sessionStorage`。
- 需要进入云同步的偏好使用 `src/lib/user-preferences.ts`。

## D006 - 持仓表格重构路径

决策：持仓表格应按小步、保持行为不变的方式重构。

原因：当前表格混合了承载密度很高的持仓计算、sticky 布局、列显隐/顺序持久化、滚动恢复、行导航和金融展示语义。

已接受路径：

1. 先把 `src/app/portfolio/page.tsx` 中当前内联表格渲染提取到独立组件，不改变行为。
2. 提取稳定后，再引入本地 `shadcn/ui` 风格 table primitive。
3. 使用现有 CSS 策略保持 sticky 表头和 sticky 首列行为。
4. 未来基金行排序作为 UI 偏好数据实现，优先通过 `/portfolio/reorder` 等独立路由，不在高密度主表格中直接加入拖拽手势。

约束：

- Sticky 表头和 sticky 首列单元格必须保持明确背景。
- 横向和纵向滚动应保持在同一个 `overflow-auto` 容器中。
- 行顺序不应通过修改核心 `state.funds` 顺序表达。

## D007 - Harness 文档结构

决策：面向 AI 的项目上下文拆分为 harness 结构：

- `AGENTS.md`：AI 入口规则和阅读顺序。
- `docs/SPEC.md`：产品与功能规格。
- `docs/ARCHITECTURE.md`：架构硬约束。
- `docs/DECISIONS.md`：长期技术决策。

原因：旧的单一 AI 指南混合了产品事实、实现规则和决策记录。拆分上下文可以减少 AI coding 会话中的歧义，并让长期决策更容易查找。

## D008 - Markdown 文档必须使用中文

决策：AI 生成或重构 Markdown 文档时，正文必须使用中文。

原因：项目文档主要面向中文协作语境，统一语言可以降低阅读成本，避免中英文混杂导致规则被遗漏。

约束：

- 专有名词、代码标识符、命令、路径、API 字段、库名和协议名可以保留英文。
- 新增或重构 `*.md` 时，应优先使用中文标题、中文段落和中文列表项。
- 如果引用外部英文资料，可保留原文链接或短语，但必须用中文解释其项目语义。

## D009 - 卡片组件统一使用 shadcn Card

决策：项目中的卡片容器统一使用 `src/components/ui/card.tsx`（shadcn Card 组件），不再手写临时卡片样式。

原因：统一卡片模板可以保证圆角、边框、阴影和内边距策略在整个应用中一致，降低后续维护成本。

影响：

- 新增卡片类布局时，优先使用 `Card` / `CardHeader` / `CardContent` / `CardFooter` 等子组件。
- 外观差异通过 `className` 覆写，不另起裸 `div` 模拟卡片。
- 如有特殊需求需要独立卡片样式，须在 `DECISIONS.md` 中记录例外理由。

## D010 - 面积走势图统一使用 shadcn AreaChart

决策：项目中净值走势图等面积图统一使用 `src/components/ui/area-chart.tsx`（基于 Recharts + shadcn Chart 封装），不再使用 `@ant-design/charts` 中的 `Area` 组件。

原因：统一图表组件可保证交互行为（tooltip、坐标轴、渐变填充）一致，同时复用 shadcn Chart 的深色模式与可访问性体系。Recharts 比 @ant-design/charts 更轻量、更易定制。

影响：

- 新增面积走势图时，引入 `AreaChart` 并传入 `data`、`color` 等 props。
- `data` 格式统一为 `{ label: string; value: number }[]`。
- 不再在业务页面中引入 `@ant-design/charts` 的 `Area`。

## D011 - 饼图统一使用 shadcn PieChart

决策：项目中饼图/环形图统一使用 `src/components/ui/pie-chart.tsx`（基于 Recharts + shadcn Chart 封装），不再使用 `@ant-design/charts` 的 `Pie` 组件。

原因：与面积走势图决策一致，统一图表组件可保证交互行为和色调体系一致。内置图例列表比 @ant-design/charts 的 legend 更适合移动端紧凑布局。

影响：

- 新增饼图时，引入 `PieChart` 并传入 `data`（`{ name: string; value: number }[]`）。
- 环形内径通过 `innerRadius`、`outerRadius` 控制，图例通过 `showLegend` 开关。
- 不再在业务页面中引入 `@ant-design/charts` 的 `Pie`。
