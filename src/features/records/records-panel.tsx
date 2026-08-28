/** @fileoverview 记录页：在不新增事件存储的前提下，搜索当前可靠可得的任务、Daily 与历史时间线。 */

'use client';

import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Surface } from '@/components/ui/surface';
import type { DailyHistoryEntry } from '@/features/daily/daily-panel';
import type { CloseRecord, HistoryEvent, Project, Task } from '@/types/domain';

type RecordRow = {
  id: string;
  date: string;
  title: string;
  detail: string;
  searchable: string;
};

const eventLabels: Record<string, string> = {
  rescheduled: '已移期',
  backlog: '待安排',
  abandoned: '放弃',
  scheduled: '已安排',
  close_tomorrow: '收尾：移至明天',
  close_date: '收尾：指定日期',
  close_backlog: '收尾：待安排',
  close_abandoned: '收尾：放弃',
};

/** 从现有可靠来源构建只读记录行；已过期删除的旧任务保持明确的未知标题提示。 */
function buildRecordRows(
  tasks: readonly Task[],
  projects: readonly Project[],
  history: readonly HistoryEvent[],
  dailyHistory: readonly DailyHistoryEntry[],
  closeRecords: readonly CloseRecord[],
): RecordRow[] {
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const taskNames = new Map(tasks.map((task) => [task.id, task.title]));
  const taskRows = tasks
    .filter((task) => task.completed || task.status !== 'active')
    .map((task) => ({
      id: `task:${task.id}`,
      date: task.date ?? task.completedAt?.slice(0, 10) ?? task.updatedAt.slice(0, 10),
      title: task.title,
      detail: `${projectNames.get(task.projectId) ?? '已删除项目'} · ${task.completed ? '已完成' : task.status}`,
      searchable:
        `${task.title} ${projectNames.get(task.projectId) ?? ''} ${task.date ?? ''}`.toLowerCase(),
    }));
  const historyRows = history.map((event) => {
    const title =
      event.payload?.title ?? taskNames.get(event.taskId ?? '') ?? '已删除任务';
    const date = event.payload?.fromDate ?? event.occurredAt.slice(0, 10);
    const detail = eventLabels[event.type] ?? event.type;
    return {
      id: `history:${event.id}`,
      date,
      title,
      detail,
      searchable: `${title} ${detail} ${date}`.toLowerCase(),
    };
  });
  const dailyRows = dailyHistory.map((entry) => ({
    id: `daily:${entry.dailyId}:${entry.date}`,
    date: entry.date,
    title: 'Daily 记录',
    detail: `${projectNames.get(entry.projectId) ?? '已删除项目'} · ${entry.result || (entry.completed ? '已完成' : '未完成')}`,
    searchable:
      `daily ${projectNames.get(entry.projectId) ?? ''} ${entry.result} ${entry.date}`.toLowerCase(),
  }));
  const closeRows = closeRecords.map((record) => ({
    id: `close:${record.id}`,
    date: record.date,
    title: '结束今天',
    detail: '已保存当日项目投入汇总',
    searchable: `结束今天 项目投入 ${record.date}`.toLowerCase(),
  }));
  return [...taskRows, ...historyRows, ...dailyRows, ...closeRows].sort((left, right) =>
    right.date.localeCompare(left.date),
  );
}

/** 渲染带本地筛选的历史记录时间线，保持数据来源范围可解释。 */
export function RecordsPanel({
  tasks,
  projects,
  history,
  dailyHistory,
  closeRecords,
}: {
  tasks: Task[];
  projects: Project[];
  history: HistoryEvent[];
  dailyHistory: DailyHistoryEntry[];
  closeRecords: CloseRecord[];
}) {
  const [query, setQuery] = useState('');
  const rows = useMemo(
    () => buildRecordRows(tasks, projects, history, dailyHistory, closeRecords),
    [tasks, projects, history, dailyHistory, closeRecords],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const visible = rows.filter(
    (row) => !normalizedQuery || row.searchable.includes(normalizedQuery),
  );
  return (
    <div className="records-panel" data-testid="records-panel">
      <Surface className="records-heading">
        <div>
          <h2>记录</h2>
          <p>
            搜索当前可可靠获得的任务、Daily、流转和收尾历史；不补造已缺失的旧任务详情。
          </p>
        </div>
        <label className="records-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">搜索记录</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="任务、项目、日期或事件"
          />
        </label>
      </Surface>
      <Surface className="records-timeline">
        {visible.length ? (
          <ol>
            {visible.map((row) => (
              <li key={row.id}>
                <time dateTime={row.date}>{row.date}</time>
                <div>
                  <b>{row.title}</b>
                  <span>{row.detail}</span>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-copy">没有匹配的可可靠记录。</p>
        )}
      </Surface>
    </div>
  );
}
