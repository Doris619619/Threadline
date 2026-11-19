/** @fileoverview 验证侧栏当前页语义随导航状态迁移，不让过期的aria-current留在旧入口。 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { SidebarItem } from '@/components/ui/sidebar-item';

afterEach(cleanup);

test('moves the current-page announcement with the active navigation item', () => {
  const { rerender } = render(
    <>
      <SidebarItem active>首页</SidebarItem>
      <SidebarItem>计划</SidebarItem>
    </>,
  );
  expect(
    screen.getByRole('button', { name: '首页', current: 'page' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '计划' })).not.toHaveAttribute(
    'aria-current',
  );
  rerender(
    <>
      <SidebarItem>首页</SidebarItem>
      <SidebarItem active>计划</SidebarItem>
    </>,
  );
  expect(screen.getByRole('button', { name: '首页' })).not.toHaveAttribute(
    'aria-current',
  );
  expect(
    screen.getByRole('button', { name: '计划', current: 'page' }),
  ).toBeInTheDocument();
});
