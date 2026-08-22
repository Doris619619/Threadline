import { describe, expect, it } from 'vitest';

describe('Threadline foundation', () => {
  it('uses a required TypeScript test environment', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});
