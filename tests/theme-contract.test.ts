/** @fileoverview 锁定共享蓝色主题与 Calendar 热力 token 的使用契约。 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectFile = (path: string) => resolve(import.meta.dirname, '..', path);

describe('theme contract', () => {
  /** 根文档必须激活当前唯一的 blue theme map，避免 token 仅定义未生效。 */
  it('activates the shared blue theme at the root document', () => {
    expect(readFileSync(projectFile('src/app/root-document.tsx'), 'utf8')).toContain(
      'data-theme="blue"',
    );
  });

  /** 月历所有有数据的 heat 档位只能消费主题 token，不保留固定绿色。 */
  it('maps every Calendar heat level through named theme tokens', () => {
    const tokens = readFileSync(projectFile('src/styles/tokens.css'), 'utf8');
    const calendar = readFileSync(
      projectFile('src/features/calendar/calendar.css'),
      'utf8',
    );
    for (const level of [1, 2, 3, 4]) {
      expect(tokens).toContain(`--calendar-heat-${level}:`);
      expect(tokens).toContain(`--calendar-heat-text-${level}:`);
      expect(calendar).toContain(`var(--calendar-heat-${level})`);
      expect(calendar).toContain(`var(--calendar-heat-text-${level})`);
    }
    expect(calendar).not.toMatch(/#(?:16a34a|22c55e|15803d|166534)/i);
  });
});
