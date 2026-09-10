<!-- 文件用途：记录皮卡小屋真实浏览器截图、检查结果与未覆盖的设备验收。 -->

# 皮卡小屋验收

截图由 `e2e/cottage.spec.ts` 在隔离 local adapter 下生成，使用示例任务，未登录或修改生产账户。

- `desktop-light.png` / `desktop-dark.png`：桌面 Chrome 首页。
- `mobile-light.png` / `mobile-dark.png`：390px 手机 Chrome 首页。
- `planning-webkit-light.png` / `planning-webkit-dark.png`：iPhone WebKit 首页。
- `desktop-preview.png` / `desktop-preview-dark.png`：1440 × 900 桌面首屏。
- `appearance-light.png` / `appearance-dark.png`：主题选择器；这四张附加截图来自独立示例数据浏览器检查。
- `*-wardrobe-light.png` / `*-wardrobe-dark.png`：三个浏览器项目的装扮窗口。
- `wardrobe-detail.png`：最终冰蓝裙装与三套个人搭配，桌面 2× 像素密度、仅截取装扮窗口。
- `规划-*`、`项目-*`、`洞察-*`、`节律-*`、`设置-*`：各业务页的桌面深浅色截图。

操作覆盖：蓝色与像素主题的首条任务坐标和宽度对比、完成和撤销、三套装扮、白猫回应、刷新持久化、跨标签页同步、原生模态框 Escape／焦点返回、320px 宽与 200% 字号，以及首页和各业务页深浅色 axe serious／critical。第三版新增人物素材加载、侧栏随页面换家具、换装及抓娃娃机动画有限次数、粒子不拦截点击、减少动态效果。首条任务顶部偏差不超过 6px、宽度偏差不超过 1px，首页没有房间插画。

验证结果：

- Web 正式构建、边界检查、nonce CSP 检查通过；Electron 静态前端构建通过，三张透明人物 WebP、`furniture.svg` 与 `pixels.svg` 已进入静态产物。本轮没有修改 Electron 主进程。
- 最终顺序运行 `pnpm test:e2e e2e/cottage.spec.ts e2e/appearance.spec.ts --project=desktop --project=mobile --project=planning-webkit`：33 项全部通过，耗时 3.9 分钟。
- 三个浏览器项目分别检查首页、装扮、规划、项目、洞察、节律、设置的深浅色，无 serious／critical 问题。另将页面底部按钮滚入视口，补查底部与外观选择器深浅色，4 次通过；人工查看首屏、手机、装扮和跨页截图。
- TypeScript、ESLint、格式与差异检查通过；主题偏好、Service Worker、CSS token 合计 16 项单测通过。
- 三张人物实测 256 × 355、四通道、alpha 范围 0–255；人工查看浅深背景下的头发边缘、衣服高光、透明空隙和像素清晰度。人物总大小约 218 KiB，家具 atlas 约 5 KiB。生成器返回的底色杂点已在最终导出时移除。
- 第二版曾修正日历数量对比度、勾选装饰拦截点击、Safari 焦点返回和 SVG 片段比例。第三版沿用这些检查；Web E2E 与 Electron 构建全程顺序运行，避免构建目录互相影响。

截图展示浏览器模拟结果，真实 iPhone 安装 PWA、Windows 任务栏图标与生产账号验收仍需在对应设备确认。本次没有发布线上或生成安装包。
