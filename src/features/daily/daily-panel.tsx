'use client';

import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ProjectTag } from '@/components/ui/project-tag';
import { Surface } from '@/components/ui/surface';

type Daily = {
  id: string;
  project: string;
  color: string;
  title: string;
  actual: number;
  result: string;
  completed: boolean;
  children: { title: string; completed: boolean; actual: number }[];
};
const seed: Daily[] = [
  {
    id: 'listen',
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
    project: 'GitHub',
    color: '#4f8cff',
    title: '发布周报',
    actual: 0,
    result: '',
    completed: false,
    children: [],
  },
];
export function DailyPanel() {
  const [items, setItems] = useState(seed);
  const [history, setHistory] = useState<
    { date: string; completed: boolean; actual: number; result: string }[]
  >([]);
  const update = (id: string, fn: (daily: Daily) => Daily) =>
    setItems((current) => current.map((item) => (item.id === id ? fn(item) : item)));
  const record = (daily: Daily) =>
    setHistory((current) => [
      {
        date: '2026-08-23',
        completed: daily.completed || daily.children.some((child) => child.completed),
        actual: daily.actual,
        result: daily.result,
      },
      ...current,
    ]);
  return (
    <Surface className="daily-panel">
      <header>
        <h2>Daily 任务</h2>
      </header>
      {items.map((daily) => {
        const complete =
          daily.completed || daily.children.some((child) => child.completed);
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
              <ProjectTag name={daily.project} color={daily.color} />
              <b>{daily.title}</b>
              <small>Daily</small>
            </div>
            {daily.children.length > 0 && (
              <div className="daily-children">
                {daily.children.map((child, index) => (
                  <label key={child.title}>
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
                    <small>实际 {child.actual}min</small>
                  </label>
                ))}
              </div>
            )}
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
              <button onClick={() => record({ ...daily, completed: complete })}>
                记录
              </button>
            </div>
          </section>
        );
      })}
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
