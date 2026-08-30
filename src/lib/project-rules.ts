/** @fileoverview 定义 UUID 项目的 fallback 解析规则，禁止业务代码依赖固定字符串 ID。 */

import type { Project } from '@/types/domain';

/**
 * 未指定项目时选择 fallback；一旦调用方明确给出 ID，找不到就返回 undefined，绝不静默改投别的项目。
 */
export function resolveActiveProject(
  projects: Project[],
  preferredId?: string,
): Project | undefined {
  if (preferredId)
    return projects.find(
      (project) => project.id === preferredId && project.status === 'active',
    );
  return (
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
