/** @fileoverview 项目单选菜单：受控值、检索与键盘选择，顶层定位适配边缘和软键盘。 */
'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { Project } from '@/types/domain';
import { cn } from '@/lib/cn';
import { positionPopover } from './popover-position';

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

  /** 弹层始终留在 Dialog DOM 内，按可见视口避让；软键盘、滚动和尺寸变化均重新定位。 */
  useEffect(() => {
    if (!open) return;
    const position = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const menu = panel.current;
      if (!anchor || !menu) return;
      const visible = window.visualViewport;
      const viewport = {
        top: visible?.offsetTop ?? 0,
        left: visible?.offsetLeft ?? 0,
        height: visible?.height ?? window.innerHeight,
        width: visible?.width ?? window.innerWidth,
      };
      const width = Math.min(Math.max(anchor.width, 240), viewport.width - 24);
      menu.style.width = `${width}px`;
      menu.style.maxHeight = `${Math.max(0, Math.min(320, viewport.height - 24))}px`;
      const placement = positionPopover({
        anchor,
        viewport,
        menu: menu.getBoundingClientRect(),
        align: 'start',
        margin: 12,
        gap: 6,
      });
      Object.assign(menu.style, {
        maxHeight: `${Math.min(320, placement.maxHeight)}px`,
        left: `${placement.left}px`,
        top: `${placement.top}px`,
        bottom: 'auto',
      });
    };
    panel.current?.showPopover();
    position();
    const target = panel.current?.querySelector<HTMLElement>(
      projects.length > 7 ? 'input' : '[role="listbox"]',
    );
    target?.focus();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    const observer = new ResizeObserver(position);
    if (panel.current) observer.observe(panel.current);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
      observer.disconnect();
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
          // 输入法正在处理候选词时，方向键和 Escape 也应交给输入法。
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
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
              [next]?.scrollIntoView?.({ block: 'nearest' });
          }
          if (
            event.key === 'Enter' ||
            (event.key === ' ' && !(event.target instanceof HTMLInputElement))
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
