# components 模块说明

路径：`/src/components`

## 责任
- 复用 UI 组件与页面片段
- 图表、表格、详情与操作流组件
- 应用壳层与导航

## 关键文件
- `/src/components/app-provider.tsx`：状态上下文
- `/src/components/app-shell.tsx`：主壳层容器
- `/src/components/bottom-nav.tsx`：底部导航
- `/src/components/fund-detail-view.tsx`：基金详情视图
- `/src/components/fund-manage-view.tsx`：持仓操作视图
- `/src/components/portfolio-table.tsx`：持仓表格
- `/src/components/service-worker-register.tsx`：SW 注册组件

## 约束
- 保持组件无副作用与可组合性
- 数值颜色使用 `is-up`/`is-down` 语义类
- 与页面共享统一视觉约束：见 `/UI_CONSTRAINTS.md`
- 导航组件文案需与路由语义一致（当前：持仓总览/发现/行情中心/个人中心）
