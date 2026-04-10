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

## Supabase 使用与设置（简要）

本项目的云端用户数据与 GitHub 登录基于 Supabase，可选开启；未配置时应用仍可本地使用。

1. 在 Supabase 创建项目。
2. 到 `Project Settings -> API` 获取：
   - `Project URL`
   - `anon public key`
3. 在本地 `.env.local` 添加：

```env
NEXT_PUBLIC_SUPABASE_URL=你的项目URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=你的anon公钥
```

4. 执行初始化 SQL：`supabase/sql/001_init_user_app_data.sql`。
5. 如果你的表已经创建过，再执行增量迁移：`supabase/sql/002_add_sync_meta_columns.sql`。
6. 在 Supabase Auth 开启 GitHub Provider，并配置回调域名：
   - 本地：`http://localhost:3000`
   - 线上（如 Vercel）：`https://你的域名`

说明：
- 仅 `NEXT_PUBLIC_*` 变量会注入前端，切勿放置私密服务端密钥。
- 部署到 Vercel 时，请在 Vercel 项目 `Environment Variables` 中同步配置上述变量。

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

## 参考来源

- 原项目参考：`https://github.com/hzm0321/real-time-fund`

## 免责声明

- 本项目仅用于技术学习、功能演示与个人研究，不构成任何投资建议。
- 页面展示的基金净值、估值、涨跌幅等数据来自第三方公开接口，存在延迟、缺失或误差风险，请以基金公司与官方渠道披露信息为准。
- 因使用本项目信息进行交易产生的任何收益或损失，项目维护者不承担责任。
- 使用者应自行评估数据与策略风险，并遵守所在地区的法律法规与平台条款。

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
