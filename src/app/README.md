# app 模块说明

路径：`/src/app`

## 责任
- App Router 路由与页面入口
- 全局布局与导航挂载
- 页面级组合（portfolio/discover/market/settings）

## 关键文件
- `/src/app/layout.tsx`：全局布局、元数据、PWA 注册入口
- `/src/app/globals.css`：Tailwind 层（base/components/utilities）
- `/src/app/page.tsx`：首页重定向（当前指向 `/portfolio`）
- `/src/app/portfolio/page.tsx`：持仓总览（主入口）
- `/src/app/discover/page.tsx`：基金搜索与添加
- `/src/app/market/page.tsx`：行情中心
- `/src/app/settings/page.tsx`：个人中心
- `/src/app/dashboard/page.tsx`：历史驾驶舱页面（代码保留，默认不作为主导航入口）

## 约束
- 页面默认按移动端优先布局
- 优先使用 Tailwind utility 与组件层类
- 页面字体、间距、标题层级等全局约束遵循 `/agent.md`
- 弹窗行为遵循 `/agent.md` 中的弹窗统一规范
