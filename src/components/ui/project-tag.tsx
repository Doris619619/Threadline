type ProjectTagProps = { name: string; color: string };

export function ProjectTag({ name, color }: ProjectTagProps) {
  return (
    <span
      className="tl-project-tag"
      style={{ '--project-color': color } as CSSProperties}
    >
      【{name}】
    </span>
  );
}
import type { CSSProperties } from 'react';
