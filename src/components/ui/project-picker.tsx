/** @fileoverview 项目单选菜单：受控值、表单提交、键盘选择与弹窗内顶层定位。 */
'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { Project } from '@/types/domain';
import { cn } from '@/lib/cn';

type ProjectPickerProps = {
  projects: Project[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  name?: string;
  disabled?: boolean;
  compact?: boolean;
};

/** 选项由调用方过滤；popover 留在 Dialog DOM 内，避免焦点陷阱与滚动裁切冲突。 */
export function ProjectPicker({
  projects,
  value,
  onChange,
  label,
  name,
  disabled,
  compact,
}: ProjectPickerProps) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const selected = projects.find((project) => project.id === value);
  const options = projects.filter((project) =>
    project.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );

  /** 每次打开按视口剩余空间选择方向；滚动和窗口变化时重新定位。 */
  useEffect(() => {
    if (!open) return;
    const position = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const menu = panel.current;
      if (!anchor || !menu) return;
      const width = Math.min(Math.max(anchor.width, 240), window.innerWidth - 24);
      const below = window.innerHeight - anchor.bottom - 12;
      const above = anchor.top - 12;
      const upward = below < 260 && above > below;
      const height = Math.min(320, upward ? above : below);
      Object.assign(menu.style, {
        width: `${width}px`,
        maxHeight: `${Math.max(80, height)}px`,
        left: `${Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12))}px`,
        top: upward ? 'auto' : `${anchor.bottom + 6}px`,
        bottom: upward ? `${window.innerHeight - anchor.top + 6}px` : 'auto',
      });
    };
    position();
    panel.current?.showPopover();
    const target = panel.current?.querySelector<HTMLElement>(
      projects.length > 7 ? 'input' : '[role="listbox"]',
    );
    target?.focus();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open, projects.length]);

  /** 菜单关闭后恢复触发器；Tab 使用原有 Dialog 顺序继续导航。 */
  const close = () => {
    panel.current?.hidePopover();
    setOpen(false);
    trigger.current?.focus();
  };
  /** 只更新项目 ID，不提交所属表单或修改其他草稿。 */
  const choose = (projectId: string) => {
    onChange(projectId);
    close();
  };

  return (
    <span className={cn('project-picker', compact && 'project-picker--compact')}>
      {name && <input type="hidden" name={name} value={value} disabled={disabled} />}
      <button
        ref={trigger}
        type="button"
        className="project-picker-trigger"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="listbox"
        disabled={disabled || !projects.length}
        title={selected?.name}
        onClick={() => {
          if (open) close();
          else {
            setQuery('');
            setActive(
              Math.max(
                0,
                projects.findIndex((project) => project.id === value),
              ),
            );
            setOpen(true);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setQuery('');
            setActive(
              Math.max(
                0,
                projects.findIndex((project) => project.id === value),
              ),
            );
            setOpen(true);
          }
        }}
      >
        <i
          aria-hidden="true"
          style={
            { '--project-color': selected?.color ?? 'var(--accent)' } as CSSProperties
          }
        />
        <span>{selected?.name ?? '选择项目'}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <div
        ref={panel}
        popover="auto"
        hidden={!open}
        className="project-picker-menu"
        onToggle={(event) => {
          if (event.newState === 'closed') setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
          if (event.key === 'Tab') close();
          if (
            ['ArrowDown', 'ArrowUp'].includes(event.key) ||
            (!(event.target instanceof HTMLInputElement) &&
              ['Home', 'End'].includes(event.key))
          ) {
            event.preventDefault();
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? options.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        options.length - 1,
                        active + (event.key === 'ArrowDown' ? 1 : -1),
                      ),
                    );
            setActive(next);
            panel.current
              ?.querySelectorAll('[role="option"]')
              [next]?.scrollIntoView({ block: 'nearest' });
          }
          if (
            event.key === 'Enter' &&
            !event.nativeEvent.isComposing &&
            event.keyCode !== 229
          ) {
            event.preventDefault();
            event.stopPropagation();
            if (options[active]) choose(options[active].id);
          }
        }}
      >
        {projects.length > 7 && (
          <div className="project-picker-search">
            <Search size={16} aria-hidden="true" />
            <input
              aria-label="搜索项目"
              role="combobox"
              aria-expanded={open}
              aria-autocomplete="list"
              placeholder="搜索项目…"
              value={query}
              aria-controls={id}
              aria-activedescendant={options[active] ? `${id}-${active}` : undefined}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
            />
          </div>
        )}
        <div
          id={id}
          role="listbox"
          tabIndex={-1}
          aria-label={`${label}选项`}
          aria-activedescendant={options[active] ? `${id}-${active}` : undefined}
        >
          {options.map((project, index) => (
            <div
              key={project.id}
              id={`${id}-${index}`}
              role="option"
              aria-selected={project.id === value}
              data-active={index === active}
              onPointerMove={() => setActive(index)}
              onClick={() => choose(project.id)}
            >
              <i
                aria-hidden="true"
                style={{ '--project-color': project.color } as CSSProperties}
              />
              <span>{project.name}</span>
              {project.id === value && <Check size={16} aria-hidden="true" />}
            </div>
          ))}
          {!options.length && <p className="project-picker-empty">没有匹配的项目</p>}
        </div>
      </div>
    </span>
  );
}
