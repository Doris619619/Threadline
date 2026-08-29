/** @fileoverview 验证 UI fallback 只解析真实 active UUID 项目，不依赖固定字符串 ID。 */

import { describe, expect, it } from 'vitest';
import { resolveActiveProject } from '@/lib/project-rules';
import type { Project } from '@/types/domain';

const project = (overrides: Partial<Project>): Project => ({
  id: crypto.randomUUID(),
  name: '项目',
  color: '#4f8cff',
  status: 'active',
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('project fallback rules', () => {
  it('uses the owner fallback UUID when the preferred project is unavailable', () => {
    const fallback = project({ id: crypto.randomUUID(), isFallback: true });
    expect(
      resolveActiveProject(
        [project({ status: 'archived' }), fallback],
        crypto.randomUUID(),
      ),
    ).toBe(fallback);
  });

  it('never returns an archived fallback project', () => {
    const active = project({ id: crypto.randomUUID() });
    expect(
      resolveActiveProject([project({ isFallback: true, status: 'archived' }), active]),
    ).toBe(active);
  });
});
