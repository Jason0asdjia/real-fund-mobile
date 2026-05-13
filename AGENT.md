# AGENT Guide

协作者入口文档。面向使用者的说明见 `README.md`。

## 文档入口

- `README.md`：项目介绍、启动方式、能力边界
- `src/app/README.md`：页面结构、导航、持仓页展示口径
- `src/components/README.md`：Provider、壳层、导航、弹窗和状态流
- `src/lib/README.md`：API、存储、时间、云端同步和字段语义
- `public/README.md`：PWA 静态资源约束

## 项目事实

- Next.js App Router + React 18 + TypeScript
- Tailwind CSS 4 + Ant Design + Framer Motion
- 移动端优先，主视口按约 `375px` 设计
- 主导航当前为：`/portfolio`、`/discover`、`/market`、`/history`、`/settings`
- 运行模式是 `local-first`：本地可用，生产环境可选接入 Supabase + GitHub 登录同步

## 实现硬约束

- 不移除 PWA 关键文件：`public/manifest.webmanifest`、`public/sw.js`、`public/offline.html`
- 不随意变更 localStorage/sessionStorage key；现有偏好键和 `AppState` 结构视为兼容面
- 尽量使用nextjs的组件，来实现pwa的各种操作逻辑，不要手写。
- 业务时间统一走 `src/lib/time.ts`
- 业务逻辑不要直接依赖裸 `new Date()`、`toISOString()`、`toLocaleTimeString()`
- 页面数据刷新必须绑定 `state.refreshMs` 或其派生流程，禁止写死轮询周期
- 涉及云同步时，保持 `local-first`：先读本地，再异步对齐云端
- 改动完成后至少执行 `npm run lint`

## UI 约束

- 优先复用已有语义类：`screen`、`bottom-nav`、`is-up`、`is-down`
- 数值统一使用 `tabular-nums`
- 保持移动端单主滚动区语义，避免页面和局部容器无序双滚动
- 固定头部、表头、底部导航必须有明确背景色
- 底部导航文案必须与实际路由一致

## Typography

- 基线正文：`14px`
- 优先复用语义类：`typo-page-title`、`typo-value-hero`、`typo-value-emphasis`、`typo-body-strong`、`typo-section-title`、`typo-label`、`typo-meta`、`typo-micro`

## 弹窗规范

- 弹窗开启时给 `body` 添加 `app-modal-open`，关闭或卸载时移除
- `app-modal-open` 生效时，背景页面禁止滚动，底部导航隐藏
- 底部弹窗统一类名：`app-modal-backdrop`、`app-modal-sheet`、`app-modal-sheet__grabber`、`app-modal-sheet__header`、`app-modal-sheet__content`
- 仅允许弹窗内容区自身滚动

## 关键代码路径

- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/components/app-provider.tsx`
- `src/components/app-shell.tsx`
- `src/components/auth-provider.tsx`
- `src/components/bottom-nav.tsx`
- `src/lib/fund-api.ts`
- `src/lib/market-api.ts`
- `src/lib/cloud-user-data.ts`
- `src/lib/user-preferences.ts`
- `src/lib/storage.ts`
- `src/lib/time.ts`

## 检查清单

- 文档口径是否仍与代码一致
- 是否破坏刷新调度、缓存或回退链路
- 是否引入了不合规时间处理
- 是否破坏移动端布局、弹窗和导航行为
- 是否误伤本地存储或云同步兼容性
- 是否执行了 `npm run lint`
