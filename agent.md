# AI Agent Guide

这个文件给后续接手的 AI 用，目的是减少无效重构和低质量修补。

## 项目定位

- 项目是一个移动端基金 Web App，不是传统营销网站
- 路由结构基于 Next.js App Router
- 所有页面都必须优先考虑 375px 左右的小屏幕
- 核心数据逻辑参考 `real-time-fund`，但 UI 不应该回退成桌面表格式布局

## 先看这些文件

1. `src/lib/fund-api.ts`
2. `src/lib/portfolio.ts`
3. `src/lib/valuation-timeseries.ts`
4. `src/components/app-provider.tsx`
5. `src/app/globals.css`
6. `src/app/dashboard/page.tsx`
7. `src/components/fund-detail-view.tsx`
8. `src/components/fund-manage-view.tsx`

## 调试顺序

1. 先确认 `npm run lint`
2. 再跑 `npm run dev`
3. 检查小屏宽度下是否出现横向滚动
4. 检查基金搜索、加入、刷新、持仓计算是否仍然闭环
5. 检查页面切换动画是否影响触控体验
6. 检查持仓详情 → 持仓操作页路由跳转是否正确
7. 检查 Dashboard 图表视图切换（曲线/分布/日历）是否无布局抖动

## 修改原则

- 不要把页面改回“桌面网站压缩版”
- 不要移除 PWA 相关文件
- 不要把核心基金请求改成依赖私有后端，除非明确新增服务端设计
- 保持本地存储键稳定，避免破坏已有数据
- 动效只能服务层级和反馈，不能为了炫技拖慢操作

## 已知边界

- 当前未接入交易所法定节假日 API；日历休市标记基于周末 + 无交易数据推断
- PWA 目前是基础缓存策略，不是完整离线优先
- 图形资源暂时使用代码原生 SVG

## 当前页面结构约定

- Dashboard 固定四段：页头、概览总卡、统一图表卡、最佳持仓摘要卡
- 图表信息应优先在一个容器内部切换，不要继续纵向堆叠多个同类大卡
- Portfolio 详情与操作分离：
  - 详情页：`/portfolio/[code]`
  - 操作页：`/portfolio/[code]/manage`

## 如果你要继续完善

- 优先补基金详情页和重仓股视图
- 再补多分组、自选、定投、导入导出
- 如果要加云同步，尽量隔离为新模块，不要污染现有本地状态层
