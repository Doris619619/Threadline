<!-- 文件用途：说明 Threadline 本地业务日期和浏览器持久化的稳定语义，供后续功能与迁移遵循。 -->

# 运行时数据语义

## 本地业务日期

任务日期、Daily、收尾、历史目标日期和回收站恢复使用 `src/lib/local-date.ts`。

- `getLocalDateKey()` 读取用户本地的年、月、日，不能用 `toISOString().slice(0, 10)` 生成业务日期。
- 相邻日期必须经 `addLocalDateDays()` 计算，避免 UTC 和本地午夜边界混用。
- 时间戳字段（例如 `updatedAt`）仍可使用 ISO instant；只有业务日键必须使用本地日期 helper。

## 浏览器持久化

`usePersistentState` 的 hydration 由 storage key 和 repository 生命周期控制。调用方可以传入 inline normalizer；Hook 会使用最新 normalizer，但不会因为函数引用变化反复读取 localStorage。
