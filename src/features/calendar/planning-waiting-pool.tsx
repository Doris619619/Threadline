/** @fileoverview 跨日期保留的待安排任务池：桌面侧栏与手机非模态托盘，共用明确的安排目标日期。 */
import { useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { ChevronDown, Inbox } from 'lucide-react';
import { getLocalDateKey } from '@/lib/local-date';
import { ThemeIllustration } from '@/features/appearance/theme-illustration';
import type { Task } from '@/types/domain';

/** 订阅桌面断点，仅用于未操作过的任务池默认展开状态。 */
function subscribeWidth(onChange: () => void) {
  const media = window.matchMedia('(min-width: 1024px)');
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
/** 读取当前断点；服务端没有视口时先按收起渲染，避免水合不一致。 */
function isWide() {
  return window.matchMedia('(min-width: 1024px)').matches;
}
/** 服务端不推测设备宽度。 */
function serverWidth() {
  return false;
}

/** 保持日期导航可交互；展开不创建模态遮罩，安排成功后任务池也不关闭。 */
export function PlanningWaitingPool({
  date,
  tasks,
  busy,
  open,
  notice,
  error,
  detailsRef,
  onOpen,
  onDate,
  row,
}: {
  date: string;
  tasks: Task[];
  busy: boolean;
  open: boolean | undefined;
  notice?: string;
  error?: string;
  detailsRef: RefObject<HTMLDetailsElement | null>;
  onOpen: (open: boolean) => void;
  onDate: (date: string) => void;
  row: (task: Task) => ReactNode;
}) {
  const wide = useSyncExternalStore(subscribeWidth, isWide, serverWidth);
  const grouped = tasks.some((task) => task.importance === 'important');
  return (
    <aside className="planning-waiting-dock" aria-label="待安排任务池">
      <details
        className="planning-waiting"
        ref={detailsRef}
        open={open ?? wide}
        onToggle={(event) => onOpen(event.currentTarget.open)}
      >
        <summary>
          <Inbox size={18} aria-hidden="true" />
          <span>待安排</span>
          <span className="planning-waiting-count">{tasks.length}</span>
          <ChevronDown size={16} className="planning-pool-chevron" aria-hidden="true" />
        </summary>
        <div className="planning-pool-body">
          <label className="planning-pool-date">
            安排到
            <input
              type="date"
              aria-label="安排目标日期"
              min={getLocalDateKey()}
              value={date}
              disabled={busy}
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (value && value >= getLocalDateKey()) onDate(value);
              }}
            />
          </label>
          <div className="planning-pool-list">
            {tasks.length === 0 && (
              <div className="planning-pool-empty">
                <ThemeIllustration />
                <p>暂时没有待安排任务。</p>
              </div>
            )}
            {(['important', 'normal'] as const).map((importance) => {
              const items = tasks.filter((task) => task.importance === importance);
              return (
                items.length > 0 && (
                  <section key={importance}>
                    {grouped && (
                      <h3>
                        {importance === 'important' ? '重要' : '普通'}{' '}
                        <span>{items.length}</span>
                      </h3>
                    )}
                    {items.map(row)}
                  </section>
                )
              );
            })}
          </div>
          <p className="planning-pool-notice" role="status">
            {notice}
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </details>
    </aside>
  );
}
