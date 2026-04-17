# components 模块说明

路径：`/src/components`

## 责任

- 复用 UI 组件与页面片段
- 图表、表格、详情与操作流组件
- 应用壳层、认证、导航与全局状态编排

## 关键文件

- `/src/components/app-provider.tsx`：状态上下文
- `/src/components/auth-provider.tsx`：Supabase 登录态管理
- `/src/components/app-shell.tsx`：主壳层容器
- `/src/components/bottom-nav.tsx`：底部导航
- `/src/components/fund-detail-view.tsx`：基金详情视图
- `/src/components/fund-manage-view.tsx`：持仓操作视图
- `/src/components/history-view.tsx`：交易历史主视图
- `/src/components/portfolio-table.tsx`：持仓表格
- `/src/components/service-worker-register.tsx`：SW 注册组件

## 约束

- 保持组件无副作用与可组合性
- 数值颜色使用 `is-up`/`is-down` 语义类
- 全局视觉与弹窗硬约束统一见 `/AGENT.md`
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

#### 6) 演示数据写入/清理
- `seedDemoData()`：写入完整演示持仓、交易、估值序列。
- 设置页提供“写入演示数据 / 删除演示数据”两个入口，交互样式保持一致。

## 壳层与交互

- `AppShell` 负责页面切换动画、登录态门禁、云同步状态提示和冲突弹窗
- `BottomNav` 除路由高亮外，还展示基于 `state.refreshMs` 的刷新周期进度
- 多个页面会通过 `app-modal-open` 统一锁定背景滚动，交互样式必须保持一致
