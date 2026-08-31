/**
 * @fileoverview 回归 Daily 模板提交后的刷新语义与测试适配器的服务端等价 merge。
 */

import { describe, expect, it, vi } from 'vitest';
import type { Daily } from '@/features/daily/types';
import { settleDailyTemplatePostCommitRefresh } from '@/features/workspace/workspace-data-provider';
import { mergeLocalDailyTemplate } from '@/features/workspace/workspace-test-adapter';

const currentDaily: Daily = {
  entryId: '10000000-0000-4000-8000-000000000001',
  id: '20000000-0000-4000-8000-000000000001',
  projectId: '30000000-0000-4000-8000-000000000001',
  project: '原项目',
  color: '#2f80ed',
  title: '原模板',
  actual: 40,
  result: '当天结果',
  completed: true,
  children: [
    {
      id: '40000000-0000-4000-8000-000000000001',
      title: '已有子项',
      completed: true,
      actual: 25,
    },
    {
      id: '40000000-0000-4000-8000-000000000002',
      title: '并发新增子项',
      completed: true,
      actual: 10,
    },
  ],
};

describe('Daily template post-commit refresh', () => {
  it('resolves with a warning when refresh fails after the write committed', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('network timeout'));
    const invalidate = vi.fn().mockResolvedValue(undefined);
    const onWarning = vi.fn();

    await expect(
      settleDailyTemplatePostCommitRefresh(refresh, invalidate, onWarning),
    ).resolves.toBeUndefined();

    expect(onWarning).toHaveBeenCalledWith(
      'Daily 模板已保存，但最新内容刷新失败：network timeout',
    );
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it('does not warn or invalidate when the committed bundle refresh succeeds', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const invalidate = vi.fn().mockResolvedValue(undefined);
    const onWarning = vi.fn();

    await settleDailyTemplatePostCommitRefresh(refresh, invalidate, onWarning);

    expect(onWarning).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('LocalWorkspaceTestAdapter Daily template merge', () => {
  it('preserves server runtime and payload-missing concurrent children', () => {
    const merged = mergeLocalDailyTemplate(currentDaily, {
      ...currentDaily,
      projectId: '30000000-0000-4000-8000-000000000002',
      project: '新项目',
      color: '#27ae60',
      title: '新模板标题',
      children: [
        {
          ...currentDaily.children[0],
          title: '改名后的子项',
          completed: false,
          actual: 0,
        },
      ],
    });

    expect(merged.entry).toMatchObject({
      projectId: '30000000-0000-4000-8000-000000000002',
      title: '新模板标题',
      actual: 40,
      result: '当天结果',
      completed: true,
    });
    expect(merged.entry.children).toEqual([
      {
        ...currentDaily.children[0],
        templateItemId: currentDaily.children[0].id,
        title: '改名后的子项',
      },
      {
        ...currentDaily.children[1],
        templateItemId: currentDaily.children[1].id,
      },
    ]);
    expect(merged.template.children).toEqual(
      merged.entry.children.map((child) => ({
        ...child,
        id: child.templateItemId,
        completed: false,
        actual: 0,
      })),
    );
  });

  it('assigns and reuses one stable mapping for an entry-only child', () => {
    const first = mergeLocalDailyTemplate(
      { ...currentDaily, children: [] },
      {
        ...currentDaily,
        children: [
          {
            id: '40000000-0000-4000-8000-000000000003',
            title: '旧 entry-only 子项',
            completed: false,
            actual: 0,
          },
        ],
      },
    );
    const second = mergeLocalDailyTemplate(first.entry, first.entry);

    expect(first.entry.children[0].templateItemId).toBe(
      '40000000-0000-4000-8000-000000000003',
    );
    expect(second.entry.children[0].templateItemId).toBe(
      first.entry.children[0].templateItemId,
    );
  });
});
