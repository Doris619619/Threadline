<!-- 文件用途：说明今日备忘录的自由笔记体验、编辑器来源、保存边界、云端部署与验证方法。 -->

# 今日备忘录

首页右栏的切换菜单新增「今日备忘录」，与「任务列表」「今日时间分布」并列。采用已确认的 A 方案：一张连续的自由笔记表面，顶部是轻量格式工具栏，正文按标题、段落和列表排版，底部显示日期及保存状态。继承当前主题、深浅色和字体；没有单独的项目、优先级、计时器或任务卡片。

## 使用

- 随首页日期切换，每个日期一页。切到其他栏目、收起右栏或刷新后可继续编辑。
- 可以直接粘贴网页中的标题、加粗、编号列表与项目符号列表。粘贴 Markdown 源码时转换为可编辑格式；普通文本仍保留段落。只在当前位置插入，不替换整页。
- 工具栏提供正文/三级标题、加粗、编号、项目符号、勾选列表、重点标记和链接。Ctrl+B 和编辑器的撤销/重做快捷键可用。
- 右上角可切到阅读模式。更多菜单支持复制 Markdown、清空本日内容；清空需确认，当前会话内仍可撤销。
- 粘贴时不导入外部字体、脚本、事件属性、图片或嵌入内容；链接限 HTTP、HTTPS 和 mailto。备忘录以结构化文档存储，不直接渲染任意保存的 HTML。

笔记中的“58 分钟”等文字是自由内容，不会解析成任务时长，也不会改变任务、Daily 或时间分布。每页结构化文档最多 200,000 个 JSON 字符、10,000 个节点、32 层嵌套；过大粘贴会明确提示。

## 保存与同步

正文每次变更立即写入本机草稿日志；停止输入 500ms、失焦或离开组件时提交。草稿、缓存均按账号和日期隔离，每次编辑会话使用独立日志，避免多个窗口直接覆盖未同步的草稿。Preview 另有独立存储前缀；本地演示仅显示「已保存到本机」。

正式账号使用 Supabase 的 `day_memos`，以 `(owner_id, memo_date)` 唯一标识，内容为 Tiptap JSON，版本号递增。打开、重新联网和回到窗口时读取最新版本。保存中仍可输入；旧响应只能确认它实际提交的内容，新输入继续排队。

网络或数据库未就绪时，界面显示待同步与重试，保留本机草稿。首次云端读取失败不会假设云端为空并覆盖已有内容。跨设备的旧版本保存会被数据库拒绝，界面保留草稿，允许用户明确选择「保留我的版本」或「采用云端版本」。清空保存为空文档而不删除记录，旧版本不能重新创建已经清空的内容。

本机存储配额或权限失败会单独提示；当前窗口按账号/日期保留未确认的内存会话，因此切换栏目、日期或其他页面不会丢失未落盘内容。若仍有未落盘输入，窗口级 `beforeunload` 处理会请求浏览器阻止关闭或刷新；是否显示离开确认取决于浏览器支持，实体 iPhone Safari/PWA 尚未验证。无法落盘时不要关闭窗口，应先复制 Markdown 备份。不要把本机草稿当作跨设备备份；只有「已同步」说明该版本已得到云端确认。

## 实现与来源

- `src/features/memo/memo-document.ts`：文档类型、安全链接、结构和大小校验。
- `memo-extensions.ts`：Tiptap schema、HTML 清理与 Markdown 粘贴。
- `today-memo-panel.tsx` / `memo-toolbar.tsx` / `memo.css`：编辑器、格式工具栏、保存反馈及主题排版。
- `memo-drafts.ts` / `memo-session.ts` / `memo-session-registry.ts` / `memo-repository.ts`：本机草稿、串行保存会话、当前窗口的待保存会话保留、云端与演示仓储。
- 首页的 `home-side-menu.tsx` 与 `task-dashboard.tsx` 增加第三个模式；编辑器通过 `next/dynamic` 按需加载，`immediatelyRender: false` 保持 Next.js SSR 与 Electron 静态导出边界，不增加 Web 专用服务依赖。

复用 [Tiptap](https://github.com/ueberdosis/tiptap) 3.35.1 的开源编辑器与扩展，按其 [MIT 许可证](https://github.com/ueberdosis/tiptap/blob/main/LICENSE.md) 使用 npm 发行包。实现前检查了 [Markdown 扩展源码](https://github.com/ueberdosis/tiptap/blob/main/packages/markdown/src/Extension.ts)、TaskItem 的 NodeView 源码、[React 接入](https://tiptap.dev/docs/editor/getting-started/install/react) 与 [Markdown 内容命令](https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage)。Markdown 扩展官方仍标为 Beta，因此将用户示例、标题、任务列表和 HTML 清理纳入回归；未引入付费扩展。

## 云端部署顺序

先应用 `supabase/migrations/202611280001_day_memos.sql`，再部署 Web/PWA 或发布新的 Windows 安装包。

迁移只新增 `day_memos` 表与 `save_day_memo` RPC，不改写任务或旧数据。表开启 RLS，authenticated 只可读取自己账号的记录，没有直接写表权限。写入使用固定 `search_path` 的 security-definer RPC，实际账号只取 `auth.uid()`；客户端传入的期望账号必须与认证账号一致，以拒绝切换账号后原页面的排队请求，每次写入还检查期望版本。anon 无执行权限。没有迁移时客户端保留草稿并提示云端尚未启用，不回退到无版本检查的写入。

本次代码实现不代表生产迁移已应用，也不代表已有 Windows 安装程序已升级。

## 验证

```powershell
pnpm exec vitest run tests/memo-editor.test.ts tests/memo-session.test.ts tests/memo-database.test.ts
pnpm typecheck
pnpm test:memo:ui
```

浏览器验证使用独占 `127.0.0.1:32228` 的本地测试适配器，不写真实账号。桌面默认使用 Playwright Chromium，可设置 `THREADLINE_MEMO_BROWSER_CHANNEL=msedge`；手机项目使用 iPhone 13 WebKit 模拟。截图输出到 `.impeccable/review/memo-*.png`。数据库测试使用 PGlite 真实执行迁移，验证账号隔离、RPC 权限、版本冲突和非法文档约束。

自动化不替代生产账号跨端同步、实体 iPhone Safari/PWA、Windows 安装升级的验收；这些需要相应部署和设备结果。

2026-11-28 本地验收：18 项编辑器、草稿会话、数据库和既有菜单测试通过；桌面 Edge 与 iPhone WebKit 共 8 项浏览器测试通过，包含本机存储失败时的栏目、日期导航草稿恢复；全仓 ESLint、TypeScript、Web production build（含 CSP 校验）与 Electron renderer 静态导出通过。数据库还验证了切换账号后的旧保存请求会被拒绝。已保存[截图及来源说明](screenshots/today-memo/README.md)。生产迁移和安装包发布尚未执行。
