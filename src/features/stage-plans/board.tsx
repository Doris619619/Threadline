/** @fileoverview 阶段网格、首页全部阶段及完整详情，隐藏与删除分别具有可恢复和确认语义。 */
'use client';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { CalendarRange, ArrowLeft, Pencil, Trash2, ChevronRight } from 'lucide-react';
import { CottageNavIcon } from '@/features/appearance/cottage-sprite';
import { useAccountToday } from '@/features/settings/account-timezone-provider';
import { useWorkspaceData } from '@/features/workspace/workspace-data-context';
import { ManagementDialog } from '@/components/ui/management-dialog';
import { Button } from '@/components/ui/button';
import { useGuardedAction } from '@/hooks/use-guarded-action';
import type { StagePlan } from '@/types/domain';
import { stageStatus, visibleHomeStages, type StageStatus } from './rules';
import { useStagePlans } from './state';
import { StageEditor, StageAddTask } from './editor';
import { StageSummary } from './summary';
import { StageTaskList } from './task-list';
import { PlanObjectIcon } from './object-icon';
import { StageTimeChart } from './time-chart';

/** 模块查询失败单独显示重试，避免把网络失败显示成空阶段。 */
export function StageLoadNotice() {
  const stages = useStagePlans();
  return stages.error ? (
    <p className="form-error" role="alert">
      {stages.error}{' '}
      <button type="button" onClick={stages.retry}>
        重试
      </button>
    </p>
  ) : stages.loading ? (
    <p role="status">正在读取阶段计划…</p>
  ) : null;
}

/** 列表卡片大面积打开详情，首页显示按钮独立，避免嵌套交互。 */
function StagePlanCard({ plan }: { plan: StagePlan }) {
  const stages = useStagePlans();
  const { tasks } = useWorkspaceData();
  const today = useAccountToday();
  const { busy, error, run } = useGuardedAction();
  return (
    <article
      className={'stage-plan-card' + (plan.homeVisible ? ' is-home-visible' : '')}
    >
      <button
        type="button"
        className="stage-card-main"
        data-stage-card-id={plan.id}
        onClick={() => stages.open(plan.id)}
        aria-label={'查看阶段 ' + plan.name}
      >
        <h3>
          <PlanObjectIcon name={plan.name} kind="stage" />
          {plan.name}
        </h3>
        <StageSummary plan={plan} tasks={tasks} today={today} />
        <ChevronRight className="stage-card-chevron" size={21} aria-hidden="true" />
      </button>
      <button
        className="stage-pin"
        type="button"
        aria-pressed={plan.homeVisible}
        aria-label={plan.homeVisible ? '首页显示' : '显示在首页'}
        disabled={busy}
        onClick={() =>
          void run(() => stages.update(plan, { homeVisible: !plan.homeVisible }))
        }
      >
        {plan.homeVisible ? '首页显示' : '未显示'}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
/** 进行中、即将开始与过去包含全部阶段，默认只选择进行中。 */
export function StageBoard({ onCreate }: { onCreate: () => void }) {
  const stages = useStagePlans();
  const today = useAccountToday();
  const statuses: [StageStatus, string][] = [
    ['active', '进行中'],
    ['upcoming', '即将开始'],
    ['past', '过去'],
  ];
  /** 键盘切换状态与焦点同步，未选中的 tab 不重复占据 Tab 顺序。 */
  const switchTab = (event: KeyboardEvent<HTMLButtonElement>, status: StageStatus) => {
    const index = statuses.findIndex(([value]) => value === status);
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % 3
        : event.key === 'ArrowLeft'
          ? (index + 2) % 3
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? 2
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    stages.setTab(statuses[next][0]);
    document.getElementById('stage-tab-' + statuses[next][0])?.focus();
  };
  const visible = stages.plans
    .filter(
      (plan) =>
        stageStatus(plan, today) === stages.tab &&
        plan.name.toLocaleLowerCase().includes(stages.search.toLocaleLowerCase()),
    )
    .sort((a, b) =>
      stages.tab === 'past'
        ? b.endDate.localeCompare(a.endDate)
        : a.startDate.localeCompare(b.startDate),
    );
  return (
    <section className="plan-section stage-board" aria-labelledby="stage-board-title">
      <header className="plan-section-heading">
        <div>
          <h2 id="stage-board-title">
            <CottageNavIcon name="calendar">
              <CalendarRange size={23} />
            </CottageNavIcon>
            阶段计划
          </h2>
          <p>为一段时间设定主题与任务，让重要的日子更有方向。</p>
        </div>
        <button type="button" className="plan-create-link" onClick={onCreate}>
          + 新建阶段
        </button>
      </header>
      <div className="stage-tabs" role="tablist" aria-label="阶段状态">
        {statuses.map(([status, label]) => (
          <button
            type="button"
            key={status}
            role="tab"
            aria-selected={stages.tab === status}
            tabIndex={stages.tab === status ? 0 : -1}
            aria-controls="stage-tab-panel"
            id={'stage-tab-' + status}
            onClick={() => stages.setTab(status)}
            onKeyDown={(event) => switchTab(event, status)}
          >
            {label}{' '}
            <span>
              {
                stages.plans.filter((plan) => stageStatus(plan, today) === status)
                  .length
              }
            </span>
          </button>
        ))}
      </div>
      <StageLoadNotice />
      <div
        id="stage-tab-panel"
        role="tabpanel"
        aria-labelledby={'stage-tab-' + stages.tab}
        className="stage-plan-grid"
      >
        {visible.map((plan) => (
          <StagePlanCard key={plan.id} plan={plan} />
        ))}
        {!stages.loading && !stages.error && visible.length === 0 && (
          <p className="plan-empty">
            {stages.search
              ? '没有匹配的阶段。'
              : '这里还没有阶段，先列下这段时间想完成的事。'}
          </p>
        )}
      </div>
    </section>
  );
}
/** 首页完整显示所有可见阶段；隐藏后通过明确的撤销恢复。 */
export function HomeStagePlans() {
  const stages = useStagePlans();
  const { tasks } = useWorkspaceData();
  const today = useAccountToday();
  const [undo, setUndo] = useState<StagePlan>();
  const { busy, error, run } = useGuardedAction();
  const visible = visibleHomeStages(stages.plans, today);
  /** 跨午夜自动退出首页；Toast 不自动消失，撤销可被键盘与读屏访问。 */
  const hide = (plan: StagePlan) =>
    void run(async () => {
      const saved = await stages.update(plan, { homeVisible: false });
      setUndo(saved);
    });
  if (!visible.length && !undo && !stages.loading && !stages.error && !error)
    return null;
  return (
    <section className="home-stage-plans" aria-label="首页阶段计划">
      <StageLoadNotice />
      {visible.map((plan) => (
        <article className="home-stage-card" key={plan.id} data-stage-id={plan.id}>
          <header>
            <button
              type="button"
              className="stage-title-link"
              onClick={() => stages.open(plan.id)}
            >
              <h2>{plan.name}</h2>
            </button>
            <button
              type="button"
              className="stage-hide"
              disabled={busy}
              onClick={() => hide(plan)}
            >
              从首页隐藏
            </button>
          </header>
          <StageSummary plan={plan} tasks={tasks} today={today} />
          <StageTaskList stageId={plan.id} />
        </article>
      ))}
      {undo && (
        <div className="stage-toast" role="status">
          <span>已从首页隐藏“{undo.name}”</span>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const current = stages.plans.find((plan) => plan.id === undo.id);
                if (!current) throw new Error('阶段已删除，无法撤销。');
                await stages.update(current, { homeVisible: true });
                setUndo(undefined);
              })
            }
          >
            撤销
          </button>
          <button
            type="button"
            aria-label="关闭隐藏提示"
            onClick={() => setUndo(undefined)}
          >
            ×
          </button>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** 完整详情把摘要移入标题行，时间明细与任务操作共用右侧清单；删除阶段保留原任务。 */
export function StageDetail() {
  const stages = useStagePlans();
  const { tasks, projects, saveTaskConfirmed, recordTaskActual } = useWorkspaceData();
  const today = useAccountToday();
  const plan = stages.plans.find((item) => item.id === stages.detailId);
  const [edit, setEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { busy, error, run } = useGuardedAction();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  /** 返回列表的布局提交之后恢复列表滚动和原卡片焦点。 */
  const back = () => stages.back();
  if (!plan)
    return (
      <section className="stage-detail">
        <button type="button" onClick={back}>
          返回计划
        </button>
        <StageLoadNotice />
        {!stages.loading && <p>这个阶段已删除或不可用。</p>}
      </section>
    );
  return (
    <section className="stage-detail" data-testid="stage-detail">
      <button type="button" className="stage-back" onClick={back}>
        <ArrowLeft size={18} />
        返回计划
      </button>
      <header className="stage-detail-heading">
        <h1 ref={heading} tabIndex={-1}>
          {plan.name}
        </h1>
        <StageSummary plan={plan} tasks={tasks} today={today} compact />
        <div>
          <button
            type="button"
            className="stage-pin"
            aria-pressed={plan.homeVisible}
            disabled={busy}
            onClick={() =>
              void run(() => stages.update(plan, { homeVisible: !plan.homeVisible }))
            }
          >
            {plan.homeVisible ? '首页显示' : '显示在首页'}
          </button>
          <button type="button" onClick={() => setEdit(true)}>
            <Pencil size={16} />
            编辑阶段
          </button>
          <button type="button" onClick={() => setDeleting(true)}>
            <Trash2 size={16} />
            删除阶段
          </button>
        </div>
      </header>
      <StageAddTask stageId={plan.id} projects={projects} />
      <StageTimeChart
        tasks={tasks}
        projects={projects}
        plan={plan}
        today={today}
        onSaveEstimate={(original, minutes) =>
          saveTaskConfirmed({ ...original, plannedDurationMinutes: minutes }, original)
        }
        onSaveActual={(original, minutes, date) =>
          recordTaskActual(original, minutes, date!)
        }
        renderDetails={(view) => (
          <StageTaskList stageId={plan.id} showHistory timeView={view} />
        )}
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {edit && (
        <StageEditor plan={plan} projects={projects} onClose={() => setEdit(false)} />
      )}
      {deleting && (
        <ManagementDialog
          title={'删除阶段“' + plan.name + '”？'}
          onClose={() => setDeleting(false)}
          busy={busy}
          error={error}
        >
          <p>
            只删除阶段归属，所有任务都会保留。已安排任务继续留在日程，未安排任务转为普通待安排。
          </p>
          <footer>
            <Button variant="quiet" disabled={busy} onClick={() => setDeleting(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await stages.delete(plan);
                  stages.back();
                })
              }
            >
              删除阶段，保留任务
            </Button>
          </footer>
        </ManagementDialog>
      )}
    </section>
  );
}

/** 阶段详情返回时恢复主滚动容器，防止长清单回退到错误位置。 */
export function RestorePlanScroll() {
  const stages = useStagePlans();
  const restore = useRef(stages.restoreList);
  useLayoutEffect(() => {
    restore.current();
  }, []);
  return null;
}
