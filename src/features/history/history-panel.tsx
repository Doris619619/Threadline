'use client';
import { RotateCcw } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import type { Task } from '@/types/domain';

export function HistoryPanel({
  tasks,
  onUpdate,
}: {
  tasks: Task[];
  onUpdate: (task: Task) => void;
}) {
  const trashed = tasks.filter((task) => task.status === 'trashed');
  const history = tasks.filter(
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
              {history.map((task) => (
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
