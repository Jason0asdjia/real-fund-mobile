# Real Fund Mobile

一个基于 Next.js App Router 的移动端基金 Web App。项目延续 [real-time-fund](https://github.com/Jason0asdjia/real-time-fund) 的核心思路，但界面和信息架构完全按手机 App 重新组织，而不是把桌面网站压缩到小屏里。

## 当前版本目标

- 全程 `mobile-first`
- 使用 `App Router`
- 采用“持仓总览 / 发现 / 行情中心 / 个人中心”四层 App 信息架构
- 支持 `PWA`
- 保留基金搜索、实时估值、历史净值回退、本地持仓收益计算、估值分时缓存等核心能力

## 已完成的核心能力

- Next.js 14 项目骨架与 App Router 路由结构
- 本地状态层与持久化
- 基金数据请求封装
- 移动端底部导航与页面切换动画
- Portfolio / Discover / Market / Settings 四个主页面
- PWA manifest、service worker、离线页

## 最近重点更新

- Dashboard 重构为紧凑「金融驾驶舱」：页头、概览总卡、统一图表卡、最佳持仓摘要
- 图表区统一容器切换：`曲线 / 分布 / 日历`
- 分布视图改为近 7 日连续收益图（0 轴中线）
- 日历视图改为当月收益日历（按日展示日期与盈亏率）
- 持仓详情页支持独立「持仓操作页」：编辑持仓 + 买入卖出记录 + 流水
- 行情中心接入指数、基金板块、7x24 快讯与刷新频率联动
- 全项目业务时间统一为北京时间处理

## 技术栈

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS 3（UI utility + components layer）
- Framer Motion
- Day.js
- Lucide React
- localStorage

## 项目结构

```text
src/
  app/
    README.md
    dashboard/
    discover/
    portfolio/
    settings/
  components/
    README.md
    app-provider.tsx
    app-shell.tsx
    bottom-nav.tsx
    fund-card.tsx
    holding-editor.tsx
    sparkline.tsx
  lib/
    README.md
    fund-api.ts
    portfolio.ts
    storage.ts
    time.ts
    types.ts
    valuation-timeseries.ts
public/
  README.md
  sw.js
  offline.html
  project-map.svg
agent.md
```

## 功能说明

### Dashboard
- 紧凑驾驶舱首页（首屏高密度摘要）
- 概览总卡：总市值、本金、回报率、当日/累计/回撤、手续费与更新时间
- 统一图表卡：曲线、7日收益分布、当月收益日历三视图切换
- 最佳持仓摘要卡：主信息 + 三列统计
- 手动刷新

### Discover
- 通过基金名称或代码搜索
- 一键加入追踪列表
- 记录最近搜索关键词

### Portfolio
- 维护持仓份额与成本价
- 自动计算持有金额、当日收益、累计收益
- 基金详情全屏页面化展示，保留持仓列表状态
- 持仓操作页独立路由：`/portfolio/[code]/manage`

### Settings
- 调整自动刷新频率
- 查看 PWA 状态
- 清空本地数据
- 查看项目结构图

### Market（行情中心）
- 行情指数概览
- 热门板块
- 基金领涨排行
- 7x24 快讯

## 本地开发

```bash
npm install
npm run dev
```

默认地址：[http://localhost:3000](http://localhost:3000)

## 常用命令

```bash
npm run lint
npm run build
```

建议每次改动后先 `lint` 再 `build`，确保类型与打包均通过。

## 与旧仓库的关系

本项目没有照搬旧仓库的页面实现，而是只复用了核心业务路径：

- `fundsuggest.eastmoney.com` 搜索 JSONP
- `fundgz.1234567.com.cn` 实时估值 JSONP
- `F10DataApi.aspx` 历史净值回退
- 估值分时缓存逻辑
- 持仓收益计算思路

## 说明

- 当前图标与结构图是代码原生生成资源，没有调用在线生图接口
- 如果后续需要补品牌插画、启动页图标或分享图，可在配置 `OPENAI_API_KEY` 后继续接入图像生成流程
- 模块实现说明、AI 协作约束、路径索引与 API/字段说明已收口到 `agent.md` 及各模块 README

## 已知限制

- 当前并未接入交易所法定节假日 API，日历的休市标注目前以周末与无交易数据推断
- PWA 仍是基础缓存策略，非完整离线优先模型
