/** @fileoverview 按业务表合并实时通知，只刷新受影响的账号查询，避免一次操作重读整个工作区。 */
import type { QueryClient } from '@tanstack/react-query';

const queriesByTable: Record<string, string[]> = {
  projects: ['projects'],
  tasks: ['tasks'],
  task_time_entries: ['task-time-entries'],
  daily_templates: ['daily'],
  daily_template_items: ['daily'],
  daily_entries: ['daily'],
  daily_entry_items: ['daily'],
  workstation_entries: ['workstation'],
  rhythm_marks: [],
  daily_history_entries: ['daily-history'],
  history_events: ['history'],
  daily_close_records: ['close-records'],
};

/** 同一事务的连续通知在短窗口内合并；销毁时取消尚未发起的刷新。 */
export function createWorkspaceRealtimeRefresh(client: QueryClient, owner: string) {
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    notify(table: string) {
      for (const key of queriesByTable[table] ?? []) pending.add(key);
      if (timer || pending.size === 0) return;
      timer = setTimeout(() => {
        timer = undefined;
        for (const key of pending) {
          void client.invalidateQueries({
            queryKey: ['workspace', owner, key],
            exact: true,
          });
        }
        pending.clear();
      }, 40);
    },
    dispose() {
      clearTimeout(timer);
      pending.clear();
    },
  };
}
