/** @fileoverview 展示历史事件、Daily 收尾与回收站，避免由 Task 当前快照重复构造流转记录。 */

'use client';
import { RotateCcw } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { getLocalDateKey, getLocalDateKeyFromTimestamp } from '@/lib/local-date';
import type { DailyHistoryEntry } from '@/features/daily/daily-panel';
import type { CloseRecord, HistoryEvent, Task } from '@/types/domain';

const eventLabel: Record<string, string> = {
  rescheduled: '已移期',
  backlog: '待安排',
  waiting: '待安排',
  abandoned: '放弃',
  scheduled: '已安排',
  close_tomorrow: '收尾：移至明天',
  close_date: '收尾：指定日期',
  close_backlog: '收尾：待安排',
  close_waiting: '收尾：待安排',
  close_abandoned: '收尾：放弃',
};

export function HistoryPanel({
  tasks,
  history,
  closeRecords,
  dailyHistory,
  onUpdate,
}: {
  tasks: Task[];
  history: HistoryEvent[];
  closeRecords: CloseRecord[];
  dailyHistory: DailyHistoryEntry[];
  onUpdate: (task: Task) => void;
}) {
  const trashed = tasks.filter((task) => task.status === 'trashed');
  return (
    <div className="history-panel">
      <Surface>
        <header>
          <h2>历史记录</h2>
          <p>移期、待安排和放弃会长期保留；放弃不计入当天普通任务分母。</p>
        </header>
        {history.length === 0 ? (
          <p className="empty-copy">还没有历史流转。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>任务</th>
                <th>状态</th>
                <th>原日期</th>
                <th>目标</th>
              </tr>
            </thead>
            <tbody>
              {history.map((event) => (
                <tr key={event.id}>
                  <td>
                    {tasks.find((task) => task.id === event.taskId)?.title ??
                      '今日收尾'}
                  </td>
                  <td>{eventLabel[event.type] ?? event.type}</td>
                  <td>
                    {event.type === 'scheduled' && !event.payload?.fromDate
                      ? '—'
                      : (event.payload?.fromDate ??
                        getLocalDateKeyFromTimestamp(event.occurredAt))}
                  </td>
                  <td>{event.payload?.toDate ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Surface>
      <Surface>
        <header>
          <h2>Daily 与收尾历史</h2>
          <p>Daily 每日结果与结束今天的项目投入会长期保留。</p>
        </header>
        {dailyHistory.length === 0 && closeRecords.length === 0 ? (
          <p className="empty-copy">还没有 Daily 或收尾记录。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>记录</th>
                <th>结果</th>
              </tr>
            </thead>
            <tbody>
              {dailyHistory.map((entry) => (
                <tr key={`${entry.dailyId}-${entry.date}`}>
                  <td>{entry.date}</td>
                  <td>Daily</td>
                  <td>{entry.result || (entry.completed ? '已完成' : '未完成')}</td>
                </tr>
              ))}
              {closeRecords.map((record) => (
                <tr key={record.id}>
                  <td>{record.date}</td>
                  <td>结束今天</td>
                  <td>已保存项目投入</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Surface>
      <Surface className="trash-panel">
        <header>
          <h2>回收站</h2>
          <p>删除的数据保留 30 天，恢复后回到今天的待办。</p>
        </header>
        {trashed.length === 0 ? (
          <p className="empty-copy">回收站为空。</p>
        ) : (
          trashed.map((task) => (
            <div className="trash-row" key={task.id}>
              <b>{task.title}</b>
              <small>删除后 30 天内可恢复</small>
              <button
                onClick={() =>
                  onUpdate({
                    ...task,
                    status: 'active',
                    date: getLocalDateKey(),
                    deletedAt: undefined,
                  })
                }
              >
                <RotateCcw size={15} />
                恢复
              </button>
            </div>
          ))
        )}
      </Surface>
    </div>
  );
}

/** 渲染设置中的回收站；恢复只改变任务状态，不改变任何历史或 analytics 记录。 */
export function TrashPanel({
  tasks,
  onUpdate,
}: {
  tasks: Task[];
  onUpdate: (task: Task) => void;
}) {
  const trashed = tasks.filter((task) => task.status === 'trashed');
  return (
    <Surface className="trash-panel">
      <header>
        <h2>回收站</h2>
        <p>删除的数据保留 30 天，恢复后回到今天的待办。</p>
      </header>
      {trashed.length === 0 ? (
        <p className="empty-copy">回收站为空。</p>
      ) : (
        trashed.map((task) => (
          <div className="trash-row" key={task.id}>
            <b>{task.title}</b>
            <small>删除后 30 天内可恢复</small>
            <button
              type="button"
              onClick={() =>
                onUpdate({
                  ...task,
                  status: 'active',
                  date: getLocalDateKey(),
                  deletedAt: undefined,
                })
              }
            >
              <RotateCcw size={15} />
              恢复
            </button>
          </div>
        ))
      )}
    </Surface>
  );
}
