# Modal Guidelines

项目统一弹窗规范（移动端优先，iOS App 体验对齐）。

## 目标
- 弹窗不被底部导航与手势安全区遮挡。
- 弹窗交互一致（打开、关闭、滚动、层级）。
- 样式优先 Tailwind，避免每个页面重复造轮子。

## 全局规则
- 打开任意弹窗时：给 `document.body` 添加 `app-modal-open`。
- 关闭弹窗或页面卸载时：移除 `app-modal-open`。
- `app-modal-open` 的效果（定义于 `src/app/globals.css`）：
  - 页面禁止滚动。
  - 底部导航 `.bottom-nav` 自动隐藏。

## 底部 Sheet（推荐）
统一类名：
- `app-modal-backdrop`：遮罩层，负责点击空白关闭。
- `app-modal-sheet`：底部弹层主容器。
- `app-modal-sheet__grabber`：顶部拖拽条视觉元素。
- `app-modal-sheet__header`：标题区 + 关闭按钮区。
- `app-modal-sheet__content`：可滚动内容区。

行为要求：
- `app-modal-sheet` 使用 `max-height`，避免全屏硬顶。
- `app-modal-sheet__content` 必须滚动，并包含 `safe-area` 底部留白（已内置）。
- 内容过长时只滚动内容区，不滚动背景页面。

## 推荐代码骨架
```tsx
useEffect(() => {
  document.body.classList.toggle("app-modal-open", open);
  return () => document.body.classList.remove("app-modal-open");
}, [open]);

return open ? (
  <div className="app-modal-backdrop" onClick={close}>
    <div className="app-modal-sheet" onClick={(e) => e.stopPropagation()}>
      <div className="app-modal-sheet__grabber" />
      <div className="app-modal-sheet__header">...</div>
      <div className="app-modal-sheet__content">...</div>
    </div>
  </div>
) : null;
```

## 执行约束
- 新增弹窗时必须复用本规范，不允许定义新的独立弹窗体系。
- 如需特殊视觉（例如全屏详情页），也必须遵守 `app-modal-open` 的页面锁定与底部导航隐藏规则。
