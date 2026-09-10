/** @fileoverview Verifies hostile/corrupt preferences and pre-paint parity without reading business data. */
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  appearanceBootstrap,
  appearanceStorageKey,
  parseAppearance,
} from '@/features/appearance/appearance-preferences';

describe('device appearance', () => {
  it.each([
    null,
    '',
    '{',
    'null',
    '42',
    '"anya"',
    '{"theme":"other","font":"url(evil)"}',
    '{"theme":"anya","font":"source-han-serif"}',
    '{"theme":"blue","font":"source-han-sans"}',
  ])('uses the same validated preference before and after hydration: %s', (raw) => {
    const dataset = {};
    runInNewContext(appearanceBootstrap, {
      document: { documentElement: { dataset } },
      localStorage: {
        getItem: (key: string) => {
          expect(key).toBe(appearanceStorageKey);
          return raw;
        },
      },
    });
    const { colorMode, ...appearance } = parseAppearance(raw);
    expect(dataset).toEqual({
      ...appearance,
      colorScheme: colorMode === 'dark' ? 'dark' : 'light',
    });
  });
  it('can paint normally when local storage is blocked', () => {
    const dataset = {};
    runInNewContext(appearanceBootstrap, {
      document: { documentElement: { dataset } },
      localStorage: {
        getItem: () => {
          throw new Error('denied');
        },
      },
    });
    expect(dataset).toEqual({ theme: 'blue', font: 'default', colorScheme: 'light' });
  });
});
