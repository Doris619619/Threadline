<!-- 文件用途：记录经典主题输入框焦点底线的合成截图来源、实际计算样式与验证边界。 -->

# 经典输入焦点对照

截图使用本机安装包中的全量生产 CSS，在隔离的 Edge Chromium 中渲染与智能导入相同的 `manager-dialog smart-import-dialog is-input` 容器和 `import-source` 文本域，再真实点击输入框。页面只有虚构占位文案，不读取账号或真实任务。

- [修复前](before.png)：输入框计算样式为 `inset 0 -2px 0 rgb(145, 80, 0)`，底部出现加深线。
- [修复后](after.png)：追加修复后的 `classic-controls.css`，计算样式为 `box-shadow: none`。
- 两张图的上下边框均为同一条 1px 实线；仅移除额外的底部内阴影。

截图为局部样式复现，并非用户真实安装版目检。真实页面回归另由 `e2e/ui-smart-import.spec.ts` 执行，使用隔离本地适配器和固定解析响应，覆盖经典浅/深色、原文、确认表格五列及 API 设置字段的鼠标、Tab 和强制色焦点。

本机验证命令：

```powershell
$env:THREADLINE_SMART_IMPORT_BROWSER_CHANNEL = 'msedge'
pnpm test:smart-import:ui
```

完整结果为 20 项通过，包含两个触屏尺寸的 44px 命中区域和局部滚动检查。自动化未调用真实模型、保存供应商密钥或写入用户任务；不代表真实安装升级已验收。
