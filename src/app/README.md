# app 模块说明

路径：`/src/app`

## 责任
- App Router 路由与页面入口
- 全局布局与导航挂载
- 页面级组合（dashboard/discover/portfolio/settings）

## 关键文件
- `/src/app/layout.tsx`：全局布局、元数据、PWA 注册入口
- `/src/app/globals.css`：Tailwind 层（base/components/utilities）
- `/src/app/dashboard/page.tsx`：账户驾驶舱
- `/src/app/discover/page.tsx`：基金搜索与添加
- `/src/app/portfolio/page.tsx`：持仓聚合
- `/src/app/settings/page.tsx`：应用设置与状态

## 约束
- 页面默认按移动端优先布局
- 优先使用 Tailwind utility 与组件层类
