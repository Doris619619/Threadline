/** @fileoverview 管理完全脱离项目的 Daily 模板和未来清单实例。 */

'use client';

import { ChevronDown, Circle, Plus, Trash2 } from 'lucide-react';
import { forwardRef, useImperativeHandle, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ManagementDialog } from '@/components/ui/management-dialog';
import type { Daily } from '@/features/daily/types';

type Status = 'archive' | 'restore' | 'delete';
type DraftItem = { id: string; title: string; plannedDurationMinutes: number };
type DialogMode =
  | 'create'
  | 'append'
  | 'manage-template'
  | 'manage-item'
  | 'edit-template'
  | 'edit-item';
type DailyTemplateManagerProps = {
  items: Daily[];
  onCreate: (daily: Daily) => Promise<void>;
  onSave: (daily: Daily) => Promise<void>;
  onSetStatus: (id: string, status: Status) => Promise<void>;
  onSetItemStatus: (id: string, status: Status) => Promise<void>;
};

/** 暴露 Daily 创建入口给项目页头，仍由本组件维护模板草稿和保存规则。 */
export type DailyTemplateManagerHandle = { openCreate: () => void };

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
export const DailyTemplateManager = forwardRef<
  DailyTemplateManagerHandle,
  DailyTemplateManagerProps
>(function DailyTemplateManager(
  { items, onCreate, onSave, onSetStatus, onSetItemStatus },
  ref,
) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<DialogMode>();
  const [targetId, setTargetId] = useState('');
  const [targetItemId, setTargetItemId] = useState('');
  const [title, setTitle] = useState('');
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [error, setError] = useState<string>();
  const visible = items.filter((item) => !item.deletedAt);
  const activeTemplates = visible.filter((item) => item.active !== false);
  // 编辑既有模板/清单项只要求未删除；追加新清单项必须限制在 active 模板。
  const editableTarget = visible.find((item) => item.id === targetId);
  const appendTarget = activeTemplates.find((item) => item.id === targetId);
  const managedItem = editableTarget?.children.find(
    (item) => !item.deletedAt && (item.templateItemId ?? item.id) === targetItemId,
  );
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
    setTargetItemId('');
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
  /** 打开 Daily 生命周期 sheet；默认列表不再为低频操作预留省略号列。 */
  const openTemplateManage = (daily: Daily) => {
    setMode('manage-template');
    setTargetId(daily.id);
    setTargetItemId('');
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
  /** 打开清单项生命周期 sheet；清单主行保持类似 iOS inset list 的干净信息层级。 */
  const openItemManage = (daily: Daily, itemId: string) => {
    setMode('manage-item');
    setTargetId(daily.id);
    setTargetItemId(itemId);
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
  /** 执行模板或清单项的低频生命周期操作；成功后关闭管理 sheet。 */
  const runManagementAction = (action: () => Promise<void>) =>
    void run(async () => {
      await action();
      close();
    });

  /** 将现有 Daily 创建流程以受限 handle 交给项目页唯一入口调用。 */
  useImperativeHandle(ref, () => ({ openCreate }));

  return (
    <section
      className="manager-section"
      aria-labelledby="daily-template-manager-heading"
    >
      <div className="manager-section-heading">
        <h2 id="daily-template-manager-heading">
          Daily <span>{visible.length}</span>
        </h2>
      </div>
      <div className="manager-card manager-card--daily">
        <div className="manager-list manager-list--daily">
          {visible.map((daily) => {
            const activeItems = daily.children.filter(
              (item) => !item.deletedAt && item.active !== false,
            );
            const visibleItems = daily.children.filter((item) => !item.deletedAt);
            const total = activeItems.reduce(
              (sum, item) => sum + (item.plannedDurationMinutes ?? 0),
              0,
            );
            const isExpanded = expanded[daily.id] ?? daily.id === visible[0]?.id;
            return (
              <div className="daily-manager-row" key={daily.id}>
                <div className="daily-manager-head">
                  <button
                    aria-haspopup="dialog"
                    aria-label={`管理 Daily ${daily.title}`}
                    className="daily-disclosure"
                    onClick={() => openTemplateManage(daily)}
                    type="button"
                  >
                    <span aria-hidden="true" className="daily-template-dot" />
                    <span>{daily.title}</span>
                    <span className="manager-status">
                      {daily.active === false
                        ? '已归档'
                        : `${activeItems.length} 项 · ${planned(total)}`}
                    </span>
                  </button>
                  <button
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? '收起' : '展开'} ${daily.title}`}
                    className="daily-expand-button"
                    onClick={() =>
                      setExpanded((current) => ({
                        ...current,
                        [daily.id]: !(current[daily.id] ?? daily.id === visible[0]?.id),
                      }))
                    }
                    type="button"
                  >
                    <ChevronDown aria-hidden="true" size={18} />
                  </button>
                </div>
                {isExpanded && (
                  <div className="daily-manager-items">
                    {visibleItems.length > 0 && (
                      <div className="daily-manager-inset">
                        {visibleItems.map((item) => {
                          const itemId = item.templateItemId ?? item.id;
                          if (!itemId) return null;
                          return (
                            <button
                              aria-haspopup="dialog"
                              aria-label={`管理清单项 ${item.title}`}
                              className="daily-manager-item"
                              key={itemId}
                              onClick={() => openItemManage(daily, itemId)}
                              type="button"
                            >
                              <Circle aria-hidden="true" size={20} strokeWidth={1.6} />
                              <span>{item.title}</span>
                              <span>
                                {item.active === false
                                  ? '已归档'
                                  : planned(item.plannedDurationMinutes ?? 0)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {daily.active !== false && (
                      <button
                        className="manager-inline-action"
                        onClick={() => openAppend(daily.id)}
                        type="button"
                      >
                        <Plus aria-hidden="true" size={20} strokeWidth={1.8} />
                        添加清单项
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {mode && (
        <ManagementDialog
          key={mode}
          onClose={close}
          title={
            mode === 'create'
              ? '新建 Daily'
              : mode === 'append'
                ? '添加到已有 Daily'
                : mode === 'manage-template'
                  ? (editableTarget?.title ?? '管理 Daily')
                  : mode === 'manage-item'
                    ? (managedItem?.title ?? '管理清单项')
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
          {mode === 'manage-template' && editableTarget ? (
            <div className="manager-action-list">
              <Button
                data-management-initial-focus
                variant="quiet"
                onClick={() => openTemplateEdit(editableTarget)}
              >
                修改 Daily
              </Button>
              <Button
                variant="quiet"
                onClick={() =>
                  runManagementAction(() =>
                    onSetStatus(
                      editableTarget.id,
                      editableTarget.active === false ? 'restore' : 'archive',
                    ),
                  )
                }
              >
                {editableTarget.active === false ? '恢复 Daily' : '归档 Daily'}
              </Button>
              <Button
                variant="danger"
                onClick={() =>
                  runManagementAction(() => onSetStatus(editableTarget.id, 'delete'))
                }
              >
                删除 Daily
              </Button>
            </div>
          ) : mode === 'manage-item' && editableTarget && managedItem ? (
            <div className="manager-action-list">
              <Button
                data-management-initial-focus
                variant="quiet"
                onClick={() => openItemEdit(editableTarget, managedItem)}
              >
                修改清单项
              </Button>
              <Button
                variant="quiet"
                onClick={() =>
                  runManagementAction(() =>
                    onSetItemStatus(
                      targetItemId,
                      managedItem.active === false ? 'restore' : 'archive',
                    ),
                  )
                }
              >
                {managedItem.active === false ? '恢复清单项' : '归档清单项'}
              </Button>
              <Button
                variant="danger"
                onClick={() =>
                  runManagementAction(() => onSetItemStatus(targetItemId, 'delete'))
                }
              >
                删除清单项
              </Button>
            </div>
          ) : mode === 'append' ? (
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
          {mode !== 'manage-template' && mode !== 'manage-item' && (
            <footer>
              <Button variant="quiet" onClick={close}>
                取消
              </Button>
              <Button onClick={submit}>{mode === 'create' ? '创建' : '保存'}</Button>
            </footer>
          )}
        </ManagementDialog>
      )}
      {error && (
        <p className="workspace-sync-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
});
