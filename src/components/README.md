# components 模块说明

路径：`/src/components`

## 责任

- 复用 UI 组件与页面片段
- 图表、表格、详情与操作流组件
- 应用壳层、认证、导航与全局状态编排
- 基础 UI 原语（卡片、表格、图表、选择器、Tab 等）

## 页面级组件

- `app-provider.tsx`：全局状态上下文，刷新调度、交易操作、云同步编排
- `auth-provider.tsx`：Supabase 登录态管理
- `app-shell.tsx`：主壳层容器，页面切换动画、登录门禁、云同步冲突弹窗
- `bottom-nav.tsx`：底部主导航（基于 `Tabs05` 封装），含刷新周期进度
- `fund-detail-view.tsx`：基金详情视图（净值走势、收益日历、持仓明细）
- `fund-buy-view.tsx`：加仓操作视图，支持金额/份额双模式、历史净值回查、15:00 前后节点
- `fund-sell-view.tsx`：减仓操作视图，含最大可卖限制，支持编辑已有卖出记录
- `fund-manage-view.tsx`：持仓管理视图（批量编辑份额/成本/首次买入日期）
- `fund-card.tsx`：基金卡片组件（迷你图、持有指标、关注/移除操作）
- `history-view.tsx`：交易历史主视图
- `portfolio-table.tsx`：旧版持仓表格
- `portfolio-overview-table.tsx`：新版持仓总览表格，sticky 表头 + sticky 首列，支持列显隐配置、触摸轴锁定
- `holding-editor.tsx`：单基金持仓内联编辑器（份额/成本/首次买入日期）
- `service-worker-register.tsx`：Service Worker 注册组件

## 图表与可视化组件

- `sparkline.tsx`：迷你走势图（SVG path），用于基金卡片
- `monthly-return-calendar.tsx`：月度收益日历热力图，按交易日着色
- `return-trend-chart.tsx`：收益趋势折线图（SVG），支持正负轴
- `return-distribution.tsx`：收益分布柱状图，含标题和汇总值
- `performance-line-chart.tsx`：净值/收益率折线图（SVG），含面积填充和基线
- `performance-heatmap.tsx`：盈亏热力图网格，8 级色彩分层

## UI 基础组件（`ui/`）

- `card.tsx`：卡片容器（Card / CardHeader / CardTitle / CardDescription / CardContent / CardFooter），基于 `cn()` 组合样式
- `chart.tsx`：Recharts 图表基础设施（ChartContainer / ChartTooltip / ChartTooltipContent / ChartLegend / ChartLegendContent / ChartStyle）
- `area-chart.tsx`：面积图组件，基于 Recharts AreaChart，支持网格、双轴、渐变填充、空值连接
- `pie-chart.tsx`：饼图组件，基于 Recharts PieChart，自动配色、图例展示
- `table.tsx`：表格原语（Table / TableHeader / TableBody / TableRow / TableHead / TableCell）
- `scroll-area.tsx`：滚动区域容器，支持单向/双向滚动，可选隐藏滚动条
- `tabs-05.tsx`：底部 Tab 导航组件，基于链接，支持活跃态高亮
- `secondary-bottom-nav.tsx`：次级底部操作栏，通过 Portal 挂载到 body
- `tw-select.tsx`：下拉选择器，基于 Headless UI Listbox

## 约束

- 保持组件无副作用与可组合性
- 数值颜色使用 `is-up`/`is-down` 语义类
- 全局视觉与弹窗硬约束统一见 `/AGENTS.md` 与 `/docs/ARCHITECTURE.md`
- 导航组件文案需与路由语义一致（当前：持仓总览/发现/行情中心/交易历史/个人中心）

## 状态流关键规则

### `auth-provider.tsx`

- 开发环境默认不强制登录
- 生产环境接入 Supabase 后，GitHub OAuth 作为登录入口
- 未配置 Supabase 时，壳层会提示配置缺失

### `app-provider.tsx`

#### 1) 刷新调度
- 所有基金刷新通过 `refreshFunds()` 汇总执行。
- 自动刷新周期绑定 `state.refreshMs`（设置页可配置）。
- 有并发保护：刷新进行中不会重入。

#### 2) 本地优先 + 云端同步

- 启动先读取本地 `AppState`、估值序列和关键偏好
- 登录后再比对云端版本，决定上传、拉取或合并
- 冲突处理入口在 `AppShell`，支持保留本地、保留云端、合并

#### 3) 估值粘性保留（防瞬时掉无估值）
- 刷新合并使用 `mergeQuoteWithIntradayFallback(previous, next)`。
- 若本次请求缺估值字段，但“今天盘内已有上次有效估值”，则保留旧 `gsz/gszzl/gztime`。
- 若本次成功拿到估值，立即覆盖并更新对应时间。

#### 4) 官方值稳定策略（由数据层执行）
- `app-provider` 每轮刷新都会拉取 `fetchFundBaseData`，但官方链路是否实际请求由 `lib/fund-api.ts` 控制。
- 当数据层判定某基金已拿到“当前应有最新官方净值日”，会跳过官方请求，仅刷新估值链路，保证页面官方列稳定不回退。

#### 5) 偏好与清理

- 关键 UI 偏好由 `src/lib/user-preferences.ts` 统一收集，用于云同步
- `clearAll()` 与 `clearLocalOnly()` 只清理项目自身命名空间，不应误删外部存储

#### 6) 备份与手动同步

- 设置页支持导出/导入本地备份，备份内容包含 `AppState`、估值序列和项目命名空间下的本地存储快照
- 设置页支持手动上传云端和拉取云端配置，并记录最近操作时间

#### 7) 演示数据写入/清理
- `seedDemoData()`：写入完整演示持仓、交易、估值序列。
- 设置页提供“写入演示数据 / 删除演示数据”两个入口，交互样式保持一致。

#### 8) 交易操作
- `addTransaction(code, payload)`：追加买入/卖出记录，自动重算持仓
- `updateTransaction(code, txId, payload)`：编辑已有交易记录并重算
- `removeTransaction(code, txId)`：删除交易记录并重算

## 壳层与交互

- `AppShell` 负责页面切换动画、登录态门禁、云同步状态提示和冲突弹窗
- `BottomNav` 除路由高亮外，还展示基于 `state.refreshMs` 的刷新周期进度
- 多个页面会通过 `app-modal-open` 统一锁定背景滚动，交互样式必须保持一致
- `SecondaryBottomNav` 通过 React Portal 注入到 body，用于加仓/减仓页的底部确认栏
