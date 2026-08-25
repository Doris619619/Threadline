/**
 * @fileoverview 统计数值项组件。
 */

import type { ReactNode } from 'react';

/**
 * 仪表盘统计单项。
 */
export function StatItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="tl-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
