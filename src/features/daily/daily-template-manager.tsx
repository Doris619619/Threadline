/** @fileoverview 管理完全脱离项目的 Daily 模板和未来清单实例。 */

'use client';

import { ChevronDown, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ManagementDialog } from '@/components/ui/management-dialog';
import type { Daily } from '@/features/daily/types';

type Status = 'archive' | 'restore' | 'delete';
type DraftItem = { id: string; title: string; plannedDurationMinutes: number };
type DialogMode = 'create' | 'append' | 'edit-template' | 'edit-item';

/** 将计划分钟转换为清单与模板摘要中的统一文案。 */
function planned(minutes: number) {
  return `${minutes} 分钟`;
}

/** 以稳定 ID 将 Daily child 转换为可编辑草稿。 */
function toDraftItems(items: Daily['children']): DraftItem[] {
  return items
    .filter((item) => !item.deletedAt)
    .map((item) => ({
      id: item.templateItemId ?? item.id ?? crypto.randomUUID(),
      title: item.title,
      plannedDurationMinutes: item.plannedDurationMinutes ?? 0,
    }));
}

/** 排除终态 child；归档 child 仍必须随模板管理 payload 保留，避免被误删。 */
function retainedChildren(daily: Daily): Daily['children'] {
  return daily.children.filter((item) => !item.deletedAt);
}

/** 关闭原生 details 菜单后执行动作，避免 Dialog 打开时保留孤立的菜单浮层。 */
function closeMenuAndRun(event: MouseEvent<HTMLButtonElement>, action: () => void) {
  event.currentTarget.closest('details')?.removeAttribute('open');
  action();
}

/** 渲染模板或清单项的低频生命周期菜单。 */
function DailyMenu({
  label,
  actions,
}: {
  label: string;
  actions: readonly [string, () => void, boolean?][];
}) {
  return (
    <details className="manager-menu">
      <summary aria-label={label}>
        <MoreHorizontal size={18} />
      </summary>
      <div>
        {actions.map(([text, action, danger]) => (
          <button
            className={danger ? 'is-danger' : undefined}
            key={text}
            onClick={(event) => closeMenuAndRun(event, action)}
          >
            {text}
          </button>
        ))}
      </div>
    </details>
  );
}

/** 渲染清单草稿的名称和独立预计分钟字段。 */
function DraftItems({
  items,
  onUpdate,
  onRemove,
  onAdd,
  single = false,
  initialFocus = false,
}: {
  items: DraftItem[];
  onUpdate: (id: string, change: Partial<DraftItem>) => void;
  onRemove: (id: string) => void;
  onAdd?: () => void;
  single?: boolean;
  initialFocus?: boolean;
}) {
  return (
    <div className="daily-draft-items">
      {items.map((item, index) => (
        <div className="daily-draft-row" key={item.id}>
          <Input
            aria-label={single ? '清单项名称' : `清单项名称 ${index + 1}`}
            data-management-initial-focus={
              initialFocus && index === 0 ? true : undefined
            }
            value={item.title}
            onChange={(event) => onUpdate(item.id, { title: event.target.value })}
            placeholder="清单项名称"
          />
          <Input
            aria-label={single ? '预计时间' : `预计时间 ${index + 1}`}
            type="number"
            min="0"
            value={item.plannedDurationMinutes || ''}
            onChange={(event) =>
              onUpdate(item.id, {
                plannedDurationMinutes: Math.max(0, Number(event.target.value)),
              })
            }
            placeholder="预计分钟"
          />
          {!single && (
            <button
              aria-label={`删除清单项 ${index + 1}`}
              className="daily-draft-remove"
              onClick={() => onRemove(item.id)}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ))}
      {onAdd && (
        <button className="manager-inline-action" onClick={onAdd}>
          + 添加清单项
        </button>
      )}
    </div>
  );
}

/** 渲染 Daily 模板管理区；这里不显示任何执行态、实际耗时或项目归属。 */
export function DailyTemplateManager({
  items,
  onCreate,
  onSave,
  onSetStatus,
  onSetItemStatus,
}: {
  items: Daily[];
  onCreate: (daily: Daily) => Promise<void>;
  onSave: (daily: Daily) => Promise<void>;
  onSetStatus: (id: string, status: Status) => Promise<void>;
  onSetItemStatus: (id: string, status: Status) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<DialogMode>();
  const [targetId, setTargetId] = useState('');
  const [title, setTitle] = useState('');
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [error, setError] = useState<string>();
  const visible = items.filter((item) => !item.deletedAt);
  const activeTemplates = visible.filter((item) => item.active !== false);
  // 编辑既有模板/清单项只要求未删除；追加新清单项必须限制在 active 模板。
  const editableTarget = visible.find((item) => item.id === targetId);
  const appendTarget = activeTemplates.find((item) => item.id === targetId);
  /** 运行异步生命周期或保存命令并保留错误给用户。 */
  const run = async (action: () => Promise<void>) => {
    try {
      setError(undefined);
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败，请重试。');
    }
  };
  /** 清理草稿并关闭当前对话框。 */
  const close = () => {
    setMode(undefined);
    setTargetId('');
    setTitle('');
    setDraftItems([]);
  };
  /** 打开新建模式；空数组明确代表允许 0 项清单。 */
  const openCreate = () => {
    setMode('create');
    setTitle('');
    setDraftItems([]);
  };
  /** 打开“添加到已有 Daily”模式并预选触发来源。 */
  const openAppend = (dailyId = activeTemplates[0]?.id ?? '') => {
    if (!dailyId) {
      setError('没有可添加清单项的 Daily，请先新建或恢复一个 Daily。');
      return;
    }
    setMode('append');
    setTargetId(dailyId);
    setTitle('');
    setDraftItems([{ id: crypto.randomUUID(), title: '', plannedDurationMinutes: 0 }]);
  };
  /** 打开模板编辑模式，保留非删除清单项以免编辑时误删除归档项。 */
  const openTemplateEdit = (daily: Daily) => {
    setMode('edit-template');
    setTargetId(daily.id);
    setTitle(daily.title);
    setDraftItems(toDraftItems(daily.children));
  };
  /** 打开单个清单项编辑模式。 */
  const openItemEdit = (daily: Daily, item: Daily['children'][number]) => {
    setMode('edit-item');
    setTargetId(daily.id);
    setTitle(item.title);
    setDraftItems([
      {
        id: item.templateItemId ?? item.id ?? crypto.randomUUID(),
        title: item.title,
        plannedDurationMinutes: item.plannedDurationMinutes ?? 0,
      },
    ]);
  };
  /** 添加空的预计清单草稿，创建模式因此支持 0 至 N 项。 */
  const addDraftItem = () =>
    setDraftItems((current) => [
      ...current,
      { id: crypto.randomUUID(), title: '', plannedDurationMinutes: 0 },
    ]);
  /** 修改一个草稿项的字段。 */
  const updateDraftItem = (id: string, change: Partial<DraftItem>) =>
    setDraftItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...change } : item)),
    );
  /** 将草稿转换为长期模板项，拒绝不完整项以防写入无标题数据。 */
  const normalizeDraftItems = () => {
    if (draftItems.some((item) => !item.title.trim()))
      throw new Error('每个清单项都需要名称。');
    return draftItems.map((item) => ({
      id: item.id,
      templateItemId: item.id,
      title: item.title.trim(),
      plannedDurationMinutes: Math.max(0, item.plannedDurationMinutes),
      completed: false,
      actual: 0,
    }));
  };
  /** 根据显式模式原子创建、追加或更新模板结构。 */
  const submit = () =>
    void run(async () => {
      if (mode === 'create') {
        if (!title.trim()) throw new Error('请输入 Daily 名称。');
        await onCreate({
          id: crypto.randomUUID(),
          title: title.trim(),
          actual: 0,
          result: '',
          completed: false,
          active: true,
          children: normalizeDraftItems(),
        });
      } else if (mode === 'append') {
        if (!appendTarget) throw new Error('请选择要添加的 Daily。');
        const [newItem] = normalizeDraftItems();
        await onSave({
          ...appendTarget,
          children: [...retainedChildren(appendTarget), newItem],
        });
      } else if (mode === 'edit-template') {
        if (!editableTarget || !title.trim()) throw new Error('请输入 Daily 名称。');
        await onSave({
          ...editableTarget,
          title: title.trim(),
          children: normalizeDraftItems(),
        });
      } else if (mode === 'edit-item') {
        if (!editableTarget) throw new Error('未找到要修改的清单项。');
        const [nextItem] = normalizeDraftItems();
        await onSave({
          ...editableTarget,
          children: retainedChildren(editableTarget).map((item) =>
            (item.templateItemId ?? item.id) === nextItem.templateItemId
              ? { ...item, ...nextItem }
              : item,
          ),
        });
      }
      close();
    });
  return (
    <section
      className="manager-section"
      aria-labelledby="daily-template-manager-heading"
    >
      <div className="manager-section-heading">
        <h2 id="daily-template-manager-heading">Daily</h2>
        <Button size="compact" onClick={openCreate}>
          <Plus size={15} /> 新建 Daily
        </Button>
      </div>
      <div className="manager-list">
        {visible.map((daily) => {
          const activeItems = daily.children.filter(
            (item) => !item.deletedAt && item.active !== false,
          );
          const total = activeItems.reduce(
            (sum, item) => sum + (item.plannedDurationMinutes ?? 0),
            0,
          );
          const isExpanded = Boolean(expanded[daily.id]);
          return (
            <div className="daily-manager-row" key={daily.id}>
              <div className="daily-manager-head">
                <button
                  className="daily-disclosure"
                  aria-expanded={isExpanded}
                  onClick={() =>
                    setExpanded((current) => ({
                      ...current,
                      [daily.id]: !current[daily.id],
                    }))
                  }
                >
                  <ChevronDown size={16} />
                  <span>{daily.title}</span>
                </button>
                <span className="manager-status">
                  {daily.active === false
                    ? '已归档'
                    : `${activeItems.length} 项 · ${planned(total)}`}
                </span>
                <DailyMenu
                  label={`${daily.title}操作`}
                  actions={[
                    ['修改', () => openTemplateEdit(daily)],
                    [
                      daily.active === false ? '恢复' : '归档',
                      () =>
                        void run(() =>
                          onSetStatus(
                            daily.id,
                            daily.active === false ? 'restore' : 'archive',
                          ),
                        ),
                    ],
                    [
                      '删除',
                      () => void run(() => onSetStatus(daily.id, 'delete')),
                      true,
                    ],
                  ]}
                />
              </div>
              {isExpanded && (
                <div className="daily-manager-items">
                  {daily.children
                    .filter((item) => !item.deletedAt)
                    .map((item) => {
                      const itemId = item.templateItemId ?? item.id;
                      if (!itemId) return null;
                      return (
                        <div className="daily-manager-item" key={itemId}>
                          <span>{item.title}</span>
                          <span>
                            {item.active === false
                              ? '已归档'
                              : planned(item.plannedDurationMinutes ?? 0)}
                          </span>
                          <DailyMenu
                            label={`${item.title}操作`}
                            actions={[
                              ['修改', () => openItemEdit(daily, item)],
                              [
                                item.active === false ? '恢复' : '归档',
                                () =>
                                  void run(() =>
                                    onSetItemStatus(
                                      itemId,
                                      item.active === false ? 'restore' : 'archive',
                                    ),
                                  ),
                              ],
                              [
                                '删除',
                                () => void run(() => onSetItemStatus(itemId, 'delete')),
                                true,
                              ],
                            ]}
                          />
                        </div>
                      );
                    })}
                  {daily.active !== false && (
                    <button
                      className="manager-inline-action"
                      onClick={() => openAppend(daily.id)}
                    >
                      + 添加清单项
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {mode && (
        <ManagementDialog
          onClose={close}
          title={
            mode === 'create'
              ? '新建 Daily'
              : mode === 'append'
                ? '添加到已有 Daily'
                : mode === 'edit-template'
                  ? '修改 Daily'
                  : '修改清单项'
          }
        >
          {(mode === 'create' || mode === 'append') && (
            <div
              className="daily-mode-switch"
              role="tablist"
              aria-label="Daily 创建方式"
            >
              <button aria-selected={mode === 'create'} role="tab" onClick={openCreate}>
                新建 Daily
              </button>
              <button
                disabled={activeTemplates.length === 0}
                aria-selected={mode === 'append'}
                role="tab"
                onClick={() => openAppend()}
              >
                添加到已有 Daily
              </button>
            </div>
          )}
          {mode === 'append' ? (
            <>
              <label>
                选择 Daily
                <select
                  aria-label="选择已有 Daily"
                  data-management-initial-focus
                  value={targetId}
                  onChange={(event) => setTargetId(event.target.value)}
                >
                  <option value="">请选择</option>
                  {activeTemplates.map((daily) => (
                    <option key={daily.id} value={daily.id}>
                      {daily.title}
                    </option>
                  ))}
                </select>
              </label>
              <DraftItems
                items={draftItems}
                onUpdate={updateDraftItem}
                onRemove={() => undefined}
                single
              />
            </>
          ) : (
            <>
              {mode !== 'edit-item' && (
                <Input
                  aria-label="Daily 名称"
                  data-management-initial-focus
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Daily 名称"
                />
              )}
              {(mode === 'create' || mode === 'edit-template') && (
                <DraftItems
                  items={draftItems}
                  onUpdate={updateDraftItem}
                  onRemove={(id) =>
                    setDraftItems((current) => current.filter((item) => item.id !== id))
                  }
                  onAdd={
                    mode === 'create' || editableTarget?.active !== false
                      ? addDraftItem
                      : undefined
                  }
                />
              )}
              {mode === 'edit-item' && (
                <DraftItems
                  items={draftItems}
                  onUpdate={updateDraftItem}
                  onRemove={() => undefined}
                  single
                  initialFocus
                />
              )}
            </>
          )}
          <footer>
            <Button variant="quiet" onClick={close}>
              取消
            </Button>
            <Button onClick={submit}>{mode === 'create' ? '创建' : '保存'}</Button>
          </footer>
        </ManagementDialog>
      )}
      {error && (
        <p className="workspace-sync-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
