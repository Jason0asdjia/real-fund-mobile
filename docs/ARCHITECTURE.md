# 架构

## 边界

- `src/app`：App Router 路由、全局布局、页面组合、页面级展示规则。
- `src/components`：复用 UI、应用壳层、Provider、导航、弹窗、视图组件。
- `src/lib`：基金 API、行情 API、持仓计算、存储、偏好、时间工具、云同步、业务类型。
- `public`：PWA 运行时资源和静态文件。
- `supabase/sql`：可选云同步所需的数据库初始化和迁移 SQL。

## 运行时架构

- 浏览器是主要运行时；应用必须作为 local-first 客户端应用工作。
- 本地状态先持久化，再考虑云同步。
- 云同步是登录用户的增强能力，不是首屏渲染的数据真源。
- 数据刷新集中在 `src/components/app-provider.tsx`，不应在各页面重复实现。
- 尽量使用框架的组件和方法，来实现页面的功能

## 存储约束

- 现有 `AppState` 结构和应用自有存储 key 是兼容面。
- 不要使用 `window.localStorage.clear()` 或宽泛的存储删除逻辑。
- 清理流程只能删除项目自有命名空间。
- UI 偏好不要随意混入核心业务状态，除非它们已经是文档化同步 payload 的一部分。
- 如果持久化数据结构变化，应增加迁移或规范化逻辑，不要假设用户是全新安装。

## 时间约束

- 业务时间归口到 `src/lib/time.ts`。
- 不要在业务决策或展示语义中直接使用裸 `new Date()`、`toISOString()` 或 `toLocaleTimeString()`。
- 北京自然日和交易时间逻辑应集中实现并复用。

## 刷新与 API 约束

- 刷新流程必须使用 `state.refreshMs` 或其派生调度。
- 不要在页面或组件内部硬编码隐藏轮询。
- 遵守 `src/lib/fund-api.ts` 中的数据源限流和超时行为。
- 除非明确修改数据语义，否则保持官方净值回退和官方锁行为。
- 保持估值回退行为，包括当前请求缺估值字段时保留上一条有效盘中估值。

## UI 约束

- 保持移动端优先布局和既有视觉语言。
- 优先使用现有语义类：`screen`、`bottom-nav`、`is-up`、`is-down`。
- 金融数值应使用 `tabular-nums`。
- 字体排版应复用语义类：`typo-page-title`、`typo-value-hero`、`typo-value-emphasis`、`typo-body-strong`、`typo-section-title`、`typo-label`、`typo-meta`、`typo-micro`。
- 每个页面保持一个主滚动区，除非弹窗或内容面板明确拥有自己的滚动。
- 固定页面头部、sticky 表头、sticky 首列和底部导航必须有明确背景。
- 底部导航文案必须匹配路由含义。

## 弹窗约束

- 打开弹窗时必须给 `body` 添加 `app-modal-open`。
- 关闭或卸载弹窗时必须移除 `app-modal-open`。
- `app-modal-open` 激活时，背景页面禁止滚动，底部导航隐藏。
- 底部弹窗应使用 `app-modal-backdrop`、`app-modal-sheet`、`app-modal-sheet__grabber`、`app-modal-sheet__header`、`app-modal-sheet__content`。
- 仅弹窗内容区域应滚动。

## PWA 约束

- 不要移除 `public/manifest.webmanifest`、`public/sw.js` 或 `public/offline.html`。
- 修改 `public/sw.js` 后需要验证缓存和离线兜底行为。
- 静态资源路径必须保持可由 Next.js 直接访问。

## 验证基线

- 代码变更后，在可行时运行 `npm run lint`。
- 涉及路由、PWA 或结构性变更时，在可行时运行 `npm run build`。
- 修改持仓相关逻辑时，验证汇总、行计算、列持久化和移动端表格滚动。
- 修改存储/同步逻辑时，验证本地启动、备份导入导出、手动同步和应用自有清理行为。
