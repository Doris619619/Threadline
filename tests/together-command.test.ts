/** @fileoverview 验证微信成果写入在响应丢失、服务端拒绝与请求 ID 重用时的恢复边界。 */
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { executeCommand, RejectedSpaceCommand } from '@/features/together/repository';

const command = {
  id: 'stable-request',
  action: 'submit',
  payload: { wechat_sent: true, version: 2 },
};
const saved = {
  input: { action: command.action, payload: command.payload },
  result: { points: 0, event_id: 'once' },
};

/** 按读取次序返回网络响应，模拟事务已经成功但客户端没收到响应的情形。 */
function transport(reads: unknown[], write: unknown) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(async () => reads.shift()),
  };
  const rpc = vi
    .fn()
    .mockReturnValue({ abortSignal: vi.fn().mockResolvedValue(write) });
  const client = {
    from: vi.fn().mockReturnValue(query),
    rpc,
  } as unknown as SupabaseClient;
  return { client, rpc, query };
}

describe('together command recovery', () => {
  it('returns a previously committed result without sending a second mutation', async () => {
    const { client, rpc } = transport([{ data: saved, error: null }], null);
    expect(await executeCommand(client, 'actor', command)).toEqual(saved.result);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('confirms a lost response before returning success', async () => {
    const { client, query, rpc } = transport(
      [
        { data: null, error: null },
        { data: saved, error: null },
      ],
      { error: { message: 'fetch aborted', code: '' }, data: null },
    );
    expect(await executeCommand(client, 'actor', command)).toEqual(saved.result);
    expect(query.maybeSingle).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('marks a confirmed SQL rejection as safe to correct', async () => {
    const { client } = transport([{ data: null, error: null }], {
      error: { message: 'WECHAT_REQUIRED', code: 'P0001' },
      data: null,
    });
    await expect(executeCommand(client, 'actor', command)).rejects.toBeInstanceOf(
      RejectedSpaceCommand,
    );
  });

  it('keeps unknown network outcomes distinct from confirmed rejection', async () => {
    const { client } = transport(
      [
        { data: null, error: null },
        { data: null, error: null },
      ],
      { error: { message: 'network failure', code: '' }, data: null },
    );
    const error = await executeCommand(client, 'actor', command).catch(
      (error: Error) => error,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(RejectedSpaceCommand);
  });

  it('rejects a request ID reused for different content', async () => {
    const { client, rpc } = transport([{ data: saved, error: null }], null);
    await expect(
      executeCommand(client, 'actor', { ...command, payload: { version: 3 } }),
    ).rejects.toThrow('请求内容已经变化');
    expect(rpc).not.toHaveBeenCalled();
  });
});
