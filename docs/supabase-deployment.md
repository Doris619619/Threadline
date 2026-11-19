<!-- 文件用途：给出 Threadline Supabase、Vercel、Electron 配置步骤及跨端验收状态边界。 -->

# Supabase、Vercel 与跨端验收

## 2026-11-19 · 0.1.16 发布前生产快照

生产项目 `yhhxsqozbildrnfhtgps` 已应用 `202610210001_timer_midnight_dst.sql` 与 `202611190001_account_ai_credentials.sql`。前者修正跨午夜/DST 的统计日界，后者新增账号 AI 凭据密文表；迁移 dry-run 已返回 `upToDate` 和空迁移清单。

AI 凭据表 RLS 开启，anon/authenticated 无直接表权限，service_role 具有 CRUD 权限，凭据表未加入 Realtime。32 字节加密主密钥已配置，并在本机以 Windows DPAPI 保护备份。`ai-api-settings` 与 `smart-task-import` 均为 ACTIVE v1，`verify_jwt=true`；运行时 key 兼容修复为 `58b397e`。

生产 SDK 使用两个临时账号完成 25 项凭据管理与解析边界检查，覆盖保存、重读、删除、跨账号隔离、客户端直读拒绝、空解析 400 与缺 Key 503；验收账号已全部清理。此次验收为 0 次模型调用、0 次既有账号任务写入。有效个人 Key 的模型调用与真实导入仍未验收，不能把这些边界检查称为完整模型联调通过。

0.1.16 production Windows packaged 程序的直接设置流程另有 14 项真实 UI 检查通过：从应用登录及首次引导进入设置，保存合成 Key、重开验证、移除并再次重开；输入保存后清空，未先在网站配置。临时账号、程序和独立资料目录已清理，无模型调用。此测试不覆盖 NSIS 安装或安装版自启动；[截图与来源](ai-task-import.md#2026-11-19-生产验收快照) 单独保留。

正式生产配置的 0.1.16 NSIS 已在本地构建，manifest 对应 clean commit `4dfd7a1`，真实 packaged EXE 的 CSP、protocol、Preload 与窗口 smoke 通过；尚未执行真实用户安装升级，也未发布网站 0.1.16、tag 或 Release。详细产物与公开状态边界见 [0.1.16 发布前快照](release-0.1.16.md)。

## 阶段计划迁移

在现有 main 迁移之后应用 `202610010001_stage_plans.sql`，再发布新客户端。迁移新增账号隔离的阶段表、Task 同账号关联、事务 RPC 与阶段 Realtime；原项目、Daily 和任务流转接口保持兼容。阶段关联的回收站任务不再参与 30 天物理清理。阶段删除会在同一事务清除任务关联而保留任务；清除关联后的普通回收站任务恢复原清理规则。

随后应用 `202610010002_stage_task_projects.sql` 再更新客户端：阶段创建草稿支持逐项项目，追加函数带默认第四参数，旧三参数调用仍兼容。项目必须同账号、活跃且未删除；创建批次中一项归属非法会使整批回滚。项目任务总览直接读取原 Task，无额外数据迁移或复制。

用 `pnpm test:stage:db` 在隔离 PostgreSQL 执行全套原始迁移与阶段合同；`pnpm test:supabase:integration` 还包含同账号双客户端阶段/任务 Realtime、跨账号拒绝和并发版本检查。前者不验证网络同步，后者要求运行本地 Docker/Supabase。字段、发布顺序和截图见 [阶段计划](stage-plans.md)。

## 0.1.13 实际投入记账迁移

`202610030001_task_actual_entry_date.sql` 在同一事务中记录指定日期的实际投入并可完成计时任务，使用调用方打开时的 Task 基准拒绝冲突；减少时长只扣减本次指定日期的记录，保留其他日期历史。旧接口保持兼容，无新增表或字段。

2026-10-06，按 PR #55 的合并发布授权，对关联 Production 先执行 dry-run，确认只有这一项缺失迁移后应用成功。随后 `migration list --linked` 的 24 项本地/远端迁移一致，最终 dry-run 返回 `upToDate: true` 与空迁移清单。该记录证明迁移已部署；实际账号操作与实体设备验收仍需单独核验。

## 两人空间迁移

新功能依次应用 `202609280001_together.sql` 与 `202609300001_together_review_safety.sql`，再发布客户端。新增独立成员 RLS、幂等 RPC 与 rooms Realtime，不放宽个人数据权限。成果图片改为微信发送，应用只记录主动声明与验收，因此不需要 Storage 或清理 Cron。部署步骤、测试边界及 localhost 展示见 [两人空间](together-space.md)。

## 并行计时迁移（已部署）

新客户端需要先应用 `202610160001_timer_overlap_accounting.sql`：新增原始会话、账号隔离统计投影与原子记账 RPC，不回填或删除旧数据。2026-10-16，数据库门禁通过后已应用该项迁移；随后 dry-run 返回 `upToDate: true` 和空迁移清单。只读核验确认原始表及会话表 RLS 开启、统计视图使用 `security_invoker=true`、会话表仅允许 authenticated 读取、写入只经 RPC，anon 不可调用；Realtime 已包含会话表。未对真实账号执行业务写入。验证和语义见[并行计时统计](timer-accounting.md)。

## 新环境的 Supabase 配置步骤

1. 创建 **Production Supabase** 项目；Vercel Preview 默认可使用无数据库演示，仅在需要验证真实云同步时创建独立 staging/test 项目。记录云项目各自的 Project URL 和 `sb_publishable_...` key，绝不复制 `service_role`、`sb_secret_` 或数据库密码到前端环境变量。
2. 在 Authentication 中启用 Email/password。Threadline 客户端提供 iOS 风格欢迎页与登录输入表单，没有公开注册表单；测试/正式账号由项目管理员创建。配置 Production 的 Site URL 和允许的 Vercel Production HTTPS redirect URL。
3. 在 Database Extensions / Cron 中先启用 `pg_cron`。迁移只会在检测到扩展时创建 `threadline-purge-expired-tasks` job；若扩展在迁移后才启用，需重新执行迁移中的 `cron.schedule(...)` 块。
4. 在本机登录并关联项目，然后推送迁移：

   ```bash
   pnpm exec supabase login
   pnpm exec supabase link --project-ref <production-project-ref>
   pnpm exec supabase db push
   ```

5. 在 SQL Editor 验证五项：

   ```sql
   select schemaname, tablename, rowsecurity
   from pg_tables
   where schemaname = 'public'
   order by tablename;

   select *
   from pg_publication_tables
   where pubname = 'supabase_realtime'
   order by tablename;

   select jobid, jobname, schedule, command, active
   from cron.job
   where jobname = 'threadline-purge-expired-tasks';

   select status, return_message, start_time, end_time
   from cron.job_run_details
   where jobid = (
     select jobid from cron.job where jobname = 'threadline-purge-expired-tasks'
   )
   order by start_time desc
   limit 10;

   select has_function_privilege('anon', 'private.purge_expired_tasks()', 'execute'),
          has_function_privilege('authenticated', 'private.purge_expired_tasks()', 'execute');

   select has_function_privilege('anon', 'public.rls_auto_enable()', 'execute'),
          has_function_privilege('authenticated', 'public.rls_auto_enable()', 'execute');

   select c.relname,
          has_table_privilege('authenticated', c.oid, 'select') as authenticated_select,
          has_table_privilege('authenticated', c.oid, 'insert') as authenticated_insert,
          has_table_privilege('authenticated', c.oid, 'update') as authenticated_update,
          has_table_privilege('anon', c.oid, 'select') as anon_select
   from pg_class as c
   join pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
   order by c.relname;
   ```

   两组函数权限检查都必须均为 `false`。`public.rls_auto_enable()` 是 Supabase 平台可能创建的 RLS event-trigger helper；Threadline 的 hardening migration 会在该函数存在时撤销 Data API 普通角色的调用权，但不影响数据库执行 event trigger。业务表必须按 Repository/RPC 的实际读写显示 `authenticated` 权限，`anon_select` 必须始终为 `false`；RLS 继续负责 owner row 隔离，不能替代表级 GRANT。Cron history 至少出现一次成功运行后，才能把定时 purge 标记为已验收。

6. 分别用两个账号执行 cross-account 验证：账号 A 创建项目/任务/Daily/Rhythm，账号 B 的 REST 与 Realtime 均不得看到或修改 A 的 row。

本地提交前验证使用：

```bash
pnpm supabase:start
pnpm supabase:lint
pnpm test:db
pnpm test:supabase:integration
```

其中 integration 测试通过本地 admin API 只创建/清理测试账号；所有业务读写与 Realtime 均使用 publishable key 和 Email/password session。它不能替代远端 Production 的 Cron history 与真机 hosted acceptance。

## Vercel 环境变量

Production 必须配置：

```text
NEXT_PUBLIC_SUPABASE_URL=https://<production-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_THREADLINE_CLOUD_ENV=production
```

Preview 有两种允许状态：

- 有 staging/test Supabase：配置其 URL/key，并设置 `NEXT_PUBLIC_THREADLINE_CLOUD_ENV=staging` 或 `test`。
- 没有第二个项目：不设置 URL/key，Preview 自动展示可交互的演示工作台，无需登录、不占 Supabase 项目名额。页面直接显示业务内容，不添加演示横幅；示例包含今日任务、重要/普通待安排、带固定计划的 Daily 子项和无子项 Daily。

配置了云连接的 Preview 若声明 `production`、只缺一半配置，或启用 test adapter，构建会失败。演示标记由 `next.config.ts` 根据 `VERCEL_ENV=preview`、空 URL/key 且非 Electron 构建推导，不是用户可开启的 Production 开关。演示不会发起 Supabase 读写，数据存于 `threadline.preview-demo.v1:` 独立命名空间，不读取旧本地业务记录。

演示访问者可以创建/编辑/完成任务、填写 Daily 实际耗时与打卡、切换日期并刷新保留操作。数据只属于当前浏览器与域名，不会同步到正式账号或其他设备。清除该站点数据可重置示例。推荐分享 Vercel 的分支 Preview URL（随分支推送更新）；单次 deployment URL 保持对应旧提交。此能力随代码合并后供后续 PR 自动使用。

**Vercel 访问保护另行配置**：如果未登录浏览器被转到“Log in to Vercel”，应用代码尚未得到执行，不代表演示构建失败。要让手机拿到链接直接打开，需由项目所有者确认，在 Settings → Deployment Protection → Vercel Authentication 关闭 Require Log In 并保存。该设置是项目级的；当前 Standard Protection 同时覆盖预览和自动生成的生产部署 URL，关闭会让这些入口公开，Threadline 自身的登录和 Supabase RLS 仍保留。若保留保护，访问者必须先登录获准的 Vercel 账号，或使用单独授权的 Shareable Link。参见 [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection)。

`pnpm test:preview` 在无数据库的 production build 上验证桌面、窄手机和 iPhone WebKit 的交互、存储隔离与无 Supabase 请求；CI 的独立 `preview-demo` job 会执行该门禁。已部署页面可用 `THREADLINE_PREVIEW_URL=<https-url> pnpm exec playwright test --config playwright.preview.config.ts` 验收。真实 iPhone Safari/PWA 手工验收与云同步验收仍需分别记录。

## Electron Production

Electron Renderer 只接收同一组三个公开变量。`desktop:preview`、`desktop:build:dir`、`desktop:build` 与 `desktop:release` 会在构建期要求 `cloud environment=production`；静态 CSP 只允许精确的 Supabase HTTPS 与 WSS origin。Main/Preload 不接收 secret。

Windows 安装版与 Web/PWA 共用 Cloud 账号的个人 DeepSeek Key。用户可直接在 Windows 的设置 → AI / API 接入填写、替换或移除，无需先在网站设置；浏览器联调仅是可选验收方式。保存状态不代表模型 API 连通性已经通过。

## 验收状态必须分开记录

以下为 0.1.16 发布前快照，不把已完成的云端部署留作默认待配置状态：

| 验收项                          | 当前状态              | 证据与边界                                                           |
| ------------------------------- | --------------------- | -------------------------------------------------------------------- |
| Production schema/migrations    | 已部署                | 两项迁移已应用，dry-run 为 `upToDate` 与空清单                       |
| AI 凭据权限与认证端点           | 已验收                | 两个临时账号 25 项通过，账号已清理；无模型调用或既有账号任务写入     |
| Production Cron 与真机同步      | 本轮未复验            | 仍需相应 Cron history、跨端业务与真机记录，不能由 AI 端点检查代替    |
| Electron production package     | 本地构建与 smoke 通过 | clean `4dfd7a1` 的 NSIS 与真实 packaged EXE 检查；不等同用户安装升级 |
| 有效 Key 模型解析与真实导入     | 未验收                | 需有效个人 Key 的生产调用和明确确认保存                              |
| Web/PWA 0.1.16 线上版本         | 尚未发布              | 需 Production HTTPS 部署和版本核验                                   |
| 0.1.16 tag / Release / 安装升级 | 尚未发布或执行        | 公开资产、更新源与真实 0.1.15 → 0.1.16 升级分别记录                  |
| Physical iPhone PWA acceptance  | 尚未完成              | 需 0.1.16 线上版本、PWA 安装与双向同步记录                           |

未核验 0.1.16 的线上 HTTPS 版本时，不能把该版本的 hosted PC + phone acceptance 写成通过。Supabase 数据同步通过也不能替代 PWA 安装、Service Worker、移动布局和真机 Realtime 验收。

## Issue 49 接口部署顺序

先执行向前迁移 `202609220001_issue_49_data_safety.sql` 并验证 RLS/权限，再发布客户端。新增 update_task_fields、restore_task、apply_workstation_command 和 close_day_checked；旧签名保留。新客户端缺少迁移时报错，不退回不安全整行写入。旧版客户端仍可能存在整行覆盖风险，需更新。迁移不重写历史或清理生产数据。

2026-09-22，按 0.1.9 发布授权对已关联生产项目执行 dry-run，确认只有这一项迁移后应用成功。4 个新 RPC 均核验为 security invoker，anon 不可执行、authenticated 可执行；tasks、workstation_entries、history_events、task_time_entries、daily_entries、daily_history_entries 的 RLS 全部保持启用。此核验只读取 schema/权限元数据，不对真实账号执行业务写入。
