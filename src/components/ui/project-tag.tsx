/**
 * @fileoverview 项目分类轻量标签组件，以括号紧凑文本形式渲染。
 */

import type { CSSProperties } from 'react';

type ProjectTagProps = { name: string; color: string };

/**
 * 渲染轻量项目标签【项目名】。
 */
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

