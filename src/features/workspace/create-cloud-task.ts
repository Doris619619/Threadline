/** @fileoverview 创建任务确认后立即返回；按稳定编号补查响应丢失，历史与耗时刷新独立收尾。 */
import type { QueryClient } from '@tanstack/react-query';
import { beginCloudWrite } from '@/lib/cloud-write-guard';
import type { SupabaseWorkspaceRepository } from '@/lib/supabase/workspace-repository';
import type { Project, Task } from '@/types/domain';
import type { MutationFeedback } from '@/lib/mutation-feedback';

type Repository = Pick<
  SupabaseWorkspaceRepository,
  'saveProject' | 'createTask' | 'appendHistory' | 'findTasksByIds'
>;

/** 仅等待项目和任务确认；失败按 owner 和稳定编号补查，创建历史用同一编号幂等补齐。 */
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
    let saved: Task;
    try {
      saved = await repository.createTask(task);
    } catch (insertError) {
      // 写入可能已提交但回包丢失；补查失败或确实缺失时仍保留原始失败供安全重试。
      const existing = await repository
        .findTasksByIds([task.id], owner)
        .catch(() => []);
      const confirmed = existing.find((item) => item.id === task.id);
      if (!confirmed) throw insertError;
      saved = confirmed;
    }
    await client.cancelQueries({
      queryKey: ['workspace', owner, 'tasks'],
      exact: true,
    });
    client.setQueryData<Task[]>(['workspace', owner, 'tasks'], (rows = []) => [
      ...rows.filter((item) => item.id !== saved.id),
      saved,
    ]);
    confirmFeedback();
    /** 创建历史采用任务编号作为事件编号；首次响应丢失仍可补齐，重复确认不会增加事件或覆写历史。 */
    void (async () => {
      try {
        await repository.appendHistory(
          {
            id: saved.id,
            taskId: saved.id,
            type: 'created',
            occurredAt: saved.createdAt,
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
