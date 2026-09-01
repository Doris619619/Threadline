/** @fileoverview 将项目与完全脱离项目的 Daily 模板置于同一轻量管理界面。 */

'use client';

import { ChevronDown, MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Daily } from '@/features/daily/types';
import { getLocalDateKey } from '@/lib/local-date';
import type { Project } from '@/types/domain';

type Status = 'archive' | 'restore' | 'delete';

/** 将预计分钟转换为管理列表中的紧凑文案。 */
function planned(minutes: number) {
  return `${minutes} 分钟`;
}

/** 渲染项目和 Daily 模板管理页；全部写操作由父级传入的云端命令执行。 */
export function ProjectPanel({
  items,
  dailyTemplates,
  onCreateProject,
  onUpdateProject,
  onSetProjectArchived,
  onDeleteProject,
  onCreateDaily,
  onSaveDaily,
  onSetDailyStatus,
  onSetDailyItemStatus,
}: {
  items: Project[];
  dailyTemplates: Daily[];
  onCreateProject: (project: Project) => Promise<unknown>;
  onUpdateProject: (id: string, name: string, color: string) => Promise<void>;
  onSetProjectArchived: (id: string, archived: boolean) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
  onCreateDaily: (daily: Daily) => Promise<void>;
  onSaveDaily: (daily: Daily) => Promise<void>;
  onSetDailyStatus: (id: string, status: Status) => Promise<void>;
  onSetDailyItemStatus: (id: string, status: Status) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3979e8');
  const [dailyOpen, setDailyOpen] = useState(false);
  const [dailyName, setDailyName] = useState('');
  const [itemName, setItemName] = useState('');
  const [minutes, setMinutes] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string>();
  /** 执行管理命令，并在当前页面保留失败原因。 */
  const run = async (action: () => Promise<void>) => {
    try {
      setError(undefined);
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败，请重试。');
    }
  };
  /** 创建项目只写名称与识别色。 */
  const createProject = () =>
    void run(async () => {
      if (!name.trim()) throw new Error('请输入项目名称。');
      await onCreateProject({
        id: crypto.randomUUID(),
        name: name.trim(),
        color,
        status: 'active',
        position: Math.max(-1, ...items.map((item) => item.position ?? -1)) + 1,
        createdAt: getLocalDateKey(),
      });
      setName('');
    });
  /** 原子创建 Daily 父模板和可选首个计划清单项。 */
  const createDaily = () =>
    void run(async () => {
      if (!dailyName.trim()) throw new Error('请输入 Daily 名称。');
      await onCreateDaily({
        id: crypto.randomUUID(),
        title: dailyName.trim(),
        actual: 0,
        result: '',
        completed: false,
        active: true,
        children: itemName.trim()
          ? [
              {
                id: crypto.randomUUID(),
                title: itemName.trim(),
                plannedDurationMinutes: minutes,
                completed: false,
                actual: 0,
              },
            ]
          : [],
      });
      setDailyName('');
      setItemName('');
      setMinutes(0);
      setDailyOpen(false);
    });
  return (
    <section className="project-panel" data-testid="project-panel">
      <header className="manager-heading">
        <h1>项目</h1>
        <p>管理项目与 Daily 模板。</p>
      </header>
      <section className="manager-section">
        <div className="manager-section-heading">
          <h2>项目</h2>
          <div className="manager-create">
            <Input
              aria-label="新项目名称"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="项目名称"
            />
            <input
              aria-label="项目颜色"
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
            <Button size="compact" onClick={createProject}>
              <Plus size={15} /> 新建项目
            </Button>
          </div>
        </div>
        <div className="manager-list">
          {items.map((project) => (
            <div className="manager-row" key={project.id}>
              <span
                className="project-dot"
                style={{ backgroundColor: project.color }}
              />
              <span className="manager-primary">{project.name}</span>
              <span className="manager-status">
                {project.isFallback
                  ? '默认项目'
                  : project.status === 'archived'
                    ? '已归档'
                    : '活跃'}
              </span>
              {!project.isFallback && (
                <Menu
                  label={`${project.name}操作`}
                  actions={[
                    [
                      '修改',
                      () => {
                        const next = window.prompt('项目名称', project.name);
                        if (next?.trim())
                          void run(() =>
                            onUpdateProject(project.id, next.trim(), project.color),
                          );
                      },
                    ],
                    [
                      project.status === 'active' ? '归档' : '恢复',
                      () =>
                        void run(() =>
                          onSetProjectArchived(project.id, project.status === 'active'),
                        ),
                    ],
                    [
                      '删除',
                      () => {
                        if (
                          window.confirm(
                            `删除“${project.name}”会迁移当前有效任务到默认项目，历史账本不变。`,
                          )
                        )
                          void run(() => onDeleteProject(project.id));
                      },
                      'danger',
                    ],
                  ]}
                />
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="manager-section">
        <div className="manager-section-heading">
          <h2>Daily</h2>
          <Button size="compact" onClick={() => setDailyOpen(true)}>
            <Plus size={15} /> 新建 Daily
          </Button>
        </div>
        <div className="manager-list">
          {dailyTemplates
            .filter((daily) => !daily.deletedAt)
            .map((daily) => (
              <DailyTemplateRow
                key={daily.id}
                daily={daily}
                expanded={Boolean(expanded[daily.id])}
                onToggle={() =>
                  setExpanded({ ...expanded, [daily.id]: !expanded[daily.id] })
                }
                onSave={(next) => void run(() => onSaveDaily(next))}
                onStatus={(status) =>
                  void run(() => onSetDailyStatus(daily.id, status))
                }
                onItemStatus={(id, status) =>
                  void run(() => onSetDailyItemStatus(id, status))
                }
              />
            ))}
        </div>
      </section>
      {dailyOpen && (
        <div className="manager-dialog-backdrop">
          <section className="manager-dialog" role="dialog" aria-modal="true">
            <header>
              <h2>新建 Daily</h2>
              <button aria-label="关闭" onClick={() => setDailyOpen(false)}>
                ×
              </button>
            </header>
            <Input
              aria-label="Daily 名称"
              value={dailyName}
              onChange={(event) => setDailyName(event.target.value)}
              placeholder="Daily 名称"
            />
            <div className="daily-draft-row">
              <Input
                aria-label="清单项名称"
                value={itemName}
                onChange={(event) => setItemName(event.target.value)}
                placeholder="清单项名称（可选）"
              />
              <Input
                aria-label="预计时间"
                type="number"
                min="0"
                value={minutes || ''}
                onChange={(event) => setMinutes(Number(event.target.value))}
                placeholder="预计分钟"
              />
            </div>
            <footer>
              <Button variant="quiet" onClick={() => setDailyOpen(false)}>
                取消
              </Button>
              <Button onClick={createDaily}>创建</Button>
            </footer>
          </section>
        </div>
      )}
      {error && (
        <p className="workspace-sync-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** 渲染低频操作菜单，删除仅在显式展开菜单后出现。 */
function Menu({
  label,
  actions,
}: {
  label: string;
  actions: [string, () => void, 'danger'?][];
}) {
  return (
    <details className="manager-menu">
      <summary aria-label={label}>
        <MoreHorizontal size={18} />
      </summary>
      <div>
        {actions.map(([text, action, tone]) => (
          <button
            key={text}
            className={tone === 'danger' ? 'is-danger' : undefined}
            onClick={action}
          >
            {text}
          </button>
        ))}
      </div>
    </details>
  );
}

/** 渲染可展开的 Daily 模板；本页绝不展示实际、结果或完成 checkbox。 */
function DailyTemplateRow({
  daily,
  expanded,
  onToggle,
  onSave,
  onStatus,
  onItemStatus,
}: {
  daily: Daily;
  expanded: boolean;
  onToggle: () => void;
  onSave: (daily: Daily) => void;
  onStatus: (status: Status) => void;
  onItemStatus: (id: string, status: Status) => void;
}) {
  const items = daily.children.filter(
    (item) => !item.deletedAt && item.active !== false,
  );
  const total = items.reduce(
    (sum, item) => sum + (item.plannedDurationMinutes ?? 0),
    0,
  );
  return (
    <div className="daily-manager-row">
      <div className="daily-manager-head">
        <button
          className="daily-disclosure"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          <ChevronDown size={16} />
          <span>{daily.title}</span>
        </button>
        <span className="manager-status">
          {daily.active === false ? '已归档' : `${items.length} 项 · ${planned(total)}`}
        </span>
        <Menu
          label={`${daily.title}操作`}
          actions={[
            [
              '修改',
              () => {
                const title = window.prompt('Daily 名称', daily.title);
                if (title?.trim()) onSave({ ...daily, title: title.trim() });
              },
            ],
            [
              daily.active === false ? '恢复' : '归档',
              () => onStatus(daily.active === false ? 'restore' : 'archive'),
            ],
            ['删除', () => onStatus('delete'), 'danger'],
          ]}
        />
      </div>
      {expanded && (
        <div className="daily-manager-items">
          {items.map((item) => (
            <div className="daily-manager-item" key={item.templateItemId ?? item.id}>
              <span>{item.title}</span>
              <span>{planned(item.plannedDurationMinutes ?? 0)}</span>
              {item.templateItemId && (
                <Menu
                  label={`${item.title}操作`}
                  actions={[
                    [
                      '修改',
                      () => {
                        const title = window.prompt('清单项名称', item.title);
                        if (title?.trim())
                          onSave({
                            ...daily,
                            children: daily.children.map((value) =>
                              value.templateItemId === item.templateItemId
                                ? { ...value, title: title.trim() }
                                : value,
                            ),
                          });
                      },
                    ],
                    ['归档', () => onItemStatus(item.templateItemId!, 'archive')],
                    [
                      '删除',
                      () => onItemStatus(item.templateItemId!, 'delete'),
                      'danger',
                    ],
                  ]}
                />
              )}
            </div>
          ))}
          <button
            className="manager-inline-action"
            onClick={() => {
              const title = window.prompt('清单项名称');
              if (title?.trim())
                onSave({
                  ...daily,
                  children: [
                    ...daily.children,
                    {
                      id: crypto.randomUUID(),
                      title: title.trim(),
                      plannedDurationMinutes: 0,
                      completed: false,
                      actual: 0,
                    },
                  ],
                });
            }}
          >
            + 添加清单项
          </button>
        </div>
      )}
    </div>
  );
}
