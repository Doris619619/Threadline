<!-- 文件用途：记录桌面启动死锁与会话恢复问题的复现、修复边界及回归验证方法。 -->

# 启动、会话与窗口恢复

## 已复现问题

2026-09-21 在已安装的 0.1.8 上观察到：登录恢复与 `initialize_workspace` 已完成，数据加载和实时同步持续转圈。实际 DOM 中存在“展开紧凑工作台”，本机保存值为 `workstation` / `edge-collapsed`。

AppShell 提前返回 EdgeTab，使其内部 WorkspaceDataProvider 被卸载；DesktopWindowProvider 又等待 workspaceData 完成才调用原生 hydration。两个条件互相等待。仅把两个窗口偏好改为 `full` / `expanded` 并重新加载，即恢复工作台；没有清缓存、删除凭证或修改业务数据。

登录页过小属于另一条路径：`desktop:entry-window` 之前仅允许每进程执行一次，工作站内失去会话后不能再次扩展窗口。初次开机为何需要重新登录，缺少当时认证错误记录，不能断言凭证被清除或服务器故障。本次恢复过程中原会话可正常使用。

## 修复行为

- AppShell 收起时保留同一业务子树，只隐藏其 DOM，数据查询和同步订阅不因收起中断。
- 认证门禁明确请求 `authentication` 窗口用途；Main 校验用途和可信来源，重复恢复完整窗口并关闭 Edge。普通迟到的 `startup` 请求仍不能覆盖已选择的工作站。
- `useSessionRecovery` 区分未登录、恢复中和恢复失败。忽略不携带错误信息的 INITIAL_SESSION，使用 getSession 的成功/失败结果；新认证事件和新重试使旧读取结果失效。明确 SIGNED_OUT 才清 Query cache。
- 网络或读取异常不会由应用主动删除登录凭证；认证恢复失败时可手动重试，online/focus 只在失败后触发重试。真实失效、主动退出等 Supabase SIGNED_OUT 仍回到登录页。
- 认证和只读 HTTP 请求有 20 秒取消 deadline，并保留调用者的 AbortSignal。业务 RPC 写入不新增取消或自动重试，避免把未知提交结果当作未保存。
- 启动页等待超过 20 秒显示重新加载入口，但不改变任何阶段的真实状态；Realtime 仍不阻塞已加载工作台。

Web/PWA 和 Electron 共用认证恢复逻辑；只有原生窗口操作受 Electron bridge 限制。安装版的静态 Renderer 直接连接 Supabase，不经过 Vercel 服务端。无 schema、RLS、生产迁移或账号策略变更。

## 回归验证

- `pnpm exec vitest run tests/desktop-startup-recovery.test.tsx tests/session-recovery.test.tsx tests/cloud-recovery-deadline.test.ts tests/threadline-startup-screen.test.tsx`
- `pnpm desktop:compile && node scripts/test-electron-entry-recovery.mjs`：真实 Main/Preload、独立 userData、本地无账号测试页面；检查紧凑到登录、Edge 到登录、迟到 startup 和非法用途。
- `pnpm test`、`pnpm lint`、`pnpm typecheck`、`pnpm desktop:build`。

单元回归使用真实 AppShell、DesktopWindowProvider 和 StartupProgressProvider 组合，延迟报告数据完成，验证恢复收起偏好后加载器未卸载、握手最终完成；不能用恒定返回 children 的壳层 mock 代替。

隔离测试与本机临时恢复不能替代新安装包的实际开机自启动、长时间离线后会话续期验收。构建本地修复包不代表已发布 GitHub Release 或覆盖用户安装。
