# AGENT Guide

本文件是 AI / 协作者的工作规范入口。面向人的项目说明见 `README.md`。

## 1) 文档边界

- `README.md`：项目介绍、功能、启动方式、目录导览（给人看）
- `AGENT.md`：协作约束、实现规则、文档索引（给 AI 与协作者看）
- `API_AND_FIELDS_UPDATES.md`：历史归档，不作为当前实现规范来源

## 2) 当前规范来源 (Single Source of Truth)

- 页面展示口径：`/src/app/README.md`
- 持仓列计算口径：`/src/app/portfolio-table-columns.md`
- 组件状态流与交互编排：`/src/components/README.md`
- API、字段语义、回退与限频：`/src/lib/README.md`
- PWA 静态资源说明：`/public/README.md`

## 3) 必须遵守的实现约束

- 移动端优先，主视口按约 `375px` 设计
- 不移除 PWA 关键文件：`/public/manifest.webmanifest`、`/public/sw.js`
- 不破坏本地存储键与数据结构
- 时间语义统一使用北京时间（`Asia/Shanghai`），能力统一走 `/src/lib/time.ts`
- 业务时间处理禁止直接用 `new Date()`、`toISOString()`、`toLocaleTimeString()`
- 所有 API 展示数据必须绑定全局刷新频率（`state.refreshMs`），禁止写死轮询间隔
- 代码改动前后执行 `npm run lint`

## 4) UI 全局约束

- 优先复用既有语义类：`screen`、`search-shell`、`bottom-nav`、`is-up`、`is-down`
- 数值信息统一 `tabular-nums`
- 页面与区块横向对齐一致，不允许混乱边距体系
- 默认亮色金融风格，分层以浅边框/浅背景为主
- 顶部栏或表头固定时必须有明确背景色
- 避免同页同时出现“整页滚动 + 局部滚动”双滚动语义
- 底部导航文案必须与路由语义一致

## 5) Typography 约束

- 字体族：`PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans SC, Source Han Sans SC, Inter, system-ui`
- 正文基线：`14px`
- 允许使用并复用以下字号语义类：
  - `typo-page-title`
  - `typo-value-hero`
  - `typo-value-emphasis`
  - `typo-body-strong`
  - `typo-section-title`
  - `typo-label`
  - `typo-meta`
  - `typo-micro`

## 6) 弹窗统一规范

- 弹窗开启时给 `body` 添加 `app-modal-open`，关闭或卸载时移除
- `app-modal-open` 生效时：禁止页面滚动并隐藏底部导航
- 底部弹窗统一类名：
  - `app-modal-backdrop`
  - `app-modal-sheet`
  - `app-modal-sheet__grabber`
  - `app-modal-sheet__header`
  - `app-modal-sheet__content`
- 内容过长时仅允许弹窗内容区滚动，背景页面不能跟随滚动

## 7) 关键实现路径

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

## 8) 协作检查清单

- 改动是否符合模块文档口径
- 是否破坏了刷新频率绑定
- 是否引入了不合规时间处理
- 是否破坏移动端布局与弹窗行为
- 是否执行了 `npm run lint`
