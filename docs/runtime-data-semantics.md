<!-- 文件用途：说明 Threadline 本地业务日期和浏览器持久化的稳定语义，供后续功能与迁移遵循。 -->

# 运行时数据语义

## 本地业务日期

任务日期、Daily、收尾、历史目标日期和回收站恢复使用 `src/lib/local-date.ts`。

Calendar、Insights 与报告不分别计算统计，而是通过 `src/lib/analytics.ts` 的纯函数结果读取；日期范围、周一周起点和月历网格由 `src/lib/date-range.ts` 负责。旧 CloseRecord 只能作为项目级 `legacy-aggregate`，不得由当前任务状态、更新时间或移期字段反推任务级历史。完整质量规则见 [工作台信息架构与分析口径](workspace-information-architecture.md)。

- `getLocalDateKey()` 读取用户本地的年、月、日，不能用 `toISOString().slice(0, 10)` 生成业务日期。
- 相邻日期必须经 `addLocalDateDays()` 计算，避免 UTC 和本地午夜边界混用。
- 时间戳字段（例如 `updatedAt`）仍可使用 ISO instant；只有业务日键必须使用本地日期 helper。
- Records 与 History 从 timestamp 展示日期时使用 `getLocalDateKeyFromTimestamp()`；不得以字符串截取 ISO 的 UTC 日期。

## 浏览器持久化

`usePersistentState` 的 hydration 由 storage key 和 repository 生命周期控制。调用方可以传入 inline normalizer；Hook 会使用最新 normalizer，但不会因为函数引用变化反复读取 localStorage。

## 日期化批注

批注由专用的 `useAnnotationStrokes` 管理，使用 `threadline.annotations.v2`。日期笔迹必须携带 `targetDate`，全局笔迹明确使用 `targetScope: 'global'`；两种笔迹都保留可选的 `targetTaskId`。

首次升级只在 v2 不存在时读取 v1：旧 `today` 笔迹迁移到升级当天的本地日期，旧 `global` 笔迹保持全局。v1 key 不删除，且迁移不会把笔迹复制到其他日期。
