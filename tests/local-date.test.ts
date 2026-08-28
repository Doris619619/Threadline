/** @fileoverview 验证 Threadline 业务日期始终以运行环境的本地日历而非 UTC ISO 表示。 */

import { describe, expect, it } from 'vitest';
import {
  addLocalDateDays,
  getLocalDateKey,
  getLocalDateKeyFromTimestamp,
  parseLocalDateKey,
} from '@/lib/local-date';
import { createSeedWorkspace } from '@/lib/seed';

describe('local date helpers', () => {
  it('uses local calendar fields instead of UTC ISO fields', () => {
    const localMidnight = new Date(2026, 7, 24, 0, 30);

    expect(getLocalDateKey(localMidnight)).toBe('2026-08-24');
  });

  it('maps an ISO timestamp at local midnight back to the local business date', () => {
    const localMidnight = new Date(2026, 7, 29, 0, 30);

    expect(getLocalDateKeyFromTimestamp(localMidnight.toISOString())).toBe(
      '2026-08-29',
    );
  });

  it('moves dates through local calendar boundaries', () => {
    expect(addLocalDateDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addLocalDateDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('rejects malformed or impossible date keys', () => {
    expect(() => parseLocalDateKey('2026-02-30')).toThrow(RangeError);
    expect(() => parseLocalDateKey('2026/08/23')).toThrow(RangeError);
  });

  it('seeds first-run workspace data from the injected local date', () => {
    const workspace = createSeedWorkspace(new Date(2026, 7, 24, 0, 30));

    expect(workspace.projects.map((project) => project.createdAt)).toEqual([
      '2026-08-24T00:00:00',
      '2026-08-24T00:00:00',
    ]);
  });
});
