<!-- 文件用途：说明 Threadline 0.1.18 今日备忘录能力、生产迁移、发布验证和安装升级边界。 -->

# Threadline 0.1.18

- 首页右栏菜单新增「今日备忘录」，与「任务列表」「今日时间分布」并列，每个日期独立保存一页。
- 可直接粘贴带标题、加粗、编号列表、项目符号和勾选列表的富文本或 Markdown；保留轻量格式工具栏、阅读模式、撤销和复制 Markdown。
- 正常保存时不常显右下角状态文字。输入立即保留本机草稿，随后同步账号；保存失败和版本冲突仍有提示与恢复入口。
- 切换日期、栏目或账号时，未确认的内容保留在原作用域；旧账号排队请求不能写入新账号。备忘录不参与任务、Daily 或时间统计。

## 数据库

2026-11-28 已向生产项目 `yhhxsqozbildrnfhtgps` 应用 `202611280001_day_memos.sql` 及 `202611280002_memo_conflict_response.sql`，新增备忘录表及带版本检查的保存 RPC。迁移前备份 public/private 结构，每次 dry-run 分别确认唯一待执行文件；迁移后 dry-run 为 `upToDate: true`，本地和生产的 29 项迁移一致。

生产联调发现 `40001` 会触发 PostgREST 的序列化失败重试，已通过第二项向前迁移将业务冲突改为 `PT409`（HTTP 409），保留 `MEMO_CONFLICT` 消息。问题及原因与 [Supabase 官方说明](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b) 一致；原迁移未回写，已保存数据不变。

实际权限检查确认：表开启 RLS，authenticated 可读取自己的记录、无直接插入或更新权限，只能经 `save_day_memo` 保存；anon 无 RPC 执行权。RPC 同时验证认证账号、预期账号及预期版本。不修改原任务、计时或账号记录。

## 验证与发布门禁

- 本地 135 个测试文件、884 项单元/组件测试通过。首次高并发运行的打包监控用例超时，降低到 2 个 worker 全量复跑通过，未跳过或放宽断言。
- 桌面 Edge 与 iPhone WebKit 模拟的 8 项备忘录浏览器测试通过，覆盖粘贴、格式、撤销、刷新、日期隔离、主题、窄屏和存储失败恢复；已接入 CI。
- 生产 Auth/REST/RPC 的 14 项验证通过：两个临时账号、同账号独立客户端保存和重读、账号切换拒绝、日期隔离、HTTP 409 冲突、直接写表和匿名请求拒绝、清空后版本递增。临时账号和备忘录已全部清理，没有写入既有账号。
- 匹配版本 tag 的 Release Actions 必须通过 lint、类型、全量单测、Preview/package-dir parity，再以生产云配置构建 NSIS。
- 发布脚本核对版本、提交、安装器校验值，将安装包、blockmap、latest.yml 上传为草稿并重新下载比对，全部一致才公开。

公开结果以 [Release Actions](https://github.com/Doris619619/Threadline/actions/workflows/release.yml) 和 [v0.1.18](https://github.com/Doris619619/Threadline/releases/tag/v0.1.18) 为准。[实际界面截图](screenshots/today-memo/README.md) 使用演示数据；模拟 iPhone 不等同真实 Safari/PWA 验收。

## 安装与更新

发布成功后，Windows x64 安装包名为 `Threadline_0.1.18_x64-setup.exe`，Release 页面将同时提供对应 blockmap 和 `latest.yml`。届时已安装版可在设置 → 关于 Threadline 检查更新，下载后确认重启；也可从 Release 页面下载安装包。沿用现有应用 ID、用户资料目录和 Cloud 账号，登录后可直接使用今日备忘录，无需个人执行数据库命令。

真实用户的 0.1.17 → 0.1.18 安装升级和资料保留应以升级后的实际结果为准，本次不自动安装或关闭用户正在使用的程序。
