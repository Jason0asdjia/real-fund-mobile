# Agent Guide

## 项目目标
- 移动端基金 PWA（iOS 主屏体验优先）
- Next.js App Router + Tailwind UI

## 文档职责
- `README.md`：面向开发者/使用者的项目概览、启动方式、功能摘要
- `agent.md`：面向 AI/协作者的约束、路径索引、文档入口、实现注意事项
- `API_AND_FIELDS_UPDATES.md`：历史归档；当前 API/字段说明已并入模块文档

## 模块与文档路径索引

### 根目录文档
- `/README.md`
- `/agent.md`
- `/API_AND_FIELDS_UPDATES.md`
- `/TODO.md`

### 模块文档
- `/src/app/README.md`：路由、页面入口、页面级组合
- `/src/components/README.md`：复用组件、壳层、导航、详情/操作流
- `/src/lib/README.md`：API、字段、时间、持仓计算、本地存储
- `/public/README.md`：PWA 资源与静态文件

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
