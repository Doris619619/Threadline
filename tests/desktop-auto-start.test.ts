/** @fileoverview 验证自启动系统回读、默认不写入、以后再选与拒绝无效参数。 */
import { describe, expect, it, vi } from 'vitest';
import { createAutoStartController } from '@/lib/desktop-auto-start';

/** 注入可观察的系统与本机决定记录，不触碰测试机器注册表。 */
function setup(supported = true) {
  let enabled = false;
  let decided = false;
  const writeEnabled = vi.fn((next: boolean) => {
    enabled = next;
  });
  const recordDecision = vi.fn(() => {
    decided = true;
  });
  const controller = createAutoStartController({
    supported,
    readEnabled: () => enabled,
    writeEnabled,
    readDecision: () => decided,
    recordDecision,
  });
  return {
    controller,
    writeEnabled,
    recordDecision,
    externalDisable: () => {
      enabled = false;
    },
  };
}
describe('desktop auto start', () => {
  it('reads a new device without registering startup and defers without a write', () => {
    const { controller, writeEnabled } = setup();
    expect(controller.getState()).toEqual({
      supported: true,
      enabled: false,
      decided: false,
    });
    expect(controller.defer()).toEqual({
      supported: true,
      enabled: false,
      decided: true,
    });
    expect(writeEnabled).not.toHaveBeenCalled();
  });
  it('reflects external disabling and preserves the decision across reads', () => {
    const { controller, externalDisable } = setup();
    expect(controller.setEnabled(true).enabled).toBe(true);
    externalDisable();
    expect(controller.getState()).toEqual({
      supported: true,
      enabled: false,
      decided: true,
    });
    expect(controller.setEnabled(false).enabled).toBe(false);
  });
  it('does not disable an existing enabled setting when deferred', () => {
    const { controller, writeEnabled } = setup();
    controller.setEnabled(true);
    expect(controller.defer().enabled).toBe(true);
    expect(writeEnabled).toHaveBeenCalledTimes(1);
  });
  it('rejects untrusted value shapes and unsupported installations without writing', () => {
    const { controller, writeEnabled } = setup(false);
    expect(controller.getState().supported).toBe(false);
    expect(() => controller.setEnabled('true')).toThrow();
    expect(() => controller.setEnabled(true)).toThrow();
    controller.defer();
    expect(writeEnabled).not.toHaveBeenCalled();
  });
  it('does not acknowledge a system write that failed verification', () => {
    const recordDecision = vi.fn();
    const controller = createAutoStartController({
      supported: true,
      readEnabled: () => false,
      writeEnabled: vi.fn(),
      readDecision: () => false,
      recordDecision,
    });
    expect(() => controller.setEnabled(true)).toThrow('Windows');
    expect(recordDecision).not.toHaveBeenCalled();
  });
});
