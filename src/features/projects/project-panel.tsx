/** @fileoverview 管理 UUID 项目列表、fallback 保护、归档恢复与项目详情入口。 */

'use client';
import { ArchiveRestore, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProjectTag } from '@/components/ui/project-tag';
import { Surface } from '@/components/ui/surface';
import { getLocalDateKey } from '@/lib/local-date';
import type { Project, Task, TaskTimeEntry } from '@/types/domain';
import type { Daily, DailyHistoryEntry } from '@/features/daily/daily-panel';

/**
 * 渲染项目列表、创建入口与选中项目详情；ledger 模式按历史项目归属汇总实际投入。
 */
export function ProjectPanel({
  items,
  tasks,
  taskTimeEntries,
  taskTimeEntriesAuthoritative,
  daily,
  dailyHistory,
  onChange,
}: {
  items: Project[];
  tasks: Task[];
  taskTimeEntries: TaskTimeEntry[];
  taskTimeEntriesAuthoritative: boolean;
  daily: Daily[];
  dailyHistory: DailyHistoryEntry[];
  onChange: (items: Project[]) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#4f8cff');
  const [selectedId, setSelectedId] = useState<string>();
  const [editingId, setEditingId] = useState<string>();
  const [editingName, setEditingName] = useState('');
  const [editingColor, setEditingColor] = useState('#4f8cff');
  const add = () => {
    if (!name.trim()) return;
    onChange([
      ...items,
      {
        id: crypto.randomUUID(),
        name: name.trim(),
        color,
        status: 'active',
        position: Math.max(-1, ...items.map((item) => item.position ?? -1)) + 1,
        isFallback: false,
        createdAt: getLocalDateKey(),
      },
    ]);
    setName('');
  };
  const selected = items.find((project) => project.id === selectedId);
  const selectedTasks = tasks.filter((task) => task.projectId === selectedId);
  const selectedDaily = daily.filter((item) => item.projectId === selectedId);
  const selectedDailyHistory = dailyHistory.filter(
    (item) => item.projectId === selectedId,
  );
  const taskActualByProject = new Map<string, number>();
  if (taskTimeEntriesAuthoritative) {
    for (const entry of taskTimeEntries) {
      taskActualByProject.set(
        entry.projectId,
        (taskActualByProject.get(entry.projectId) ?? 0) + entry.minutes,
      );
    }
  } else {
    for (const task of tasks) {
      taskActualByProject.set(
        task.projectId,
        (taskActualByProject.get(task.projectId) ?? 0) +
          (task.actualDurationMinutes ?? 0),
      );
    }
  }
  const saveEdit = () => {
    if (!editingId || !editingName.trim()) return;
    onChange(
      items.map((item) =>
        item.id === editingId
          ? { ...item, name: editingName.trim(), color: editingColor }
          : item,
      ),
    );
    setEditingId(undefined);
  };
  return (
    <Surface className="project-panel" data-testid="project-panel">
      <header className="project-toolbar">
        <div className="project-create">
          <Input
            aria-label="新项目名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="新项目名称"
          />
          <input
            aria-label="项目颜色"
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
          />
          <Button size="compact" onClick={add}>
            <Plus size={15} /> 添加
          </Button>
        </div>
      </header>
      <div className="project-list">
        {items.map((project) => {
          const projectTasks = tasks.filter((task) => task.projectId === project.id);
          const completed = projectTasks.filter((task) => task.completed).length;
          const actual = taskActualByProject.get(project.id) ?? 0;
          const projectDaily = daily.filter((item) => item.projectId === project.id);
          const projectDailyMinutes = dailyHistory
            .filter((item) => item.projectId === project.id)
            .reduce((total, item) => total + item.actual, 0);
          return (
            <div className="project-row" key={project.id}>
              {editingId === project.id ? (
                <>
                  <Input
                    aria-label={`${project.name}项目名称`}
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                  />
                  <input
                    aria-label={`${project.name}项目颜色`}
                    type="color"
                    value={editingColor}
                    onChange={(event) => setEditingColor(event.target.value)}
                  />
                  <Button size="compact" onClick={saveEdit}>
                    保存
                  </Button>
                </>
              ) : (
                <button
                  className="project-select"
                  onClick={() => setSelectedId(project.id)}
                >
                  <ProjectTag name={project.name} color={project.color} />
                </button>
              )}
              <b>{project.status === 'archived' ? '已归档' : '活跃'}</b>
              <span>
                累计 {actual + projectDailyMinutes}min · 普通任务 {completed}/
                {projectTasks.length} · Daily {projectDaily.length}
              </span>
              {project.isFallback ? (
                <small>默认承接项目</small>
              ) : (
                <Button
                  size="compact"
                  variant="quiet"
                  onClick={() => {
                    setEditingId(project.id);
                    setEditingName(project.name);
                    setEditingColor(project.color);
                  }}
                >
                  <Pencil size={15} /> 编辑
                </Button>
              )}
              {!project.isFallback && (
                <Button
                  size="compact"
                  variant="quiet"
                  onClick={() =>
                    onChange(
                      items.map((item) =>
                        item.id === project.id
                          ? {
                              ...item,
                              status: item.status === 'active' ? 'archived' : 'active',
                              archivedAt:
                                item.status === 'active'
                                  ? new Date().toISOString()
                                  : undefined,
                            }
                          : item,
                      ),
                    )
                  }
                >
                  <ArchiveRestore size={15} />
                  {project.status === 'active' ? '归档' : '恢复'}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {selected && (
        <Surface className="project-detail">
          <header>
            <div>
              <h2>{selected.name}</h2>
              <p>
                {selected.status === 'active' ? '活跃项目' : '已归档项目'} ·
                累计实际投入
              </p>
            </div>
            <strong>
              {(taskActualByProject.get(selected.id) ?? 0) +
                selectedDailyHistory.reduce((total, entry) => total + entry.actual, 0)}
              min
            </strong>
          </header>
          <p>
            普通任务 {selectedTasks.filter((task) => task.completed).length}/
            {selectedTasks.length}
            {' · '}Daily {selectedDaily.length} 个定义 / {selectedDailyHistory.length}{' '}
            条历史
          </p>
          <h3>最近任务</h3>
          {selectedTasks.length ? (
            selectedTasks
              .slice(-5)
              .reverse()
              .map((task) => <p key={task.id}>{task.title}</p>)
          ) : (
            <p className="empty-copy">该项目还没有任务。</p>
          )}
          <h3>Daily 历史</h3>
          {selectedDailyHistory.length ? (
            selectedDailyHistory.slice(0, 5).map((entry) => (
              <p key={`${entry.dailyId}-${entry.date}`}>
                {entry.date} · {entry.completed ? '完成' : '未完成'} · {entry.actual}min
                {entry.result ? ` · ${entry.result}` : ''}
              </p>
            ))
          ) : (
            <p className="empty-copy">该项目还没有 Daily 历史。</p>
          )}
        </Surface>
      )}
    </Surface>
  );
}
