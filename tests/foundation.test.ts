import { describe, expect, it } from 'vitest';
import {
  LocalStorageStateRepository,
  LocalStorageWorkspaceRepository,
} from '@/lib/repository';
import { seedWorkspace } from '@/lib/seed';

describe('Threadline foundation', () => {
  it('uses a required TypeScript test environment', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});

describe('persistent state repository', () => {
  it('keeps UI state behind a repository boundary', async () => {
    const repository = new LocalStorageStateRepository();
    await repository.write('threadline.test.state', { selectedDate: '2026-08-23' });
    await expect(repository.read<{ selectedDate: string }>('threadline.test.state')).resolves.toEqual({
      selectedDate: '2026-08-23',
    });
    await repository.remove('threadline.test.state');
    await expect(repository.read('threadline.test.state')).resolves.toBeUndefined();
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
