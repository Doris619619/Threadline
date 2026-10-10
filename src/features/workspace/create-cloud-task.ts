/** @fileoverview 创建任务确认后立即返回；历史与耗时刷新独立收尾，不把已成功创建误报为失败。 */
import type { QueryClient } from '@tanstack/react-query';
import { beginCloudWrite } from '@/lib/cloud-write-guard';
import type { SupabaseWorkspaceRepository } from '@/lib/supabase/workspace-repository';
import type { Project, Task } from '@/types/domain';
import type { MutationFeedback } from '@/lib/mutation-feedback';

type Repository = Pick<
  SupabaseWorkspaceRepository,
  'saveProject' | 'createTask' | 'appendHistory'
>;

/** 只等待项目前置条件和任务确认；确认才清旧错误，随后记录写入独立报告失败并受重启保护。 */
export async function createCloudTask(
  task: Task,
  projects: Project[],
  repository: Repository,
  client: QueryClient,
  owner: string,
  onError: (message: string | undefined) => void,
  feedback?: MutationFeedback,
) {
  const confirmFeedback = feedback?.begin() ?? (() => onError(undefined));
  const reportError = feedback?.report ?? onError;
  let endWrite: (() => void) | undefined;
  try {
    if (!navigator.onLine) throw new Error('当前离线，无法创建任务。');
    endWrite = beginCloudWrite();
    const project = projects.find((item) => item.id === task.projectId);
    if (!project) throw new Error('任务项目不存在。');
    if (!project.updatedAt) {
      const saved = await repository.saveProject(project);
      client.setQueryData<Project[]>(['workspace', owner, 'projects'], (rows = []) =>
        rows.map((item) => (item.id === saved.id ? saved : item)),
      );
    }
    const saved = await repository.createTask(task);
    await client.cancelQueries({
      queryKey: ['workspace', owner, 'tasks'],
      exact: true,
    });
    client.setQueryData<Task[]>(['workspace', owner, 'tasks'], (rows = []) => [
      ...rows.filter((item) => item.id !== saved.id),
      saved,
    ]);
    confirmFeedback();
    /** 历史写失败只提示记录问题，不让用户再次创建已存在的任务。 */
    void (async () => {
      try {
        await repository.appendHistory(
          {
            id: crypto.randomUUID(),
            taskId: saved.id,
            type: 'created',
            occurredAt: new Date().toISOString(),
            payload: { title: saved.title },
          },
          saved,
        );
        await Promise.all(
          ['history', 'task-time-entries'].map((key) =>
            client.invalidateQueries({ queryKey: ['workspace', owner, key] }),
          ),
        );
      } catch {
        reportError('任务已创建，但记录同步失败，请刷新后检查。');
      } finally {
        endWrite?.();
      }
    })();
    return saved;
  } catch (error) {
    endWrite?.();
    reportError(error instanceof Error ? error.message : '任务创建失败');
    throw error;
  }
}
