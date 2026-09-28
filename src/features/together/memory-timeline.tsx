/** @fileoverview 回忆按查看者本地日期归档；细线连接完成节点，保留奖励与惊喜入口。 */
'use client';
import { ArrowUpRight, Check, Gift, Mail } from 'lucide-react';
import { accountClockParts } from '@/lib/account-clock';
import { spaceTime } from './time';
import type { Flag } from './types';

/** 对已加载的所有页统一分组，翻页后同一天不会出现重复日期标题。 */
export function MemoryTimeline({
  flags,
  zone,
  surprises,
  onOpen,
}: {
  flags: Flag[];
  zone: string;
  surprises: Set<string>;
  onOpen: (flag: Flag) => void;
}) {
  const days = new Map<string, Flag[]>();
  for (const flag of flags) {
    const day = accountClockParts(new Date(flag.completed_at!), zone).date;
    const group = days.get(day) ?? [];
    group.push(flag);
    days.set(day, group);
  }
  return (
    <div className="together-memories">
      {Array.from(days, ([day, entries]) => (
        <section className="together-memory-day" key={day} aria-label={day}>
          <h3>
            <time dateTime={day}>
              <b>{day.slice(5).replace('-', ' / ')}</b>
              <span>{day.slice(0, 4)}</span>
            </time>
            <span className="together-memory-rule" aria-hidden="true" />
          </h3>
          <ol>
            {entries.map((flag) => (
              <li key={flag.id} className="together-memory-entry">
                <span className="together-memory-dot" aria-hidden="true">
                  <Check size={12} />
                </span>
                <div className="together-memory-content">
                  <time
                    className="together-memory-time"
                    dateTime={flag.completed_at!}
                    title={`${spaceTime(flag.completed_at!, zone)} · ${zone}`}
                  >
                    {accountClockParts(new Date(flag.completed_at!), zone).time.slice(
                      0,
                      5,
                    )}
                    <span>已见证</span>
                  </time>
                  <button
                    className="together-memory-title"
                    onClick={() => onOpen(flag)}
                  >
                    {flag.title}
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </button>
                  {(flag.reward || surprises.has(flag.id)) && (
                    <div className="together-memory-footer">
                      {flag.reward && (
                        <span className="together-memory-reward">
                          <Gift size={14} aria-hidden="true" />
                          <span>{flag.reward}</span>
                        </span>
                      )}
                      {surprises.has(flag.id) && (
                        <button
                          className="together-memory-surprise"
                          onClick={() => onOpen(flag)}
                        >
                          <Mail size={15} aria-hidden="true" />
                          拆惊喜
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
