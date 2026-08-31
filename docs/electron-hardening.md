<!-- 文件用途：说明 Threadline Web/PWA 与 Windows Electron 生产 CSP、ASAR 和 fuse 的可验证安全边界。 -->

# Electron CSP 与打包硬化

## CSP 构建契约

`pnpm build` 运行 Next Web server build，通过 `*.web.ts(x)` 路由和 `proxy.web.ts` 为每个请求生成 nonce；构建后会启动真实 `next start`，验证响应 CSP、页面 script nonce 和跨请求 nonce 更新。`pnpm desktop:renderer` 只发现 `*.electron.ts(x)` 路由，静态导出到 `.next-electron` 后生成并验证 `threadline-csp.json`。两条构建链使用独立输出目录，Web 不运行静态 HTML hash 生成器，Electron 也不会发现 Web Proxy。

生产策略固定为 `default-src 'self'`、精确的 `script-src` nonce 或构建 hash、`style-src 'self'`、`connect-src` 精确 origin、`img-src 'self' blob: data:`、`font-src 'self'`、`manifest-src 'self'`、`worker-src 'self'`、`object-src 'none'`、`base-uri 'self'`、`form-action 'self'` 和 `frame-ancestors 'none'`。Annotation、项目颜色和图表比例等 React 动态 style attribute 仅由独立的 `style-src-attr 'unsafe-inline'` 放行；`style-src` 本身不允许 `unsafe-inline`，也不允许 Supabase wildcard。

`pnpm start` 使用官方 `next start`，由 Web Proxy 写入请求期 CSP；打包应用的 `threadline://app` protocol 从 Electron manifest 写入静态策略。启用云仓储时，两条策略都必须精确列出对应 Supabase HTTPS 与 WSS origin，并由响应级及 Electron smoke test 验证。

## Windows 包硬化

electron-builder 继续输出 `app.asar`，并在 `afterPack` 后只对最终 Windows executable 设置和读取验证 fuses：关闭 RunAsNode、NODE_OPTIONS、CLI inspect 及 file protocol 额外特权；开启 cookie encryption、ASAR integrity、OnlyLoadAppFromAsar 与 browser-process V8 snapshot。开发模式不执行该 hook。

`scripts/test-electron.mjs` 覆盖完整 Full→Mini→Workstation→Edge→Main、Edge 状态第二实例与确定退出。Windows PR CI 先通过 `pnpm test:electron` 验证开发壳行为，再构建 canonical `win-unpacked`，并由 `pnpm test:electron:packaged` 复用同一套断言启动最终 EXE。packaged 分支额外断言 `app.isPackaged`、`threadline://app`、无 HTTP/file Renderer 与 CSP；runner 不启动 Next server，且在失败或超时后只结束本轮拥有的 Node/Electron 进程树。

`desktop:verify:parity` 会产生两份 unpacked package，因此仅在 GitHub Release workflow 的发布前 release tier 运行；它使用隔离 test adapter 比较静态 runtime 合同，不访问 Production Supabase。NSIS 安装/卸载与 DPI/双屏交互仍保留为 release-tier 人工验收，不为自动化兼容而放宽正式 fuses。仓库管理员仍需在 GitHub branch protection 中把这些检查设为 required；工作流文件本身不能替代该设置。
