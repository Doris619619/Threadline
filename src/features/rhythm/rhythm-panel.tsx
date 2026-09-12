/** @fileoverview 生理期状态、月历与历史统计；旧日期标记仅展示，不推断为周期。 */
'use client';

import { ChevronLeft, ChevronRight, Plus, Droplets } from 'lucide-react';
import { useState } from 'react';
import { Surface } from '@/components/ui/surface';
import { useRhythmState } from './rhythm-state';
import { periodDays, summarizePeriods, type PeriodDraft } from './period-rules';
import { PeriodEditor } from './period-editor';
import { getMonthGrid } from '@/lib/date-range';
import { useAccountToday } from '@/features/settings/account-timezone-provider';
import { addLocalDateDays } from '@/lib/local-date';
import { cn } from '@/lib/cn';

/** 所有快捷动作使用今天，月历浏览独立于首页工作日期；历史记录可随时补录修改。 */
export function RhythmPanel({ selectedDate }: { selectedDate: string }) {
  const today = useAccountToday();
  const [anchor, setAnchor] = useState(selectedDate.slice(0, 7));
  const [editor, setEditor] = useState<{
    draft: PeriodDraft;
    title: string;
    existing: boolean;
  }>();
  const { marks, periods, loading, error, save, remove, retry } = useRhythmState();
  const monthAnchor = `${anchor}-01`;
  const current = periods.find((record) => !record.endDate);
  const summary = summarizePeriods(periods);
  const sorted = [...periods].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const ready = !loading && !error;
  /** 新建草稿只在保存后生成持久记录。 */
  const add = (date: string, title = '补录生理期') =>
    setEditor({
      draft: { id: crypto.randomUUID(), startDate: date },
      title,
      existing: false,
    });
  return (
    <div className="rhythm-panel" data-testid="rhythm-panel">
      <Surface className="period-status">
        <div className="period-status-label">
          <Droplets size={20} aria-hidden="true" /> 生理期记录
          <time dateTime={today}>{today.slice(5).replace('-', ' / ')}</time>
        </div>
        <h2>
          {loading
            ? '正在读取记录…'
            : error
              ? '暂时无法读取记录'
              : current
                ? `进行中 · 第 ${periodDays(current.startDate, today)} 天`
                : sorted.length
                  ? '暂无进行中的记录'
                  : '尚未记录开始'}
        </h2>
        <p>
          {current
            ? `本次开始于 ${current.startDate}`
            : sorted[0]?.endDate
              ? `上次 ${sorted[0].startDate} 至 ${sorted[0].endDate} · ${periodDays(sorted[0].startDate, sorted[0].endDate)} 天`
              : '记下开始与结束日期，也可以补录过去的经期。'}
        </p>
        <div className="period-status-actions">
          <button
            type="button"
            className="period-save"
            disabled={!ready}
            onClick={() =>
              current
                ? setEditor({
                    draft: { ...current, endDate: today },
                    title: '记录结束',
                    existing: true,
                  })
                : add(today, '记录开始')
            }
          >
            {current ? '记录结束' : '记录开始'}
          </button>
          <button type="button" disabled={!ready} onClick={() => add(today)}>
            <Plus size={16} aria-hidden="true" /> 补录
          </button>
        </div>
        {error && (
          <p role="alert" className="period-error">
            {error}{' '}
            <button type="button" onClick={retry}>
              重试
            </button>
          </p>
        )}
      </Surface>
      <Surface className="rhythm-calendar">
        <header>
          <button
            type="button"
            aria-label="上个月"
            onClick={() => setAnchor(addLocalDateDays(monthAnchor, -1).slice(0, 7))}
          >
            <ChevronLeft size={18} />
          </button>
          <h2>{anchor.replace('-', ' 年 ')} 月</h2>
          <button
            type="button"
            aria-label="下个月"
            onClick={() => setAnchor(addLocalDateDays(monthAnchor, 32).slice(0, 7))}
          >
            <ChevronRight size={18} />
          </button>
          <button
            className="rhythm-today"
            type="button"
            onClick={() => setAnchor(today.slice(0, 7))}
            aria-label="回到本月"
          >
            今天
          </button>
        </header>
        <div className="rhythm-weekdays" aria-hidden="true">
          {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="rhythm-grid">
          {getMonthGrid(monthAnchor).map((date) => {
            const record = periods.find(
              (item) => item.startDate <= date && date <= (item.endDate ?? today),
            );
            const edge =
              record?.startDate === date
                ? '开始'
                : record?.endDate === date
                  ? '结束'
                  : record
                    ? '经期'
                    : marks[date]
                      ? '旧标记'
                      : '';
            return (
              <button
                type="button"
                key={date}
                disabled={!ready || date > today}
                className={cn(
                  !date.startsWith(anchor) && 'is-outside',
                  record && 'is-period',
                  record?.startDate === date && 'is-start',
                  record?.endDate === date && 'is-end',
                  date === today && 'is-today',
                  !record && marks[date] && 'is-legacy',
                )}
                aria-label={`${date}${date === today ? ' 今天' : ''}${edge ? ` ${edge}` : ''}`}
                aria-pressed={Boolean(record)}
                onClick={() =>
                  record
                    ? setEditor({ draft: record, title: '修改生理期', existing: true })
                    : add(date)
                }
              >
                <span>{Number(date.slice(-2))}</span>
                <small>
                  {record?.startDate === date && record?.endDate === date
                    ? '起止'
                    : edge === '经期'
                      ? ''
                      : edge}
                </small>
              </button>
            );
          })}
        </div>
        <div className="period-legend period-calendar-key">
          <span>
            <i className="period-key-range" aria-hidden="true" />
            经期
          </span>
          <span>
            <i className="period-key-edge" aria-hidden="true" />
            起止
          </span>
          <span>
            <i className="period-key-today" aria-hidden="true" />
            今天
          </span>
        </div>
        {Object.values(marks).some(Boolean) && (
          <p className="period-legend">
            旧日期标记已保留，不计入统计；点选日期可补录正式记录。
          </p>
        )}
      </Surface>
      <Surface className="period-history">
        <h2>历史记录</h2>
        <div className="period-statistics">
          <div>
            <span>平均经期</span>
            <strong
              className={summary.averageLength === undefined ? 'is-empty' : undefined}
            >
              {summary.averageLength === undefined
                ? '暂无足够记录'
                : `${summary.averageLength} 天`}
            </strong>
            <small>{summary.count} 次已结束记录</small>
          </div>
          <div>
            <span>平均开始间隔</span>
            <strong
              className={summary.averageInterval === undefined ? 'is-empty' : undefined}
            >
              {summary.averageInterval === undefined
                ? '暂无足够记录'
                : `${summary.averageInterval} 天`}
            </strong>
            <small>相邻两次开始日期之差</small>
          </div>
        </div>
        {sorted.length ? (
          <ul>
            {sorted.map((record) => (
              <li key={record.id}>
                <button
                  type="button"
                  disabled={!ready}
                  onClick={() =>
                    setEditor({ draft: record, title: '修改生理期', existing: true })
                  }
                >
                  <span>
                    {record.startDate}
                    <small>
                      {record.endDate ? `至 ${record.endDate}` : '尚未结束'}
                    </small>
                  </span>
                  <b>
                    {record.endDate
                      ? `${periodDays(record.startDate, record.endDate)} 天`
                      : '进行中'}
                  </b>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-copy">
            {ready ? '记录一次开始，这里就会留下你的历史。' : '记录读取后显示。'}
          </p>
        )}
      </Surface>
      <p className="period-privacy">仅当前账号可见 · 随账号同步 · 不进入洞察与报告</p>
      {editor && (
        <PeriodEditor
          key={editor.draft.id}
          initial={editor.draft}
          title={editor.title}
          existing={editor.existing}
          today={today}
          onSave={save}
          onDelete={remove}
          onClose={() => setEditor(undefined)}
        />
      )}
    </div>
  );
}
