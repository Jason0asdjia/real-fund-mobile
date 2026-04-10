# Real Fund Mobile

移动端基金 PWA，基于 Next.js App Router 构建。项目目标不是把桌面站缩小，而是按手机使用习惯重做信息架构与交互路径。

## 项目简介

- `mobile-first`，主视口按约 375px 设计
- 核心导航：持仓总览 / 发现 / 行情中心 / 个人中心
- 支持 PWA（主屏启动、离线页、Service Worker）
- 保留基金场景核心能力：搜索、估值、净值回退、持仓收益计算、缓存策略

## 主要功能

- `Dashboard`：组合总览、收益指标、图表切换（曲线/分布/日历）
- `Portfolio`：持仓管理、收益计算、基金详情与买卖记录
- `Discover`：基金搜索、追踪、最近搜索
- `Market`：指数、板块、快讯等行情数据
- `Settings`：刷新频率、PWA 状态、本地数据管理

## 技术栈

- Next.js 14 + React 18 + TypeScript
- Tailwind CSS 3
- Framer Motion
- Day.js
- Lucide React
- localStorage（本地状态持久化）

## 快速开始

```bash
npm install
npm run dev
```

默认地址：`http://localhost:3000`

## 常用命令

```bash
npm run lint
npm run build
```

建议改动后至少执行一次 `npm run lint`。

## 目录导览

```text
src/
  app/          # 页面与路由（App Router）
  components/   # 视图与交互组件
  lib/          # API 封装、领域模型、时间与存储能力
public/         # PWA 与静态资源（manifest/sw/offline）
supabase/sql/   # Supabase 初始化 SQL
```

## 数据来源说明

项目延续 `real-time-fund` 的业务链路，但采用新的移动端 UI 与结构。当前主要复用的数据路径包括：

- 基金搜索（东方财富 JSONP）
- 实时估值（fundgz）
- 历史净值回退（F10DataApi）

## 文档分工

- `README.md`：给人看的项目说明（目标、功能、启动、目录）
- `AGENT.md`：给 AI/协作者看的约束与实现规范
- `src/app/README.md`：页面层口径与展示规则
- `src/components/README.md`：组件层状态流与交互约束
- `src/lib/README.md`：API、字段语义与回退策略
- `API_AND_FIELDS_UPDATES.md`：历史变更归档

## 已知限制

- 未接入交易所法定节假日 API，休市标注主要基于周末与数据缺失推断
- PWA 目前为基础缓存策略，不是完整离线优先架构
