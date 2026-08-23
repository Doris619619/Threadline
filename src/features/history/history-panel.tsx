'use client';
import { RotateCcw } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import type { DailyHistoryEntry } from '@/features/daily/daily-panel';
import type { CloseRecord, HistoryEvent, Task } from '@/types/domain';

const eventLabel: Record<string, string> = {
  rescheduled: '已移期',
  backlog: '待安排',
  abandoned: '放弃',
  scheduled: '已安排',
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
  const taskHistory = tasks.filter(
    (task) =>
      task.status === 'rescheduled' ||
      task.status === 'abandoned' ||
      task.status === 'backlog',
  );
  return (
    <div className="history-panel">
      <Surface>
        <header>
          <h2>历史记录</h2>
          <p>移期、待安排和放弃会长期保留；放弃不计入当天普通任务分母。</p>
        </header>
        {taskHistory.length === 0 && history.length === 0 ? (
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
              {taskHistory.map((task) => (
                <tr key={task.id}>
                  <td>{task.title}</td>
                  <td>
                    {task.status === 'abandoned'
                      ? '放弃'
                      : task.status === 'backlog'
                        ? '待安排'
                        : '已移期'}
                  </td>
                  <td>{task.postponedFrom ?? '2026-08-23'}</td>
                  <td>{task.postponedTo ?? '—'}</td>
                </tr>
              ))}
              {history.map((event) => (
                <tr key={event.id}>
                  <td>
                    {tasks.find((task) => task.id === event.taskId)?.title ??
                      '今日收尾'}
                  </td>
                  <td>{eventLabel[event.type] ?? event.type.replace('close_', '收尾：')}</td>
                  <td>{event.payload?.fromDate ?? event.occurredAt.slice(0, 10)}</td>
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
                    date: '2026-08-23',
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
