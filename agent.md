# Agent Guide

## 项目目标
- 移动端基金 PWA（iOS 主屏体验优先）
- Next.js App Router + Tailwind UI

## 文档职责
- `README.md`：面向开发者/使用者的项目概览、启动方式、功能摘要
- `agent.md`：面向 AI/协作者的约束、路径索引、文档入口、实现注意事项
- `API_AND_FIELDS_UPDATES.md`：历史归档；当前 API/字段说明已并入模块文档

## 模块与文档路径索引

### Markdown 全量索引（路径 + 摘要）

| 路径 | 摘要 |
|---|---|
| `/README.md` | 项目总览、运行方式、功能入口说明 |
| `/agent.md` | 协作规则、实现约束、文档索引总入口 |
| `/API_AND_FIELDS_UPDATES.md` | API/字段历史归档（当前规范不在此扩写） |
| `/TODO.md` | 阶段任务记录与执行清单 |
| `/src/app/README.md` | 页面模块说明；持仓表格各列计算公式、列口径与时间显示规则 |
| `/src/app/portfolio-table-columns.md` | 持仓表格列的单一真相文档：取值逻辑、计算公式、时间口径、确认链路 |
| `/src/components/README.md` | 组件层职责；`app-provider` 刷新调度、估值粘性保留、演示数据入口规则 |
| `/src/lib/README.md` | 数据源与字段规范；估值双源/官方多源回退、最小访问间隔、防 ban 策略 |
| `/public/README.md` | 静态资源与 PWA 相关文件说明 |

### 模块文档落地原则
- **app 模块文档**：描述页面展示口径（列计算、时间显示、标题汇总规则）。
- **components 模块文档**：描述状态流与交互编排（刷新、合并、演示数据操作）。
- **lib 模块文档**：描述 API 源、字段语义、回退顺序、限频与缓存策略。
- 历史归档与当前规范分离：历史放 `/API_AND_FIELDS_UPDATES.md`，当前规则写模块 README。

### 关键实现路径
- `/src/app/layout.tsx`
- `/src/app/globals.css`
- `/src/components/app-provider.tsx`
- `/src/components/app-shell.tsx`
- `/src/components/bottom-nav.tsx`
- `/src/lib/fund-api.ts`
- `/src/lib/market-api.ts`
- `/src/lib/time.ts`
- `/src/lib/storage.ts`
- `/src/lib/types.ts`

## 协作约束
- 优先保证移动端（约 375px）体验
- 不移除 PWA 文件（`/public/manifest.webmanifest`、`/public/sw.js`）
- 不破坏本地存储键与数据结构
- 改动前后执行：`npm run lint`
- UI 实现优先 Tailwind utility；仅在 Tailwind 难以表达时补少量组件层 CSS
- 能使用 Tailwind 组件时必须使用（含项目内复用组件）；仅在无可用 Tailwind 组件时再落回原生实现
- 页面视觉约束统一遵循本文件中的 `UI 全局硬约束`

## 数据与刷新约束
- 所有通过 API 获取并展示在页面上的数据，必须绑定个人中心 `刷新频率`（`state.refreshMs`）进行定时刷新。
- 禁止单独写死业务 API 轮询间隔；新增 API 数据模块时默认复用全局刷新频率。
- 当前已绑定该约束的数据包括：基金估值/净值、行情指数、热门板块、7x24 快讯。

## 时间处理规范
- 所有业务时间、展示时间、交易日判断统一使用 **北京时间**（`Asia/Shanghai`）。
- 业务/展示逻辑禁止直接使用 `new Date()`、`toISOString()`、`toLocaleTimeString()` 处理日期语义。
- 时间能力统一从 `/src/lib/time.ts` 获取。
- 允许保留 `Date.now()` 的场景仅限：缓存过期、防缓存参数、回调名、动画 elapsed time、唯一 ID。

## API 与字段说明入口
- 当前 API/字段实现说明以 `/src/lib/README.md` 为准。
- `/API_AND_FIELDS_UPDATES.md` 仅保留历史变更归档，不再作为当前实现规范来源。

## UI 全局硬约束
- 默认移动端优先，主视口按约 `375px` 心智设计。
- 新页面或新模块优先复用既有语义类：`screen`、`search-shell`、`bottom-nav`、`is-up`、`is-down`。
- 数值信息（金额、净值、涨跌幅、比例）统一使用 `tabular-nums`。
- 页面与区块横向对齐必须统一，禁止同一页面出现明显错位的左右边距体系。
- 亮色金融风格是默认视觉基线；分层优先用浅边框与浅背景。
- 顶部栏/表头固定时必须设置明确背景色。
- 避免同一页面同时存在“整页滚动 + 局部滚动”两套滚动语义。
- 底部导航文案与路由语义必须一致。

## Typography 全局约束（新增）
- 全局字体族：`PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans SC, Source Han Sans SC, Inter, system-ui`。
- 默认正文基线字号：`14px`（与交易历史页基金名称字号一致）。
- 字号层级固定，禁止页面内随意新增“临时字号”：
  - `typo-page-title`：页面主标题（24/800）
  - `typo-value-hero`：主金额/主数值（26 级视觉）
  - `typo-value-emphasis`：强调数值（18 级视觉）
  - `typo-body-strong`：列表标题/卡片主文案（14/600）
  - `typo-section-title`：分区标题（10 + tracking）
  - `typo-label`：字段标签（10 + tracking）
  - `typo-meta`：时间/代码/辅助说明（10）
  - `typo-micro`：细小按钮文案（11）
- 金额、净值、涨跌幅等数字必须保留 `tabular-nums`。
- “持仓总览”“个人中心”作为字体规范基线页面，新增页面须遵循同一层级映射。

## 弹窗统一规范（全项目）
- 所有弹窗开启时，必须给 `body` 添加 `app-modal-open`；关闭或卸载时移除。
- `app-modal-open` 状态下必须同时禁止页面滚动并隐藏底部导航。
- 底部弹窗（iOS 风格）统一使用以下类名：
  - 遮罩：`app-modal-backdrop`
  - 容器：`app-modal-sheet`
  - 顶部拖拽条：`app-modal-sheet__grabber`
  - 头部：`app-modal-sheet__header`
  - 内容区：`app-modal-sheet__content`
- 内容区必须带 `safe-area` 底部留白，避免被手势区遮挡（已在全局样式中定义）。
- 内容过长时只允许滚动弹窗内容区，不允许背景页面跟随滚动。

## 模块文档边界
- 页面/组件的实现细节分别写入对应模块 README，避免根文档重复堆叠。
