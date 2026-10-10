/** @fileoverview 验证两人时钟服务端与首次水合保留空区域，随后只显示真实客户端时间而不闪读时文案。 */
import { act } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { SpaceClock } from '@/features/together/clock';

it('hydrates the empty server clock into real time without transient text or a mismatch', async () => {
  const container = document.createElement('div');
  container.innerHTML = renderToString(<SpaceClock />);
  document.body.append(container);
  const clock = container.firstElementChild!;
  expect(clock).toHaveClass('together-clock');
  expect(clock).toHaveAttribute('aria-busy', 'true');
  expect(clock).toBeEmptyDOMElement();
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  let root!: ReturnType<typeof hydrateRoot>;
  try {
    await act(async () => {
      root = hydrateRoot(container, <SpaceClock />);
    });
    expect(container.firstElementChild).toBe(clock);
    expect(clock).toHaveAttribute('aria-busy', 'false');
    const instant = container.querySelector('time')!.dateTime;
    expect(Number.isFinite(Date.parse(instant))).toBe(true);
    expect(Math.abs(Date.now() - Date.parse(instant))).toBeLessThan(5_000);
    expect(container).not.toHaveTextContent('正在读取时间');
    expect(errors).not.toHaveBeenCalled();
  } finally {
    if (root) await act(async () => root.unmount());
    errors.mockRestore();
    container.remove();
  }
});
