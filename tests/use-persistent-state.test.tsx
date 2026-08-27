/** @fileoverview 回归 usePersistentState 在调用方传入 inline normalizer 时只执行一次 hydration。 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { LocalStorageStateRepository } from '@/lib/repository';

function InlineNormalizerProbe() {
  const [value, , hydrated] = usePersistentState<string[]>(
    'threadline.inline-normalizer.test',
    [],
    (stored) =>
      Array.isArray(stored)
        ? [...new Set(stored.filter((item) => typeof item === 'string'))]
        : [],
  );
  return (
    <output data-testid="persistent-value">
      {hydrated ? value.join(',') : 'loading'}
    </output>
  );
}

describe('usePersistentState', () => {
  it('does not rehydrate repeatedly when an inline normalizer returns a new array', async () => {
    window.localStorage.setItem(
      'threadline.inline-normalizer.test',
      JSON.stringify(['one', 'one', 'two']),
    );
    const read = vi.spyOn(LocalStorageStateRepository.prototype, 'read');

    render(<InlineNormalizerProbe />);

    await expect(screen.findByText('one,two')).resolves.toBeTruthy();
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(read).toHaveBeenCalledTimes(1);

    read.mockRestore();
    window.localStorage.removeItem('threadline.inline-normalizer.test');
  });
});
