import type { ReactNode } from 'react';

export function StatItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="tl-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
