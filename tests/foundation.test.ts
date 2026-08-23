import { describe, expect, it } from 'vitest';
import { LocalStorageWorkspaceRepository } from '@/lib/repository';
import { seedWorkspace } from '@/lib/seed';

describe('Threadline foundation', () => {
  it('uses a required TypeScript test environment', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});

describe('workspace repository', () => {
  it('persists a workspace in browser storage', async () => {
    const repository = new LocalStorageWorkspaceRepository(
      'threadline.test.workspace',
      seedWorkspace,
    );
    const data = await repository.read();
    data.projects.push({
      id: 'test',
      name: '测试项目',
      color: '#2f80ed',
      status: 'active',
      createdAt: '2026-08-23T00:00:00.000Z',
    });
    await repository.write(data);
    const restored = await repository.read();
    expect(restored.projects.some((project) => project.id === 'test')).toBe(true);
    window.localStorage.removeItem('threadline.test.workspace');
  });
});
