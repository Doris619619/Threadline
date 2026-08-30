/**
 * @fileoverview Daily 任务面板组件，提供习惯性每日任务及子项打卡、耗时记录与管理功能。
 */

'use client';

import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ProjectTag } from '@/components/ui/project-tag';
import { Surface } from '@/components/ui/surface';
import type { Daily, DailyHistoryEntry } from '@/features/daily/types';
import { getDailyActualMinutes, isDailyCompleted } from '@/features/daily/daily-rules';
import { resolveActiveProject } from '@/lib/project-rules';
import type { Project } from '@/types/domain';

export type { Daily, DailyHistoryEntry } from '@/features/daily/types';
/**
 * Daily 任务面板主体组件。
 */
export function DailyPanel({
  items,
  history,
  date,
  projects,
  onChange,
  onAdd,
  onUpdateTemplate,
  onRecord,
}: {
  items: Daily[];
  history: DailyHistoryEntry[];
  date: string;
  projects: Project[];
  onChange: (items: Daily[]) => void;
  onAdd: (item: Daily) => void;
  onUpdateTemplate: (item: Daily) => Promise<void>;
  onRecord: (entry: DailyHistoryEntry) => void;
}) {
  const [newTitle, setNewTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [childTitles, setChildTitles] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string>();
  const [editingTitle, setEditingTitle] = useState('');
  const [editingProjectId, setEditingProjectId] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [savingTemplateId, setSavingTemplateId] = useState<string>();
  const selectedProjectId = resolveActiveProject(projects, projectId)?.id ?? '';
  const update = (id: string, fn: (daily: Daily) => Daily) =>
    onChange(items.map((item) => (item.id === id ? fn(item) : item)));
  const record = (daily: Daily) =>
    onRecord({
      dailyId: daily.id,
      projectId: daily.projectId,
      date,
      completed: isDailyCompleted(daily),
      actual: getDailyActualMinutes(daily),
      result: daily.result,
    });
  return (
    <Surface className="daily-panel">
      <header>
        <h2>Daily 任务</h2>
      </header>
      {items.map((daily) => {
        const complete = isDailyCompleted(daily);
        const recordedToday = history.some(
          (entry) => entry.dailyId === daily.id && entry.date === date,
        );
        return (
          <section className="daily-group" key={daily.id}>
            <div className="daily-parent">
              <div className="daily-check-wrap">
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
              </div>
              {editingId === daily.id ? (
                <div className="daily-edit-inline">
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
                    className="daily-save-btn"
                    disabled={savingTemplateId === daily.id}
                    onClick={async () => {
                      const project = projects.find(
                        (item) => item.id === editingProjectId,
                      );
                      if (!editingTitle.trim() || !project) return;
                      const next: Daily = {
                        ...daily,
                        title: editingTitle.trim(),
                        projectId: project.id,
                        project: project.name,
                        color: project.color,
                      };
                      setSaveError(undefined);
                      setSavingTemplateId(daily.id);
                      try {
                        await onUpdateTemplate(next);
                        update(daily.id, () => next);
                        setEditingId(undefined);
                      } catch (error) {
                        setSaveError(
                          error instanceof Error ? error.message : 'Daily 模板保存失败，请重试。',
                        );
                      } finally {
                        setSavingTemplateId(undefined);
                      }
                    }}
                  >
                  {savingTemplateId === daily.id ? '保存中…' : '保存'}
                  </button>
                  <button
                    className="daily-cancel-btn"
                    onClick={() => setEditingId(undefined)}
                  >
                    取消
                  </button>
                </div>
              ) : (
                <>
                  <div className="daily-parent-title-group">
                    <ProjectTag name={daily.project} color={daily.color} />
                    <span className="daily-parent-title">{daily.title}</span>
                  </div>
                  <div className="daily-parent-meta">
                    <span className="daily-tag-badge">Daily</span>
                    <button
                      className="daily-edit-link"
                      aria-label={`编辑 Daily ${daily.title}`}
                      onClick={() => {
                        setEditingId(daily.id);
                        setEditingTitle(daily.title);
                        setEditingProjectId(daily.projectId);
                      }}
                    >
                      编辑
                    </button>
                  </div>
                </>
              )}
            </div>
            {daily.children.length > 0 && (
              <div className="daily-children">
                {daily.children.map((child, index) => (
                  <div
                    className="daily-child-row"
                    key={child.id ?? child.templateItemId ?? `${daily.id}:${index}`}
                  >
                    <div className="daily-check-wrap">
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
                    </div>
                    {editingId === daily.id ? (
                      <Input
                        aria-label={`${daily.title}子任务名称${index + 1}`}
                        value={child.title}
                        onChange={(event) =>
                          update(daily.id, (item) => ({
                            ...item,
                            children: item.children.map((value, i) =>
                              i === index ? { ...value, title: event.target.value } : value,
                            ),
                          }))
                        }
                      />
                    ) : (
                      <span className="daily-child-name">{child.title}</span>
                    )}
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
                      <span className="daily-child-duration">
                        实际 {child.actual}min
                      </span>
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
                        children: [
                          ...item.children,
                          { id: crypto.randomUUID(), title, completed: false, actual: 0 },
                        ],
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
                      update(daily.id, (item) => ({
                        ...item,
                        result: event.target.value,
                      }))
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
      {isAdding ? (
        <div className="daily-add-form">
          <Input
            aria-label="新 Daily 名称"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="Daily 任务名称"
            autoFocus
          />
          <select
            aria-label="新 Daily 所属项目"
            value={selectedProjectId}
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
          <div className="daily-add-actions">
            <button
              className="daily-add-confirm"
              onClick={() => {
                if (!newTitle.trim()) return;
                const project = resolveActiveProject(projects, selectedProjectId);
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
                setIsAdding(false);
              }}
            >
              添加
            </button>
            <button className="daily-add-cancel" onClick={() => setIsAdding(false)}>
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="daily-add-footer">
          <button className="daily-add-btn" onClick={() => setIsAdding(true)}>
            + 添加 Daily
          </button>
        </div>
      )}
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
      {saveError && <p className="workspace-sync-error" role="alert">{saveError}</p>}
    </Surface>
  );
}
