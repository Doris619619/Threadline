/** @fileoverview 验证智能解析客户端的数据边界、原文透传、服务错误和取消超时，不连接真实 Supabase。 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  IMPORT_TEXT_LIMIT,
  parseImportTasks,
} from '@/features/tasks/smart-import/client';

const parsedTask = {
  title: '完成 ECE4016 作业',
  projectId: '726fd7ac-1cc1-4c92-af25-8f120578cde1',
  startTime: null,
  endTime: null,
  plannedMinutes: null,
  actualMinutes: null,
};

type InvokeOptions = { body: { text: string }; signal: AbortSignal };
type InvokeResult = { data: unknown; error: unknown };

/** 仅替换 Supabase 调用边界，保留客户端本身的输入和响应校验。 */
function makeClient(
  result: InvokeResult = { data: { tasks: [parsedTask] }, error: null },
) {
  const invoke = vi
    .fn<(name: string, options: InvokeOptions) => Promise<InvokeResult>>()
    .mockResolvedValue(result);
  return {
    invoke,
    client: { functions: { invoke } } as unknown as SupabaseClient,
  };
}

afterEach(() => vi.useRealTimers());

describe('parseImportTasks', () => {
  it('passes the original messy text without client project claims and preserves blank optional values', async () => {
    const c = makeClient();
    const text =
      '  嗯，今天那个，先不用管背景。\n# 随手计划\n- [ ] 完成 ECE4016 作业\n刚才说的作业还是同一件事。  ';
    await expect(
      parseImportTasks(c.client, text, new AbortController().signal),
    ).resolves.toEqual([parsedTask]);
    expect(c.invoke).toHaveBeenCalledWith('smart-task-import', {
      body: { text },
      signal: expect.any(AbortSignal),
    });
    expect(c.invoke).toHaveBeenCalledTimes(1);
  });

  it('accepts only the six task fields and explicit integer duration values', async () => {
    const task = {
      ...parsedTask,
      title: '  看完 Lecture 6  ',
      startTime: '08:30',
      endTime: '10:00',
      plannedMinutes: 90,
      actualMinutes: 0,
    };
    const c = makeClient({ data: { tasks: [task] }, error: null });
    await expect(
      parseImportTasks(c.client, '看完 Lecture 6', new AbortController().signal),
    ).resolves.toEqual([{ ...task, title: '看完 Lecture 6' }]);
  });

  it.each([
    { tasks: [{ ...parsedTask, title: '' }] },
    { tasks: [{ ...parsedTask, startTime: '25:00' }] },
    { tasks: [{ ...parsedTask, actualMinutes: -1 }] },
    { tasks: [{ ...parsedTask, plannedMinutes: 0.5 }] },
    { tasks: [{ ...parsedTask, completed: false }] },
    { tasks: [{ title: parsedTask.title, projectId: parsedTask.projectId }] },
    { tasks: Array.from({ length: 101 }, () => parsedTask) },
    { tasks: [parsedTask], notes: '附加说明' },
    null,
  ])('rejects malformed or expanded service data %j', async (data) => {
    const c = makeClient({ data, error: null });
    await expect(
      parseImportTasks(c.client, '待解析内容', new AbortController().signal),
    ).rejects.toThrow('解析结果不完整，请重新解析。');
  });

  it('allows an empty task result so the dialog can explain that no actions were recognized', async () => {
    const c = makeClient({ data: { tasks: [] }, error: null });
    await expect(
      parseImportTasks(
        c.client,
        '今天好累，只是随便聊聊。',
        new AbortController().signal,
      ),
    ).resolves.toEqual([]);
  });

  it('rejects unavailable cloud runtime and invalid text before invoking the service', async () => {
    const c = makeClient();
    await expect(
      parseImportTasks(undefined, '完成作业', new AbortController().signal),
    ).rejects.toThrow('智能解析需要登录云工作区');
    for (const text of ['  \n ', '字'.repeat(IMPORT_TEXT_LIMIT + 1)]) {
      await expect(
        parseImportTasks(c.client, text, new AbortController().signal),
      ).rejects.toThrow('请粘贴');
    }
    expect(c.invoke).not.toHaveBeenCalled();
  });

  it('shows a useful Edge Function error response instead of the transport wrapper', async () => {
    const c = makeClient({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: new Response(
          JSON.stringify({ error: '智能导入服务暂未配置，请联系管理员。' }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      },
    });
    await expect(
      parseImportTasks(c.client, '完成作业', new AbortController().signal),
    ).rejects.toThrow('智能导入服务暂未配置，请联系管理员。');
  });

  it.each([
    { message: 'fetch failed: internal transport details' },
    { context: new Response('<html>bad gateway</html>', { status: 502 }) },
  ])('uses a stable user error for unavailable or non-JSON services', async (error) => {
    const c = makeClient({ data: null, error });
    await expect(
      parseImportTasks(c.client, '完成作业', new AbortController().signal),
    ).rejects.toThrow('暂时无法解析，请检查网络及智能导入服务配置后重试。');
  });

  it('forwards caller cancellation and releases its timeout after the service settles', async () => {
    vi.useFakeTimers();
    const c = makeClient();
    let requestSignal: AbortSignal | undefined;
    /** 模拟 SDK 在取消 fetch 后返回错误，不依赖真实网络或固定等待。 */
    c.invoke.mockImplementationOnce(async (_name, options) => {
      requestSignal = options.signal;
      return new Promise((resolve) => {
        options.signal.addEventListener(
          'abort',
          () => resolve({ data: null, error: new Error('aborted') }),
          { once: true },
        );
      });
    });
    const caller = new AbortController();
    const pending = parseImportTasks(c.client, '完成作业', caller.signal);
    const assertion = expect(pending).rejects.toThrow('解析已取消或超时，请重试。');
    caller.abort();
    await assertion;
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts a stalled request at its deadline and returns an actionable timeout error', async () => {
    vi.useFakeTimers();
    const c = makeClient();
    let requestSignal: AbortSignal | undefined;
    /** 只在收到取消信号时结束挂起请求，以验证超时由客户端触发。 */
    c.invoke.mockImplementationOnce(async (_name, options) => {
      requestSignal = options.signal;
      return new Promise((resolve) => {
        options.signal.addEventListener(
          'abort',
          () => resolve({ data: null, error: new Error('fetch aborted') }),
          { once: true },
        );
      });
    });
    const pending = parseImportTasks(
      c.client,
      '完成作业',
      new AbortController().signal,
    );
    const assertion = expect(pending).rejects.toThrow('解析已取消或超时，请重试。');
    await vi.advanceTimersByTimeAsync(94_999);
    expect(requestSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps an already-cancelled caller signal cancelled at the service boundary', async () => {
    const c = makeClient();
    const caller = new AbortController();
    caller.abort();
    await expect(parseImportTasks(c.client, '完成作业', caller.signal)).rejects.toThrow(
      '解析已取消或超时，请重试。',
    );
    expect(c.invoke.mock.calls[0]?.[1].signal.aborted).toBe(true);
  });

  it('normalizes cancellation when the SDK rejects rather than returning an error result', async () => {
    const c = makeClient();
    /** 模拟自定义 fetch/SDK 直接拒绝取消请求的路径，避免向界面泄漏底层异常。 */
    c.invoke.mockImplementationOnce(
      async (_name, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(new Error('internal fetch cancellation')),
            { once: true },
          );
        }),
    );
    const caller = new AbortController();
    const pending = parseImportTasks(c.client, '完成作业', caller.signal);
    const assertion = expect(pending).rejects.toThrow('解析已取消或超时，请重试。');
    caller.abort();
    await assertion;
  });
});
