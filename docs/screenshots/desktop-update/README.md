<!-- 文件用途：记录轻量桌面更新入口的浏览器截图、交互验证和真实升级验收边界。 -->

# 轻量更新入口

完整工作台右上角仅保留标题栏小型更新入口，默认不展开；工作站使用同一入口。截图由实际页面与隔离更新 bridge 生成，版本 0.1.4 为测试数据。

- [浅色工作台](update-light.png)
- [深色工作台](update-dark.png)
- [点击后显示详情](update-details.png)
- [窄工作站](update-compact.png)

验证命令：

```sh
node node_modules/vitest/vitest.mjs run --maxWorkers=4
pnpm test:e2e --project=desktop e2e/desktop-update.spec.ts
pnpm typecheck
pnpm lint
pnpm desktop:compile
```

本地全量 258 项测试通过；端到端用例验证入口尺寸、无额外行高、导航保留、默认不弹出、下载进度、下载完成不展开、Escape 与外部点击关闭、深浅主题无障碍、窄窗浮层边界和重启取消。类型检查、lint、Electron 编译通过。

这些检查不替代两个真实安装版本之间的升级验收，也不代表此功能已发布到公开更新源。
