# AGENTS.md

AI coding harness 入口。修改代码前先阅读本文件，再按顺序打开下列文档。

## 阅读顺序

1. `docs/SPEC.md` - 产品范围、功能规格、数据行为、已知限制
2. `docs/ARCHITECTURE.md` - 架构边界与硬性约束
3. `docs/DECISIONS.md` - 已接受的技术决策与后续重构方向
4. 仅在触及对应区域时阅读附近模块 README：
   - `src/app/README.md`
   - `src/components/README.md`
   - `src/lib/README.md`
   - `public/README.md`

## 项目事实

- Next.js App Router + React 18 + TypeScript。
- Tailwind CSS 4 + Ant Design + Framer Motion。
- 移动端优先 PWA，主视口按约 `375px` 设计。
- 主路由：`/portfolio`、`/discover`、`/market`、`/history`、`/settings`。
- 运行模型：`local-first`；Supabase + GitHub 登录是可选的生产同步能力。

## AI 工作流

- 编辑前先从文档和代码建立上下文。
- 优先做最小正确变更，不重写无关区域。
- 产品行为必须与 `docs/SPEC.md` 保持一致，硬性约束必须与 `docs/ARCHITECTURE.md` 保持一致。
- 修改架构、存储语义、同步行为、路由或主要 UI 模式时，如果该决策需要长期保留，必须更新 `docs/DECISIONS.md`。
- 生成或重构 Markdown 文档时必须使用中文；除专有名词、代码标识符、命令、路径、API 字段外，不要新增英文正文。
- 除非任务明确要求迁移，否则不要删除或重命名存储 key、PWA 文件、路由或同步字段。
- 代码变更后，在可行时至少执行 `npm run lint`。

## 硬约束速览

- 不要移除 `public/manifest.webmanifest`、`public/sw.js` 或 `public/offline.html`。
- 不要随意修改 `localStorage` 或 `sessionStorage` key；持久化状态是兼容面。
- 业务时间必须走 `src/lib/time.ts`。
- 避免在业务逻辑中直接使用裸 `new Date()`、`toISOString()`、`toLocaleTimeString()`。
- 数据刷新必须绑定 `state.refreshMs` 或其派生流程；不要硬编码轮询周期。
- 云同步必须保持 local-first：先读本地数据，再异步对齐云端数据。
- 移动端布局保持一个主滚动区，除非弹窗或内容区域明确拥有自己的滚动。
- 固定头部、sticky 表头、sticky 首列和底部导航必须有明确背景。

## 弹窗规范

- 弹窗开启时给 `body` 添加 `app-modal-open`，关闭或卸载时移除。
- `app-modal-open` 生效时，背景页面禁止滚动，底部导航隐藏。
- 底部弹窗统一类名：`app-modal-backdrop`、`app-modal-sheet`、`app-modal-sheet__grabber`、`app-modal-sheet__header`、`app-modal-sheet__content`。
- 仅允许弹窗内容区自身滚动。
- 弹窗内按钮必须使用以下语义类，禁止裸写样式：
  - `app-modal-btn-primary`：深色主操作（`bg-[#00193c] text-white`）
  - `app-modal-btn-secondary`：白色边框次要操作/取消（`border-[#d5dbea] bg-white text-[#131b2e]`）
  - `app-modal-btn-danger`：红色危险操作（`bg-[#ba1a1a] text-white`，用于删除、清空等不可逆操作）

## 关键路径

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

- 是否保持已文档化的产品行为？
- 是否保持刷新调度、缓存和回退链路完整？
- 是否避免了不合规的业务时间处理？
- 是否保持移动端滚动、弹窗锁定、sticky 表头和导航行为？
- 是否避免破坏本地持久化状态或云同步兼容性？
- 相关持久规则或决策是否已更新到对应文档？
