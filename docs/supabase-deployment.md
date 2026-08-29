<!-- 文件用途：给出 Threadline Supabase、Vercel、Electron 配置步骤及跨端验收状态边界。 -->

# Supabase、Vercel 与跨端验收

## 需要在 Supabase 完成的操作

1. 创建 **Production Supabase** 项目；如需安全使用 Vercel Preview，再创建独立 staging/test 项目。记录各自 Project URL 和 `sb_publishable_...` key，绝不复制 `service_role`、`sb_secret_` 或数据库密码到前端环境变量。
2. 在 Authentication 中启用 Email/password。Threadline 客户端只有登录表单，没有公开注册表单；测试/正式账号由项目管理员创建。配置 Production 的 Site URL 和允许的 Vercel Production HTTPS redirect URL。
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
   ```

   最后一项必须均为 `false`。Cron history 至少出现一次成功运行后，才能把定时 purge 标记为已验收。

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
- 没有第二个项目：不设置 URL/key，Preview 显示明确的“尚未配置云工作区”页面。

Preview 若声明 `production`、只缺一半配置，或启用 test adapter，构建会失败。Preview 不会连接 Production Supabase，也不会回退旧 localStorage。

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
