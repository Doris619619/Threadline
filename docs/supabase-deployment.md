<!-- 文件用途：给出 Threadline Supabase、Vercel、Electron 配置步骤及跨端验收状态边界。 -->

# Supabase、Vercel 与跨端验收

## 需要在 Supabase 完成的操作

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
- 没有第二个项目：不设置 URL/key，Preview 自动展示可交互的演示工作台，无需登录、不占 Supabase 项目名额。首页常驻“演示模式”说明；示例包含今日任务、重要/普通待安排、带固定计划的 Daily 子项和无子项 Daily。

配置了云连接的 Preview 若声明 `production`、只缺一半配置，或启用 test adapter，构建会失败。演示标记由 `next.config.ts` 根据 `VERCEL_ENV=preview`、空 URL/key 且非 Electron 构建推导，不是用户可开启的 Production 开关。演示不会发起 Supabase 读写，数据存于 `threadline.preview-demo.v1:` 独立命名空间，不读取旧本地业务记录。

演示访问者可以创建/编辑/完成任务、填写 Daily 实际耗时与打卡、切换日期并刷新保留操作。数据只属于当前浏览器与域名，不会同步到正式账号或其他设备。清除该站点数据可重置示例。推荐分享 Vercel 的分支 Preview URL（随分支推送更新）；单次 deployment URL 保持对应旧提交。此能力随代码合并后供后续 PR 自动使用。

**Vercel 访问保护另行配置**：如果未登录浏览器被转到“Log in to Vercel”，应用代码尚未得到执行，不代表演示构建失败。要让手机拿到链接直接打开，需由项目所有者确认，在 Settings → Deployment Protection → Vercel Authentication 关闭 Require Log In 并保存。该设置是项目级的；当前 Standard Protection 同时覆盖预览和自动生成的生产部署 URL，关闭会让这些入口公开，Threadline 自身的登录和 Supabase RLS 仍保留。若保留保护，访问者必须先登录获准的 Vercel 账号，或使用单独授权的 Shareable Link。参见 [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection)。

`pnpm test:preview` 在无数据库的 production build 上验证桌面、窄手机和 iPhone WebKit 的交互、存储隔离与无 Supabase 请求；CI 的独立 `preview-demo` job 会执行该门禁。已部署页面可用 `THREADLINE_PREVIEW_URL=<https-url> pnpm exec playwright test --config playwright.preview.config.ts` 验收。真实 iPhone Safari/PWA 手工验收与云同步验收仍需分别记录。

## Electron Production

Electron Renderer 只接收同一组三个公开变量。`desktop:preview`、`desktop:build:dir`、`desktop:build` 与 `desktop:release` 会在构建期要求 `cloud environment=production`；静态 CSP 只允许精确的 Supabase HTTPS 与 WSS origin。Main/Preload 不接收 secret。

## 验收状态必须分开记录

| 验收项                              | 本仓库实现后的默认状态       | 完成证据                                                  |
| ----------------------------------- | ---------------------------- | --------------------------------------------------------- |
| Local Supabase schema/integration   | Passed                       | db lint、51 pgTAP、双账号 REST/RLS/Realtime integration   |
| Supabase backend configured         | Pending manual configuration | 远端 migration、RLS/cross-account、Realtime、Cron history |
| Electron production configured      | Pending production env       | production package 构建与登录/同步 smoke                  |
| Web/PWA production build configured | Configured in code           | `pnpm build` 与 nonce CSP verifier                        |
| Web/PWA HTTPS deployment available  | Pending Vercel deployment    | 可访问的 Production HTTPS URL                             |
| Physical phone acceptance completed | Pending HTTPS deployment     | 同账号 PC + 真机 iPhone PWA 双向同步记录                  |

没有可访问的 HTTPS Production URL 时，不能把 hosted PC + phone acceptance 写成通过。Supabase 数据同步通过也不能替代 PWA 安装、Service Worker、移动布局和真机 Realtime 验收。

## Issue 49 接口部署顺序

先执行向前迁移 `202609220001_issue_49_data_safety.sql` 并验证 RLS/权限，再发布客户端。新增 update_task_fields、restore_task、apply_workstation_command 和 close_day_checked；旧签名保留。新客户端缺少迁移时报错，不退回不安全整行写入。旧版客户端仍可能存在整行覆盖风险，需更新。迁移不重写历史或清理生产数据；本修复任务不执行生产迁移。
