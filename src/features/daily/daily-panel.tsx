'use client';

import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ProjectTag } from '@/components/ui/project-tag';
import { Surface } from '@/components/ui/surface';
import type { Project } from '@/types/domain';

export type Daily = {
  id: string;
  projectId: string;
  project: string;
  color: string;
  title: string;
  actual: number;
  result: string;
  completed: boolean;
  children: { title: string; completed: boolean; actual: number }[];
};
export const seedDaily: Daily[] = [
  {
    id: 'listen',
    projectId: 'life',
    project: '健身',
    color: '#e9a04b',
    title: '听力训练',
    actual: 30,
    result: '完成听力训练',
    completed: true,
    children: [
      { title: '精听', completed: true, actual: 20 },
      { title: '跟读', completed: true, actual: 10 },
      { title: '复盘错题', completed: false, actual: 0 },
    ],
  },
  {
    id: 'vocab',
    projectId: 'course',
    project: '六级',
    color: '#8b7cf6',
    title: '背单词',
    actual: 0,
    result: '',
    completed: false,
    children: [
      { title: '新词', completed: false, actual: 0 },
      { title: '复习', completed: false, actual: 0 },
    ],
  },
  {
    id: 'weekly',
    projectId: 'work',
    project: 'GitHub',
    color: '#4f8cff',
    title: '发布周报',
    actual: 0,
    result: '',
    completed: false,
    children: [],
  },
];
export type DailyHistoryEntry = {
  dailyId: string;
  projectId: string;
  date: string;
  completed: boolean;
  actual: number;
  result: string;
};

export function DailyPanel({
  items,
  history,
  date,
  projects,
  onChange,
  onAdd,
  onRecord,
}: {
  items: Daily[];
  history: DailyHistoryEntry[];
  date: string;
  projects: Project[];
  onChange: (items: Daily[]) => void;
  onAdd: (item: Daily) => void;
  onRecord: (entry: DailyHistoryEntry) => void;
}) {
  const [newTitle, setNewTitle] = useState('');
  const [projectId, setProjectId] = useState('other');
  const [childTitles, setChildTitles] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string>();
  const [editingTitle, setEditingTitle] = useState('');
  const [editingProjectId, setEditingProjectId] = useState('other');
  const update = (id: string, fn: (daily: Daily) => Daily) =>
    onChange(items.map((item) => (item.id === id ? fn(item) : item)));
  const record = (daily: Daily) =>
    onRecord({
      dailyId: daily.id,
      projectId: daily.projectId,
      date,
      completed: daily.completed || daily.children.some((child) => child.completed),
      actual: daily.actual,
      result: daily.result,
    });
  return (
    <Surface className="daily-panel">
      <header>
        <h2>Daily 任务</h2>
      </header>
      {items.map((daily) => {
        const complete =
          daily.completed || daily.children.some((child) => child.completed);
        const recordedToday = history.some(
          (entry) => entry.dailyId === daily.id && entry.date === date,
        );
        return (
          <section className="daily-group" key={daily.id}>
            <div className="daily-parent">
              <Checkbox
                aria-label={`完成 Daily ${daily.title}`}
                checked={complete}
                onChange={(event) =>
                  update(daily.id, (item) => ({
                    ...item,
                    completed: event.target.checked,
                  }))
                }
              />
              {editingId === daily.id ? (
                <>
                  <select
                    aria-label={`${daily.title}所属项目`}
                    value={editingProjectId}
                    onChange={(event) => setEditingProjectId(event.target.value)}
                  >
                    {projects
                      .filter((project) => project.status === 'active')
                      .map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                  </select>
                  <Input
                    aria-label={`${daily.title}名称`}
                    value={editingTitle}
                    onChange={(event) => setEditingTitle(event.target.value)}
                  />
                  <button
                    onClick={() => {
                      const project = projects.find((item) => item.id === editingProjectId);
                      if (!editingTitle.trim() || !project) return;
                      update(daily.id, (item) => ({
                        ...item,
                        title: editingTitle.trim(),
                        projectId: project.id,
                        project: project.name,
                        color: project.color,
                      }));
                      setEditingId(undefined);
                    }}
                  >
                    保存
                  </button>
                </>
              ) : (
                <>
                  <ProjectTag name={daily.project} color={daily.color} />
                  <b>{daily.title}</b>
                  <span className="daily-parent-actions">
                    <small>Daily</small>
                    <button
                      aria-label={`编辑 Daily ${daily.title}`}
                      onClick={() => {
                        setEditingId(daily.id);
                        setEditingTitle(daily.title);
                        setEditingProjectId(daily.projectId);
                      }}
                    >
                      编辑
                    </button>
                  </span>
                </>
              )}
            </div>
            {daily.children.length > 0 && (
              <div className="daily-children">
                {daily.children.map((child, index) => (
                  <div className="daily-child-row" key={child.title}>
                    <Checkbox
                      aria-label={`完成 ${child.title}`}
                      checked={child.completed}
                      onChange={(event) =>
                        update(daily.id, (item) => ({
                          ...item,
                          children: item.children.map((value, i) =>
                            i === index
                              ? { ...value, completed: event.target.checked }
                              : value,
                          ),
                        }))
                      }
                    />
                    <span>{child.title}</span>
                    {editingId === daily.id ? (
                      <Input
                        aria-label={`${daily.title} ${child.title}实际耗时`}
                        type="number"
                        min="0"
                        value={child.actual || ''}
                        placeholder="实际分钟"
                        onChange={(event) =>
                          update(daily.id, (item) => ({
                            ...item,
                            children: item.children.map((value, i) =>
                              i === index
                                ? { ...value, actual: Number(event.target.value) }
                                : value,
                            ),
                          }))
                        }
                      />
                    ) : (
                      <small>实际 {child.actual}min</small>
                    )}
                  </div>
                ))}
              </div>
            )}
            {editingId === daily.id && (
              <>
                <div className="daily-child-add">
                  <Input
                    aria-label={`${daily.title}新子任务`}
                    value={childTitles[daily.id] ?? ''}
                    placeholder="添加子任务"
                    onChange={(event) =>
                      setChildTitles((current) => ({
                        ...current,
                        [daily.id]: event.target.value,
                      }))
                    }
                  />
                  <button
                    onClick={() => {
                      const title = childTitles[daily.id]?.trim();
                      if (!title) return;
                      update(daily.id, (item) => ({
                        ...item,
                        children: [...item.children, { title, completed: false, actual: 0 }],
                      }));
                      setChildTitles((current) => ({ ...current, [daily.id]: '' }));
                    }}
                  >
                    + 子任务
                  </button>
                </div>
                <div className="daily-entry">
              <Input
                aria-label={`${daily.title}实际耗时`}
                type="number"
                min="0"
                value={daily.actual || ''}
                onChange={(event) =>
                  update(daily.id, (item) => ({
                    ...item,
                    actual: Number(event.target.value),
                  }))
                }
                placeholder="实际分钟"
              />
              <Input
                aria-label={`${daily.title}今日结果`}
                value={daily.result}
                onChange={(event) =>
                  update(daily.id, (item) => ({ ...item, result: event.target.value }))
                }
                placeholder="今日结果"
              />
                  <button
                    disabled={recordedToday}
                    onClick={() => record({ ...daily, completed: complete })}
                  >
                    {recordedToday ? '已记录' : '记录'}
                  </button>
                </div>
              </>
            )}
          </section>
        );
      })}
      <div className="daily-add">
        <Input
          aria-label="新 Daily 名称"
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
          placeholder="添加 Daily"
        />
        <select
          aria-label="新 Daily 所属项目"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
        >
          {projects
            .filter((project) => project.status === 'active')
            .map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
        </select>
        <button
          onClick={() => {
            if (!newTitle.trim()) return;
            const project = projects.find((item) => item.id === projectId) ?? projects[0];
            if (!project) return;
            onAdd({
              id: crypto.randomUUID(),
              projectId: project.id,
              project: project.name,
              color: project.color,
              title: newTitle.trim(),
              actual: 0,
              result: '',
              completed: false,
              children: [],
            });
            setNewTitle('');
          }}
        >
          + 添加 Daily
        </button>
      </div>
      {history.length > 0 && (
        <table className="daily-history">
          <caption>Daily 历史</caption>
          <thead>
            <tr>
              <th>日期</th>
              <th>完成</th>
              <th>实际</th>
              <th>今日结果</th>
            </tr>
          </thead>
          <tbody>
            {history.map((item, index) => (
              <tr key={`${item.date}-${index}`}>
                <td>{item.date}</td>
                <td>{item.completed ? '✓' : '×'}</td>
                <td>{item.actual ? `${item.actual}min` : '—'}</td>
                <td>{item.result || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Surface>
  );
}
