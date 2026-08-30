/** @fileoverview 定义 UUID 项目的 fallback 解析规则，禁止业务代码依赖固定字符串 ID。 */

import type { Project } from '@/types/domain';

/** 返回首选 active 项目，否则选择 owner 唯一 fallback，最终退回任一 active 项目。 */
export function resolveActiveProject(
  projects: Project[],
  preferredId?: string,
): Project | undefined {
  return (
    projects.find(
      (project) => project.id === preferredId && project.status === 'active',
    ) ??
    projects.find((project) => project.isFallback && project.status === 'active') ??
    projects.find((project) => project.status === 'active')
  );
}

/** 解析 task 现有项目；引用异常时只回退到真实 active 项目数据。 */
export function resolveTaskProject(
  projects: Project[],
  projectId: string,
): Project | undefined {
  return (
    projects.find((project) => project.id === projectId) ??
    resolveActiveProject(projects)
  );
}
