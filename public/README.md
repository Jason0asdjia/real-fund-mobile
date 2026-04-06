# public 模块说明

路径：`/public`

## 责任
- PWA 运行时资源
- 静态图标与离线页

## 关键文件
- `/public/manifest.webmanifest`：PWA 元信息
- `/public/sw.js`：Service Worker
- `/public/offline.html`：离线兜底页
- `/public/icon.svg`：应用图标
- `/public/project-map.svg`：项目结构图

## 约束
- 修改 `sw.js` 时需同步验证缓存策略
- 静态资源路径须保持可被 Next 直接访问
