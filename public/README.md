# public 模块说明

路径：`/public`

## 责任

- PWA 运行时资源
- 静态图标与离线页
- 项目参考图

## 关键文件

- `manifest.webmanifest`：PWA 元信息（应用名、图标、启动参数、主题色）
- `sw.js`：Service Worker，负责离线缓存策略与请求拦截
- `offline.html`：离线兜底页面，无网络时展示
- `icon.svg`：主应用图标（矢量）
- `icon_bk.svg`：备用/历史图标文件
- `project-map.svg`：项目结构图（仅文档参考）

## 约束

- 修改 `sw.js` 时需同步验证缓存策略
- `manifest.webmanifest`、`sw.js`、`offline.html` 视为 PWA 关键文件，不应随意删除
- 静态资源路径须保持可被 Next.js 直接访问（`/public` 下的文件映射到站点根路径）
- PWA 图标和清单变更后需在真机上验证安装与启动体验
