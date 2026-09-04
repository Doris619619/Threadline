/** @fileoverview 渲染跨日期持续的待安排池，并以轻量重要性分组承载创建入口。 */

import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import type { Task } from '@/types/domain';

/** 在一个 Surface 内按重要性分组，避免把待安排拆成两张巨型卡片。 */
export function WaitingTaskPanel({
  children,
  isAdding,
  onAdd,
  waiting,
}: {
  children: ReactNode;
  isAdding: boolean;
  onAdd: () => void;
  waiting: Task[];
}) {
  void waiting;
  return (
    <Surface className="waiting-panel">
      <header>
        <h2>待安排</h2>
        <button className="add-link" type="button" onClick={onAdd}>
          <Plus size={19} /> 添加
        </button>
      </header>
      {children}
      {!isAdding && waiting.length === 0 && <p className="empty-copy">暂无待安排事项</p>}
    </Surface>
  );
}
