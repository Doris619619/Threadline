/** @fileoverview 渲染首页的 Daily 执行区；模板管理入口只存在于项目管理页。 */

'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Surface } from '@/components/ui/surface';
import type { Daily, DailyHistoryEntry } from '@/features/daily/types';
import { getDailyActualMinutes, isDailyCompleted } from '@/features/daily/daily-rules';

export type { Daily, DailyHistoryEntry } from '@/features/daily/types';

/** 渲染当天 Daily 的完成、实际投入、结果和记录动作，不暴露模板结构编辑。 */
export function DailyPanel({
  items,
  history,
  date,
  onChange,
  onRecord,
}: {
  items: Daily[];
  history: DailyHistoryEntry[];
  date: string;
  onChange: (items: Daily[]) => void;
  onRecord: (entry: DailyHistoryEntry) => void;
}) {
  /** 仅修改当前日期实例，长期模板不会因执行态变化而变化。 */
  const update = (id: string, change: (daily: Daily) => Daily) =>
    onChange(items.map((item) => (item.id === id ? change(item) : item)));
  /** 为当天实例生成正式历史记录所需的执行快照。 */
  const record = (daily: Daily) =>
    onRecord({
      dailyId: daily.id,
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
              <div className="daily-parent-title-group">
                <span className="daily-parent-title">{daily.title}</span>
              </div>
              <div className="daily-parent-meta">
                <span className="daily-tag-badge">Daily</span>
              </div>
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
                            children: item.children.map((value, childIndex) =>
                              childIndex === index
                                ? { ...value, completed: event.target.checked }
                                : value,
                            ),
                          }))
                        }
                      />
                    </div>
                    <span className="daily-child-name">{child.title}</span>
                    <Input
                      aria-label={`${daily.title} ${child.title}实际耗时`}
                      type="number"
                      min="0"
                      value={child.actual || ''}
                      placeholder="实际分钟"
                      onChange={(event) =>
                        update(daily.id, (item) => ({
                          ...item,
                          children: item.children.map((value, childIndex) =>
                            childIndex === index
                              ? { ...value, actual: Number(event.target.value) }
                              : value,
                          ),
                        }))
                      }
                    />
                  </div>
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
                  update(daily.id, (item) => ({
                    ...item,
                    result: event.target.value,
                  }))
                }
                placeholder="今日结果"
              />
              <button disabled={recordedToday} onClick={() => record(daily)}>
                {recordedToday ? '已记录' : '记录'}
              </button>
            </div>
          </section>
        );
      })}
    </Surface>
  );
}
