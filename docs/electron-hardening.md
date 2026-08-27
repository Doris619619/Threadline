<!-- 文件用途：说明 Threadline Web/PWA 与 Windows Electron 生产 CSP、ASAR 和 fuse 的可验证安全边界。 -->

# Electron CSP 与打包硬化

## CSP 构建契约

`pnpm build` 会扫描 `.next/server/app` 的实际可路由 HTML，`pnpm desktop:renderer` 会扫描 `.next-electron`；两者分别生成未提交的 `threadline-csp.json`。生成器拒绝业务页面中的内联样式和任何外部 HTTP(S) 来源，并从实际内联 Next 启动脚本计算 SHA-256 hash。

生产策略固定为 `default-src 'self'`、`script-src 'self'` 加构建 hash、`style-src 'self'`、`connect-src 'self'`、`img-src 'self'`、`font-src 'self'`、`manifest-src 'self'`、`worker-src 'self'`、`object-src 'none'`、`base-uri 'self'`、`form-action 'self'` 和 `frame-ancestors 'none'`。策略不包含 `unsafe-inline`、Supabase wildcard 或推测的远端 origin。

`pnpm start` 的薄生产服务读取 Web manifest 后写入相同 CSP 响应头；打包应用的 `threadline://app` protocol 从 Electron manifest 写入该头。将来启用云仓储时，必须在配置中精确列出所需 HTTPS 与 WSS origin，并让构建审计明确通过。

## Windows 包硬化

electron-builder 继续输出 `app.asar`，并在 `afterPack` 后只对最终 Windows executable 设置和读取验证 fuses：关闭 RunAsNode、NODE_OPTIONS、CLI inspect 及 file protocol 额外特权；开启 cookie encryption、ASAR integrity、OnlyLoadAppFromAsar 与 browser-process V8 snapshot。开发模式不执行该 hook。

`scripts/test-electron.mjs` 覆盖开发壳的完整 Full→Mini→Workstation→Edge→Main、Edge 状态第二实例与确定退出。Windows CI 对 win-unpacked 读取 `app.asar`、最终 fuse wire 并完成 NSIS 构建；打包版的 protocol、视觉与 DPI/双屏交互仍由下方人工验收执行。

GitHub Actions 的 Windows job 会生成 win-unpacked、验证 `app.asar` 与最终 fuse wire、执行 packaged smoke，并构建 NSIS。仓库管理员仍需在 GitHub branch protection 中把这些检查设为 required；工作流文件本身不能替代该设置。
