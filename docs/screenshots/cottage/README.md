<!-- 文件用途：记录皮卡小屋真实浏览器截图、检查结果与未覆盖的设备验收。 -->

# 皮卡小屋验收

截图由 `e2e/cottage.spec.ts` 在隔离 local adapter 下生成，使用示例任务，未登录或修改生产账户。

- `desktop-light.png` / `desktop-dark.png`：桌面 Chrome 首页。
- `mobile-light.png` / `mobile-dark.png`：390px 手机 Chrome 首页。
- `planning-webkit-light.png` / `planning-webkit-dark.png`：iPhone WebKit 首页。
- `desktop-preview.png`：1440 × 900 桌面首屏。
- `appearance-light.png` / `appearance-dark.png`：主题选择器；这三张附加截图来自独立示例数据浏览器检查。

操作覆盖：主题选择、房间图片加载、猫咪按钮及房间命中区、摆件切换、完成和撤销任务、刷新持久化、收起／展开、跨标签页同步、深浅色 axe serious／critical、320px 宽与 200% 字号。

验证结果：

- Web 正式构建、边界检查、nonce CSP 检查通过；Electron 主进程编译与静态前端构建通过，房间资源随静态产物分发。
- 现有主题与新主题共 27 项浏览器回归通过；最终文字缩放与选择器缩略图调整后，新主题 6 项回归再次通过。
- 规划、项目、洞察、外观页面分别检查深浅色，8 次 axe 检查均无 serious／critical 问题。
- TypeScript、ESLint、格式与差异检查通过。全量单测首轮 252 项通过，1 项 Windows 打包进程清理测试受沙箱权限阻挡；在允许管理测试子进程的环境重跑该文件，13 项全部通过。

截图展示浏览器模拟结果，真实 iPhone 安装 PWA、Windows 任务栏图标与生产账号验收仍需在对应设备确认。本次没有发布线上或生成安装包。
