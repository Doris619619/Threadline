<!-- 文件用途：记录皮卡经典实际浏览器截图、功能检查和设备验收边界。 -->

# 皮卡经典验收

图片由隔离示例数据生成，不读取或修改生产账户。

- `*-home.png`：桌面 Chrome、手机 Chrome、iPhone WebKit 的任务首页。
- `*-wardrobe.png`：390px 装扮窗口，确认金边、关闭按钮与人物比例。
- `首页-*`、`规划-*`、`项目-*`、`洞察-*`、`节律-*`、`设置-*`：各页浅深色截图。
- `desktop-preview-*`、`appearance-*`：1440px 首页与四主题选择器，已经移除主页面的顶部横梁和两侧长金边。
- `*-editor-*`：真实任务编辑窗口浅深色，检查保存／关闭按钮、表单背景及遮挡。

2026-09-10 本地执行：

- `pnpm test:e2e e2e/classic.spec.ts --project=desktop --project=mobile --project=planning-webkit`：12 项通过，覆盖主题切换／刷新、四主题选择器、原小屋样式不变、任务首屏和宽度、正文至少 16px、完成／撤销、六页浅深色 axe、装扮／编辑窗口与 320px／200% 字号。
- 最后修正弹窗与手机任务菜单的层级后，`--grep 'classic task windows'` 在上述三个浏览器项目复验，3 项通过，真实命中点确认表单控件未被遮挡。
- 此前完整外观回归 `e2e/classic.spec.ts e2e/cottage.spec.ts e2e/appearance.spec.ts`：42 项通过。后续经典主题调整使用上述专项复验，未重复统计为新的独立用例。
- 主题偏好、Service Worker、CSS token：18 项单测通过。ESLint 与 TypeScript 检查通过。
- Web 正式构建、边界与 nonce CSP 检查通过；Electron Main／Preload 编译和静态前端构建通过。两条构建流水线顺序执行。
- 额外隔离浏览器检查首页底部收尾按钮及外观选择器，浅深色 axe 无 serious／critical。人工查看各业务页和窗口截图，配色分工与计算结果见 [视觉审查](../../pika-classic-review.md)。

浏览器里的示例内容不等于用户真实账户；本轮不产生业务数据或云端写入。

本轮不包含线上部署、新安装包或真实设备生产账号验收。
