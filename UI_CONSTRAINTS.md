# UI Constraints

项目级通用 UI 约束（适用于所有页面与组件）。目标是让视觉语言稳定、可复用、可维护。

## 1) 实现原则
- 默认使用 Tailwind utility 实现 UI。
- 能复用 Tailwind 组件时必须复用（包括项目内组件），不直接写原生控件样式分支。
- 只有 Tailwind 难以表达时，才在 `src/app/globals.css` 中新增少量组件层样式。
- 新页面优先复用已有语义类（如 `screen`、`search-shell`、`bottom-nav`、`is-up`、`is-down`）。

## 2) 字体与字号
- 字体体系跟随全局：`Manrope + PingFang SC`（由设计系统与页面实现共同保证）。
- 标题层级（移动端）建议：
  - 页面主标题：`text-2xl font-extrabold tracking-tight`
  - 区块标题：`text-[10px]` 或 `text-xs` + `font-bold` + `tracking-[0.12em~0.16em]`
  - 正文/列表主文本：`text-sm font-semibold` 或 `font-bold`
  - 辅助信息：`text-[10px]` / `text-xs` + `text-[#747781]`（或语义灰）
- 数值文本（金额、净值、比例）优先使用 `tabular-nums`。

## 3) 间距与 Padding
- 页面主容器（`app-main`）使用项目默认：`px-3 md:px-4`。
- 页面内部一级区块左右内边距建议与主容器对齐（优先 `px-3` 或 `px-4`，避免混用导致视觉错位）。
- 列表行内边距推荐：
  - 紧凑行：`px-3 py-3`
  - 常规行：`px-4 py-3.5`
- 卡片内边距推荐：
  - 紧凑卡：`p-3` 或 `p-4`
  - 信息卡：`p-4` 或 `p-5`
- 交互控件（chip/button）建议最小高度 `min-h-8` 或 `min-h-9`。

## 4) 颜色与表面
- 亮色模式优先，和“持仓总览”保持一致的浅底金融风格。
- 页面底色优先 `bg-white` 或设计系统 `surface` 近似色，避免局部突变。
- 分隔优先通过浅色边框和层次背景（如 `#f2f3ff`、`#e2e7ff`），不使用重阴影堆叠。

## 5) 滚动与布局
- 若页面要求“仅局部滚动”，必须明确：
  - 外层容器 `overflow-hidden`
  - 内层容器 `overflow-auto`
- 顶部栏/表头需要固定时，使用 `sticky top-0`，并设置明确背景色避免穿透。
- 避免在同一页面中同时出现“整页滚动条 + 局部滚动条”。

## 6) 导航与命名
- 底部导航文案使用业务语义命名（如“持仓总览”“发现”“行情中心”“个人中心”）。
- 路由命名与导航文案保持一致，避免“设置页但文案是个人中心”这类偏差。

## 7) 文档同步要求
- 新增或大改页面时，若影响全局视觉规范，需同步更新：
  - `/UI_CONSTRAINTS.md`
  - `/src/app/README.md`（如新增路由或页面职责变化）
  - `/agent.md`（如新增文档路径或新增全局规则）
