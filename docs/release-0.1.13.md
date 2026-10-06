<!-- 文件用途：说明 0.1.13 的首页计时、计划两版布局、实际记账迁移、发布门禁和设备验收边界。 -->

# Threadline 0.1.13

- 首页保留原布局，顶部显示剩余/当日预计和实际投入；右栏内容选择与收起/展开放入统计横条。
- 最多三个任务计时器支持独立暂停、恢复、删除后重新加入及多标签同步。绿色正计时、红色倒计时；卡片统一显示 `HH:MM:SS` 和按账号时区转换的首次开始时间，暂停和刷新不改开始时刻。
- 计划支持经典/新版整页切换。经典保留左侧双环、右侧简明滚动信息和下方独立状态清单；新版显示所有正值任务的彩色引线与合并操作清单，日期和时间对齐，项目项数紧跟名称。
- 点击预计时间只出现原位数字框，Enter 或离焦保存、Esc 取消。桌面常用任务行通过右键操作，触屏保留更多入口；新版计划安排快捷入口沿用首页。
- Windows 主窗口支持 Ctrl 加号、Ctrl 减号和 Ctrl+0 缩放。圆环中心根据内圈与字体宽度适配，局部抑制 Safari 自动放大差异，保留用户显式文字和页面缩放。

## 数据与发布顺序

本版本对应 [PR #55](https://github.com/Doris619619/Threadline/pull/55)。需要已有的阶段估时迁移，以及 `202610030001_task_actual_entry_date.sql`。新 RPC 在同一事务中保存实际投入和计时完成，指定投入日期，检查打开时 Task 基准，减少时不扣减其他日期历史；无新增表或字段。

2026-10-06 已应用关联生产库唯一缺失的实际记账迁移；24 项本地/远端迁移一致，应用后的 dry-run 确认没有待部署迁移。

发布前先确认关联生产迁移清单并应用缺失迁移，再检查 PR 最终提交的 Supabase、Web、Preview、Windows Electron 和 Vercel 门禁；全部通过才合并。合并提交的 `package.json` 与 tag `v0.1.13` 一致，再由正式 Release workflow 验证 parity、构建安装器，并回下载比对全部资产后公开。

正式 Windows 资产为 `Threadline_0.1.13_x64-setup.exe`、对应 blockmap 和 `latest.yml`，公开状态以 [Release 页面](https://github.com/Doris619619/Threadline/releases/tag/v0.1.13) 为准。

## 审计与验证

正式依赖审计发现原锁文件有 3 项严重、4 项高危漏洞。Next.js 与配套 ESLint 配置升级到 16.3.6，electron-updater 升级到 6.8.9，并更新 sharp、builder-util-runtime、js-yaml、source-map-js 的兼容补丁版本；没有增加根依赖。升级后 `pnpm audit --prod --audit-level=high` 返回 `No known vulnerabilities found`。漏洞依据来自 [Next.js 维护者公告](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j)、[Electron builder 维护者公告](https://github.com/electron-userland/electron-builder/security/advisories/GHSA-p2f4-r6v6-j797) 和依赖审计；依赖命中不代表本项目已经遭到攻击。

完整构建依赖扫描另发现 40 项告警。兼容更新并在 `pnpm-workspace.yaml` 固定 undici 6.28.1、fast-uri 3.1.8、brace-expansion 2.1.7/5.0.12、http-cache-semantics 4.3.0 后，剩余以下两项上游未发布补丁的构建依赖告警。保留扫描结果，不忽略公告；这两个包不属于生产依赖，不进入应用运行路径。

| 构建依赖         | 告警与当前边界                                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| braces 3.0.3     | [高危：深层括号模式造成栈耗尽](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)。本仓库的 Next ESLint 配置没有设置外部 `rootDir` 模式，路径源于仓库和固定配置，不接收用户任务文本。公告标注暂无补丁，npm 也没有 3.0.4。 |
| sprintf-js 1.1.3 | [中危：无界精度格式造成拒绝服务](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)。调用链属于 Electron 构建下载工具的代理日志，不是 Threadline 用户接口；npm 尚无 1.1.4。                                               |

审计覆盖 PR 改动的任务记账事务、并发基准、账号隔离、本机同步、恢复计时、计划两版布局与 Electron 缩放。跨标签监听现于初始化时注册，避免缓存水合完成到下一次 effect 之间漏掉删除事件；增加初始化立即删除的回归检查，并确保单例失败时仍清理测试组件和监听。隔离 PostgreSQL 合同 51 项通过；全量单元/组件结果以最终提交门禁为准。

Linux Preview 的 WebKit 检查发现窄内圈、200% 文字下数字超过可用宽度，以及图表宽度变化后尺寸读取卡住。Safari 文本缩放约束作用于整个图形区域，覆盖参与画布高度测量的引线标签与中心数字，避免自动放大与尺寸测量相互反馈；用户显式文字和页面缩放仍保留。CI 在完整 Preview 前独立重复三次 WebKit 圆环缩放检查，保留原有尺寸边界和等待时间，尽早发现该平台问题。浏览器入口同时按实际界面更新：桌面右键、触屏更多、只核对可见布局的任务行，以及区分计时读数与开始时间。原有几何、账本和持久化断言继续保留，不跳过失败门禁。

完整浏览器与生产构建、迁移和安装器发布结果以 PR 最终提交及 tag 流水线为准；此前提交的通过记录不作为当前代码的合并依据。实体 iPhone PWA、用户设备上的 NSIS 安装/卸载和跨已安装版本升级仍需人工验收，浏览器与 Electron 自动化不替代这些操作。

规则与截图见 [阶段计划](stage-plans.md)、[桌面缩放](desktop-window-modes.md) 和 [Windows 构建](WINDOWS_BUILD.md)。
