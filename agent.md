# Agent Guide

## 项目目标
- 移动端基金 PWA（iOS 主屏体验优先）
- Next.js App Router + Tailwind UI

## 模块地址索引
- `/src/app`
- `/src/components`
- `/src/lib`
- `/public`

## Markdown 文档全量索引
- `/README.md`
- `/agent.md`
- `/MODAL_GUIDELINES.md`
- `/UI_CONSTRAINTS.md`
- `/TODO.md`
- `/src/app/README.md`
- `/src/components/README.md`
- `/src/lib/README.md`
- `/public/README.md`

## 协作约束
- 优先保证移动端（约 375px）体验
- 不移除 PWA 文件（`/public/manifest.webmanifest`、`/public/sw.js`）
- 不破坏本地存储键与数据结构
- 改动前后执行：`npm run lint`
- UI 实现优先 Tailwind utility；仅在 Tailwind 难以表达时补少量组件层 CSS
- 能使用 Tailwind 组件时必须使用（含项目内复用组件）；仅在无可用 Tailwind 组件时再落回原生实现
- 页面视觉约束统一遵循 `/UI_CONSTRAINTS.md`

## 弹窗统一规范（全项目）
- 所有弹窗开启时，必须给 `body` 添加 `app-modal-open`；关闭或卸载时移除。
- `app-modal-open` 状态下需要：
  - 禁止页面滚动（`overflow-hidden`）
  - 隐藏底部导航（`.bottom-nav`）
- 底部弹窗（iOS 风格）统一使用以下类名：
  - 遮罩：`app-modal-backdrop`
  - 容器：`app-modal-sheet`
  - 顶部拖拽条：`app-modal-sheet__grabber`
  - 头部：`app-modal-sheet__header`
  - 内容区：`app-modal-sheet__content`
- 内容区必须带 `safe-area` 底部留白，避免被手势区遮挡（已在全局样式中定义）。
- UI 实现优先 Tailwind；仅当 Tailwind 无法覆盖需求时再补充少量原生 CSS。
- 详细说明见根目录 `MODAL_GUIDELINES.md`。
