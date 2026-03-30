# real-fund-mobile

一个面向手机端的基金估值单页应用，基于 `real-fund` 项目的核心逻辑重构。

## 目标
- 只做手机端
- 只保留一个核心页面
- 聚焦基金估值、持仓收益、简单交互
- 降低原项目的复杂度，提升维护性

## 计划保留
- 基金估值获取逻辑
- 持仓收益计算
- 本地存储能力

## 暂不保留
- PC 端布局
- 双端适配
- OCR 导入
- 云同步
- 复杂弹窗和表格系统

## Tech Stack
- Next.js
- React
- JavaScript
- localStorage

## 开发
```bash
npm install
npm run dev
