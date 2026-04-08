# TODO
- 申购赎回的确认日问题。api中是否有关基金申购赎回规则字段，可以用来判断当日15点前买入和之后买入，在哪一日可以确认份额（qdii，港股等比较特殊需要确认，api中是否有相关信息）
- 行情中心的基金领涨排行，从api中取得（判断是否能取得），同时涨跌幅开盘的时候使用估算，当每日基金的涨跌幅正式结果出来之后替换为每日正式的涨跌幅排行。
- 导航栏点击切换页面的时候，进入别的画面的动画是先进入然后重新在进入一下，这个动画有问题，查找原因修复一下。
- 现在项目显示的时候，都有默认数据，导致页面刚进入会先显示默认数据之后（比如7x24小时快讯），加载完之后被替换。删除默认数据，添加加载动画，直接展示最新数据。
- 日历选择器替换为https://ant.design/components/date-picker-cn?from=thosefree.com#date-picker-demo-size
- 持有天数的记录，当持仓不为0的时候开始计算。也就是当加仓或者修改持仓设置了持仓金额的时候，自动将该基金的持有初始日设置为，加仓和编辑持仓设置的日期（如果没设置默认当前项目时间）
## 任务：修复持仓表格列配置刷新后被重置，并建立统一的前端“记忆功能”方案

### 背景
- 当前持仓页支持用户选择表格列显隐。
- 现象：用户调整列显示后，刷新页面会被重置，已选择的列配置没有被正确保留。
- 项目是纯前端应用，计划部署在 GitHub Pages。
- 用户验证计划使用 Supabase，但前端 UI 偏好不应依赖服务端才可生效。

### 当前代码位置
- 列配置读取与写入逻辑：`src/app/portfolio/page.tsx`
- 全局业务状态持久化：`src/lib/storage.ts`
- 全局状态 Provider：`src/components/app-provider.tsx`

### 已确认的问题根因
- `src/app/portfolio/page.tsx` 中，`columnVisibility` 初始值是默认配置。
- 组件挂载后会先通过 `useEffect` 读取 `localStorage` 中已有的列配置。
- 但另一个 `useEffect` 也会在初次挂载时立刻把当前 `columnVisibility` 写回 `localStorage`。
- 因为初始 state 还是默认值，所以旧配置可能在读取完成前就被默认值覆盖，导致刷新后看起来像“记忆失效”。

### 目标
- 修复列配置刷新后被重置的问题。
- 不只修这一页，要抽象出项目内可复用的“偏好设置持久化”机制，供后续主题、排序、布局、筛选、折叠状态等功能复用。
- 方案应适配 GitHub Pages 静态部署。
- 方案应兼容未来接入 Supabase 后的登录态和跨设备偏好同步。

### 推荐方案

#### 1. 建立统一的 preferences 层
- 新增一个独立的前端偏好存储模块，例如 `src/lib/preferences.ts`。
- 该模块专门管理 UI 偏好，不与业务数据 `AppState` 混存。
- 偏好数据建议使用统一命名空间，例如：
  - `real-fund-mobile:preferences`
  - 或按子项拆分：
    - `real-fund-mobile:preferences:portfolio-columns`
    - `real-fund-mobile:preferences:dashboard-layout`
    - `real-fund-mobile:preferences:theme`

#### 2. 区分三类状态
- 长期 UI 偏好：使用 `localStorage`
  - 例如列显隐、排序方式、主题、布局模式。
- 会话级视图状态：使用 `sessionStorage`
  - 例如当前页面滚动位置、表格滚动偏移、临时展开态。
- 跨设备同步偏好：登录后同步到 Supabase
  - 首屏仍优先读取本地，保证快。
  - 登录后再从 Supabase 拉取并比对更新时间，进行覆盖或合并。

#### 3. 修复本次列配置问题的实现要点
- 为列配置增加“已完成初始化读取”的标记，例如 `preferencesHydrated`。
- 在完成本地读取前，不允许把默认值写回 `localStorage`。
- 首次写入应发生在：
  - 本地旧值读取完成之后，且
  - 用户实际修改了列配置之后。
- 推荐封装成通用 Hook，例如：
  - `usePersistentPreference<T>()`
  - 支持默认值、版本号、序列化、反序列化和迁移。

#### 4. 未来接入 Supabase 时的策略
- 使用 “local-first, async-cloud-sync”：
  - 首屏读取本地偏好并立即渲染。
  - 用户登录后异步拉取云端偏好。
  - 若云端较新，则覆盖本地并刷新状态。
  - 用户修改偏好时，先立即更新本地和 UI，再异步写入云端。
- Supabase 只负责账号体系和跨设备偏好同步，不替代本地 UI 状态存储。

#### 5. 清理策略
- 不要使用 `window.localStorage.clear()` 清空所有本地数据。
- 只删除项目自身命名空间下的 key。
- 原因：未来 Supabase Auth 也可能使用同域存储，会被误删。

### 建议的数据结构
- 偏好对象应带版本号，便于后续迁移：

```ts
type AppPreferences = {
  version: 1;
  portfolio?: {
    columnVisibility?: Record<string, boolean>;
  };
  dashboard?: {
    layoutMode?: string;
  };
  appearance?: {
    theme?: "light" | "dark" | "system";
  };
};
```

### 验收标准
- 用户修改持仓页列显隐后，刷新页面配置仍然保留。
- 首次加载时，不会出现默认配置覆盖已存配置的问题。
- 新增的偏好持久化方案可以被其他页面直接复用。
- 清空业务数据时，不会误删未来的 Supabase 登录态或无关键值。
- 纯前端静态部署下可正常运行，不依赖服务端渲染。

### 可选后续任务
- 把持仓页列配置从页面内联逻辑迁移到通用 `preferences` 模块。
- 为 Dashboard/Discover/Settings 补充统一偏好能力。
- 给偏好层增加版本迁移与容错校验。
- 登录后增加 Supabase 偏好同步表，例如 `user_preferences`。
