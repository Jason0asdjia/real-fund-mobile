# Real Fund Mobile

一个基于 Next.js App Router 的移动端基金 Web App。项目延续 [real-time-fund](https://github.com/Jason0asdjia/real-time-fund) 的核心思路，但界面和信息架构完全按手机 App 重新组织，而不是把桌面网站压缩到小屏里。

## 当前版本目标

- 全程 `mobile-first`
- 使用 `App Router`
- 采用“仪表盘 / 发现 / 持仓 / 设置”四层 App 信息架构
- 使用 `Framer Motion` 做页面切换与卡片进入动画
- 支持 `PWA`
- 保留旧仓库里最有价值的内核逻辑：基金搜索、实时估值抓取、历史净值回退、本地持仓收益计算、估值分时缓存

## 已完成的初始化内容

- Next.js 14 项目骨架
- App Router 路由结构
- 本地状态层与持久化
- 基金数据请求封装
- 移动端底部导航和页面切换动画
- Dashboard / Discover / Portfolio / Settings 四个主页面
- PWA manifest、service worker、离线页
- 项目说明文档与 AI 协作说明

## 技术栈

- Next.js 14
- React 18
- TypeScript
- Framer Motion
- Day.js
- Lucide React
- localStorage

## 项目结构

```text
src/
  app/
    dashboard/
    discover/
    portfolio/
    settings/
  components/
    app-provider.tsx
    app-shell.tsx
    bottom-nav.tsx
    fund-card.tsx
    holding-editor.tsx
    sparkline.tsx
  lib/
    fund-api.ts
    portfolio.ts
    storage.ts
    time.ts
    types.ts
    valuation-timeseries.ts
public/
  sw.js
  offline.html
  project-map.svg
agent.md
```

## 功能说明

### Dashboard
- 查看已追踪基金
- 显示估值涨跌、净值、持仓收益
- 展示估值分时小趋势
- 手动刷新

### Discover
- 通过基金名称或代码搜索
- 一键加入追踪列表
- 记录最近搜索关键词

### Portfolio
- 维护持仓份额与成本价
- 自动计算持有金额、当日收益、累计收益

### Settings
- 调整自动刷新频率
- 查看 PWA 状态
- 清空本地数据
- 查看项目结构图

## 本地开发

```bash
npm install
npm run dev
```

默认地址：[http://localhost:3000](http://localhost:3000)

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
