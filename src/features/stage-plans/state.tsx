/** @fileoverview 阶段账号查询、受检命令及详情导航；阶段读取失败不阻塞原工作台。 */
'use client';
import { parseEstimateMinutes } from '@/features/tasks/task-time';
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOptionalCloudRuntime } from '@/features/auth/cloud-runtime-provider';
import { useWorkspaceView } from '@/components/app-shell';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { beginCloudWrite } from '@/lib/cloud-write-guard';
import { isPreviewDemo } from '@/lib/workspace-runtime';
import { createDemoStagePlans } from '@/features/workspace/stage-demo-seed';
import { resolveActiveProject } from '@/lib/project-rules';
import type { StagePlan, Task, Project } from '@/types/domain';
import { StagePlanRepository } from './repository';
import { mergeConfirmedRows } from './confirmed-cache';
import {
  validateStageDraft,
  type StagePlanChanges,
  type StagePlanDraft,
  type StageTaskDraft,
  type StageStatus,
} from './rules';

type DataProps = {
  tasks: Task[];
  projects: Project[];
  updateTasks: React.Dispatch<React.SetStateAction<Task[]>>;
};
type StageData = {
  plans: StagePlan[];
  loading: boolean;
  error?: string;
  retry: () => void;
  create: (draft: StagePlanDraft) => Promise<StagePlan>;
  update: (plan: StagePlan, changes: StagePlanChanges) => Promise<StagePlan>;
  append: (stageId: string, task: StageTaskDraft) => Promise<void>;
  remove: (stageId: string, taskId: string) => Promise<void>;
  delete: (plan: StagePlan) => Promise<void>;
};
type Navigation = {
  detailId?: string;
  open: (id: string) => void;
  back: () => void;
  search: string;
  setSearch: (value: string) => void;
  tab: StageStatus;
  setTab: (value: StageStatus) => void;
  restoreList: () => void;
};
const Context = createContext<(StageData & Navigation) | null>(null);
/** 单独渲染的项目管理器可以不安装阶段；真实工作台始终安装。 */
export function useOptionalStagePlans() {
  return useContext(Context);
}
/** 业务组件禁止静默降级到另一份本地数据。 */
export function useStagePlans() {
  const value = useContext(Context);
  if (!value) throw new Error('StagePlansProvider is required.');
  return value;
}
/** 详情使用工作台内视图，不增加静态导出不支持的动态服务端路由。 */
function NavigationProvider({
  children,
  data,
}: {
  children: ReactNode;
  data: StageData;
}) {
  const { active, setActive } = useWorkspaceView();
  const [detailId, setDetailId] = useState<string>();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<StageStatus>('active');
  const listScroll = useRef(0);
  const returnCard = useRef<string | undefined>(undefined);
  /** 从首页和列表打开同一个完整详情，保留列表筛选。 */
  const open = (id: string) => {
    if (active === 'projects' && !detailId) {
      listScroll.current = Math.max(
        document.querySelector('.tl-main')?.scrollTop ?? 0,
        window.scrollY,
      );
      returnCard.current = id;
    }
    setDetailId(id);
    setActive('projects');
  };
  /** 列表重新挂载后恢复滚动和卡片焦点，聚焦不再次滚动页面。 */
  const restoreList = () => {
    const main = document.querySelector('.tl-main');
    if (main) main.scrollTop = listScroll.current;
    window.scrollTo?.(0, listScroll.current);
    const card = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-stage-card-id]'),
    ).find((element) => element.dataset.stageCardId === returnCard.current);
    card?.focus({ preventScroll: true });
  };
  /** 返回时保留工作日期、搜索和状态筛选。 */
  const back = () => setDetailId(undefined);
  return (
    <Context.Provider
      value={{
        ...data,
        detailId,
        open,
        back,
        search,
        setSearch,
        tab,
        setTab,
        restoreList,
      }}
    >
      {children}
    </Context.Provider>
  );
}
/** 云命令提交回包合并原 Task 缓存；每个账号重新挂载会话。 */
function CloudStagePlans({ children }: { children: ReactNode }) {
  const cloud = useOptionalCloudRuntime()!;
  const client = useQueryClient();
  const owner = cloud.user.id;
  const repository = useMemo(
    () => new StagePlanRepository(cloud.client),
    [cloud.client],
  );
  const key = useMemo(() => ['workspace', owner, 'stage-plans'], [owner]);
  const taskKey = ['workspace', owner, 'tasks'];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => repository.list(signal),
  });
  const pending = useRef(new Set<string>());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  /** 只合并未过期任务；已确认删除的父阶段不能被旧回包恢复归属。 */
  const acceptTasks = async (rows: Task[]) => {
    await client.cancelQueries({ queryKey: taskKey, exact: true });
    const deletedStageIds = new Set(
      (client.getQueryData<StagePlan[]>(key) ?? [])
        .filter((plan) => plan.deletedAt)
        .map((plan) => plan.id),
    );
    const confirmed = rows.map((task) =>
      task.stagePlanId && deletedStageIds.has(task.stagePlanId)
        ? { ...task, stagePlanId: undefined }
        : task,
    );
    client.setQueryData<Task[]>(taskKey, (current = []) =>
      mergeConfirmedRows(current, confirmed),
    );
  };
  /** 刷新失败不能让已成功事务被误报为创建失败。 */
  const refresh = () => {
    void Promise.all(
      ['stage-plans', 'tasks', 'history'].map((name) =>
        client.invalidateQueries({ queryKey: ['workspace', owner, name], exact: true }),
      ),
    ).catch(() => undefined);
  };
  /** 同一阶段同步防重入；完整请求都纳入现有退出/重启写保护。 */
  const run = async <T,>(id: string, operation: () => Promise<T>): Promise<T> => {
    if (!navigator.onLine) throw new Error('当前离线，请联网后重试。');
    if (pending.current.has(id))
      throw new Error('这个阶段的操作尚未完成，请稍后重试。');
    const end = beginCloudWrite();
    pending.current.add(id);
    try {
      return await operation();
    } finally {
      pending.current.delete(id);
      end();
    }
  };
  /** 删除版本仍留在缓存参与比较；展示层隐藏，旧确认不能重现已删除阶段。 */
  const acceptPlan = async (plan: StagePlan) => {
    await client.cancelQueries({ queryKey: key, exact: true });
    client.setQueryData<StagePlan[]>(key, (rows = []) =>
      mergeConfirmedRows(rows, [plan]),
    );
  };
  /** 创建和首批清单共用一个事务，失败保留草稿 ID。 */
  const create = (draft: StagePlanDraft) =>
    run(draft.id, async () => {
      const error = validateStageDraft(draft);
      if (error) throw new Error(error);
      const bundle = await repository.create(draft);
      await acceptPlan(bundle.plan);
      await acceptTasks(bundle.tasks);
      refresh();
      return bundle.plan;
    });
  /** 首页隐藏立即响应，失败回滚；其他元数据保持受检保存。 */
  const update = (plan: StagePlan, changes: StagePlanChanges) =>
    run(plan.id, async () => {
      if (changes.homeVisible === false) setHidden((ids) => new Set(ids).add(plan.id));
      try {
        const saved = await repository.update(plan, changes);
        await acceptPlan(saved);
        refresh();
        return saved;
      } catch (error) {
        refresh();
        throw error;
      } finally {
        setHidden((ids) => {
          const next = new Set(ids);
          next.delete(plan.id);
          return next;
        });
      }
    });
  /** 追加仍未安排的原 Task。 */
  const append = (stageId: string, task: StageTaskDraft) =>
    run(stageId, async () => {
      await acceptTasks([await repository.append(stageId, task)]);
      refresh();
    });
  /** 清除归属而不改执行状态、日期或耗时。 */
  const remove = (stageId: string, taskId: string) =>
    run(stageId, async () => {
      await acceptTasks([await repository.remove(stageId, taskId)]);
      refresh();
    });
  /** 删除仅清除缓存中的阶段归属，保留所有任务。 */
  const deletePlan = (plan: StagePlan) =>
    run(plan.id, async () => {
      await acceptPlan(await repository.delete(plan));
      await client.cancelQueries({ queryKey: taskKey, exact: true });
      client.setQueryData<Task[]>(taskKey, (rows = []) =>
        rows.map((task) =>
          task.stagePlanId === plan.id ? { ...task, stagePlanId: undefined } : task,
        ),
      );
      refresh();
    });
  return (
    <NavigationProvider
      data={{
        plans: (query.data ?? [])
          .filter((plan) => !plan.deletedAt)
          .map((plan) =>
            hidden.has(plan.id) ? { ...plan, homeVisible: false } : plan,
          ),
        loading: query.isPending,
        error: query.error ? '阶段计划暂不可用，请重试。' : undefined,
        retry: () => {
          void query.refetch();
        },
        create,
        update,
        append,
        remove,
        delete: deletePlan,
      }}
    >
      {children}
    </NavigationProvider>
  );
}
/** 本地适配器只用于显式测试/Preview；模拟相同 Task 身份和版本边界。 */
function LocalStagePlans({
  children,
  tasks,
  projects,
  updateTasks,
}: DataProps & { children: ReactNode }) {
  const [plans, setPlans, hydrated] = usePersistentState<StagePlan[]>(
    'threadline.stage-plans.v1',
    () => (isPreviewDemo() ? createDemoStagePlans() : []),
  );
  const latest = useRef(plans);
  const taskRows = useRef(tasks);
  useLayoutEffect(() => {
    latest.current = plans;
    taskRows.current = tasks;
  }, [plans, tasks]);
  /** 旧草稿不能覆盖已经改变或删除的阶段。 */
  const requirePlan = (id: string, expected?: string) => {
    const plan = latest.current.find((item) => item.id === id && !item.deletedAt);
    if (!plan) throw new Error('阶段已删除或不可用。');
    if (expected && plan.updatedAt !== expected)
      throw new Error('阶段已改变，请重新查看后保存。');
    return plan;
  };
  /** 新项属于明确选择的活跃项目；省略时采用 fallback，不把失效归属静默改投其他项目。 */
  const newTask = (
    id: string,
    stageId: string,
    title: string,
    projectId?: string,
    estimateMinutes?: string,
  ): Task => {
    const project = resolveActiveProject(projects, projectId);
    if (!project) throw new Error('所选项目已归档或不可用，请重新选择。');
    if (!title.trim() || title.trim().length > 200)
      throw new Error('任务名称需要 1–200 个字符。');
    const now = new Date().toISOString();
    return {
      id,
      projectId: project.id,
      stagePlanId: stageId,
      title: title.trim(),
      plannedDurationMinutes: parseEstimateMinutes(estimateMinutes ?? ''),
      status: 'waiting',
      completed: false,
      importance: 'normal',
      createdAt: now,
      updatedAt: now,
    };
  };
  /** 先验证整批，再发布两个集合；固定 ID 的成功重试不重复创建。 */
  const create = async (draft: StagePlanDraft) => {
    const error = validateStageDraft(draft);
    if (error) throw new Error(error);
    const existing = latest.current.find((plan) => plan.id === draft.id);
    if (existing) return existing;
    const added = draft.tasks.map((task) =>
      newTask(task.id, draft.id, task.title, task.projectId, task.estimateMinutes),
    );
    const now = new Date().toISOString();
    const plan: StagePlan = {
      id: draft.id,
      name: draft.name.trim(),
      startDate: draft.startDate,
      endDate: draft.endDate,
      homeVisible: draft.homeVisible,
      createdAt: now,
      updatedAt: now,
    };
    setPlans((rows) => [...rows, plan]);
    updateTasks((rows) => [...rows, ...added]);
    return plan;
  };
  /** 本地版本至少前进 1ms，连续点击也不能重用旧版本。 */
  const update = async (plan: StagePlan, changes: StagePlanChanges) => {
    const current = requirePlan(plan.id, plan.updatedAt);
    const saved = {
      ...current,
      ...changes,
      updatedAt: new Date(
        Math.max(Date.now(), Date.parse(current.updatedAt) + 1),
      ).toISOString(),
    };
    const error = validateStageDraft(saved);
    if (error) throw new Error(error);
    setPlans((rows) => rows.map((row) => (row.id === plan.id ? saved : row)));
    return saved;
  };
  /** 稳定 ID 追加任务不改现有清单。 */
  const append = async (stageId: string, draft: StageTaskDraft) => {
    requirePlan(stageId);
    if (taskRows.current.some((task) => task.id === draft.id)) return;
    const task = newTask(
      draft.id,
      stageId,
      draft.title,
      draft.projectId,
      draft.estimateMinutes,
    );
    updateTasks((rows) => [...rows, task]);
  };
  /** 移除只解除关联。 */
  const remove = async (stageId: string, taskId: string) => {
    requirePlan(stageId);
    updateTasks((rows) =>
      rows.map((task) =>
        task.id === taskId && task.stagePlanId === stageId
          ? { ...task, stagePlanId: undefined }
          : task,
      ),
    );
  };
  /** 软删除阶段的可观察结果与 SQL 相同，任务保留。 */
  const deletePlan = async (plan: StagePlan) => {
    requirePlan(plan.id, plan.updatedAt);
    setPlans((rows) => rows.filter((row) => row.id !== plan.id));
    updateTasks((rows) =>
      rows.map((task) =>
        task.stagePlanId === plan.id ? { ...task, stagePlanId: undefined } : task,
      ),
    );
  };
  return (
    <NavigationProvider
      data={{
        plans,
        loading: !hydrated,
        retry: () => undefined,
        create,
        update,
        append,
        remove,
        delete: deletePlan,
      }}
    >
      {children}
    </NavigationProvider>
  );
}
/** 云账号不会因阶段查询失败降级到本地；换号销毁整个旧会话。 */
export function StagePlansProvider(props: DataProps & { children: ReactNode }) {
  const cloud = useOptionalCloudRuntime();
  return cloud ? (
    <CloudStagePlans key={cloud.user.id}>{props.children}</CloudStagePlans>
  ) : (
    <LocalStagePlans {...props} />
  );
}
