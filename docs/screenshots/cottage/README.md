<!-- 文件用途：记录皮卡小屋真实浏览器截图、检查结果与未覆盖的设备验收。 -->

# 皮卡小屋验收

截图由 `e2e/cottage.spec.ts` 在隔离 local adapter 下生成，使用示例任务，未登录或修改生产账户。

- `desktop-light.png` / `desktop-dark.png`：桌面 Chrome 首页。
- `mobile-light.png` / `mobile-dark.png`：390px 手机 Chrome 首页。
- `planning-webkit-light.png` / `planning-webkit-dark.png`：iPhone WebKit 首页。
- `desktop-preview.png` / `desktop-preview-dark.png`：1440 × 900 桌面首屏。
- `appearance-light.png` / `appearance-dark.png`：主题选择器；这四张附加截图来自独立示例数据浏览器检查。
- `*-wardrobe-light.png` / `*-wardrobe-dark.png`：三个浏览器项目的装扮窗口。
- `规划-*`、`项目-*`、`洞察-*`、`节律-*`、`设置-*`：各业务页的桌面深浅色截图。

操作覆盖：蓝色与像素主题的首条任务坐标和宽度对比、完成和撤销、三套装扮、白猫回应、刷新持久化、跨标签页同步、原生模态框 Escape／焦点返回、320px 宽与 200% 字号，以及首页和各业务页深浅色 axe serious／critical。首条任务顶部偏差不超过 6px、宽度偏差不超过 1px，首页没有房间插画。

验证结果：

- Web 正式构建、边界检查、nonce CSP 检查通过；Electron 静态前端构建通过，`pixels.svg` 已进入静态产物。本轮没有修改 Electron 主进程。
- 最终顺序运行 `pnpm test:e2e e2e/cottage.spec.ts e2e/appearance.spec.ts --project=desktop --project=mobile --project=planning-webkit`：30 项全部通过，耗时 2.6 分钟。
- 三个浏览器项目分别检查首页、装扮、规划、项目、洞察、节律、设置的深浅色，无 serious／critical 问题。另将页面底部按钮滚入视口，补查底部与外观选择器深浅色，4 次通过；人工查看首屏、手机、装扮和跨页截图。
- TypeScript、ESLint、格式与差异检查通过；主题偏好、Service Worker、CSS token 合计 16 项单测通过。
- 验证过程中修正了日历数量对比度、勾选装饰拦截点击、Safari 焦点返回、SVG 片段缩略图比例。测试同步等待首屏和明暗绘制完成。Web E2E 与 Electron 构建曾同时运行并出现缺失 chunk；停止并发构建后重新构建、顺序运行得到上述最终通过结果。

截图展示浏览器模拟结果，真实 iPhone 安装 PWA、Windows 任务栏图标与生产账号验收仍需在对应设备确认。本次没有发布线上或生成安装包。
