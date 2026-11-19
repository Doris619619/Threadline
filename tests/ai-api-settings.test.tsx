/** @fileoverview 验证 DeepSeek 密钥设置的保存、替换、删除、取消与敏感信息边界，不调用真实云服务。 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiApiSettings } from '@/features/settings/ai-api-settings';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  loggedIn: true,
  client: { marker: 'settings-runtime-client' },
}));

vi.mock('@/features/auth/cloud-runtime-provider', () => ({
  useOptionalCloudRuntime: () =>
    mocks.loggedIn ? { client: mocks.client, user: { id: 'settings-owner' } } : null,
}));
vi.mock('@/features/settings/ai-api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/settings/ai-api-client')>()),
  requestAiApiSettings: mocks.request,
}));

const emptyStatus = { configured: false, serverConfigured: false, canSave: true };
const savedStatus = { ...emptyStatus, configured: true };
const firstKey = 'sk-0123456789abcdef0123456789abcdef';
const replacementKey = 'sk-abcdef0123456789abcdef0123456789';

/** 创建可控异步响应，确保测试观察真实请求完成前后的界面和取消行为。 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** 挂载真实设置组件并提供独立 Query cache，便于核对密钥未进入共享缓存。 */
function showSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AiApiSettings />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

beforeEach(() => {
  mocks.loggedIn = true;
  mocks.request.mockReset();
  mocks.request.mockResolvedValue(emptyStatus);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('AiApiSettings', () => {
  it('reads only configuration status when opening', async () => {
    showSettings();
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
    expect(mocks.request).toHaveBeenCalledWith(
      mocks.client,
      'status',
      expect.any(AbortSignal),
    );
  });

  it('retries a failed status read without inventing a connection result', async () => {
    mocks.request.mockRejectedValueOnce(new Error('unavailable'));
    showSettings();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '暂时无法读取 API 接入状态，请重试。',
    );
    fireEvent.click(screen.getByRole('button', { name: '重新读取' }));
    await screen.findByLabelText(/DeepSeek API Key/i);
    expect(mocks.request.mock.calls.map((call) => call[1])).toEqual([
      'status',
      'status',
    ]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/已连接|已验证/);
  });

  it('saves a password field, immediately clears it on success, and keeps the key out of browser storage and Query cache', async () => {
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    const c = showSettings();
    const input = await screen.findByLabelText(/DeepSeek API Key/i);
    await waitFor(() => expect(input).not.toBeDisabled());
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.change(input, { target: { value: firstKey } });
    mocks.request.mockResolvedValueOnce(savedStatus);
    fireEvent.click(screen.getByRole('button', { name: /保存/ }));
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith(
        mocks.client,
        'save',
        expect.any(AbortSignal),
        firstKey,
      ),
    );
    await waitFor(() => expect(input).toHaveValue(''));
    expect(screen.getByRole('status')).toHaveTextContent(/已保存/);
    expect(screen.getByRole('status')).not.toHaveTextContent(/已连接|已验证/);
    expect(document.body).not.toHaveTextContent(firstKey);
    expect(storageWrite).not.toHaveBeenCalled();
    expect(JSON.stringify(c.queryClient.getQueryCache().getAll())).not.toContain(
      firstKey,
    );
    expect(JSON.stringify(c.queryClient.getMutationCache().getAll())).not.toContain(
      firstKey,
    );
    c.queryClient.clear();
  });

  it('replaces an existing key and deletes it without reading the stored value back', async () => {
    mocks.request.mockResolvedValueOnce(savedStatus);
    showSettings();
    const input = await screen.findByLabelText(/DeepSeek API Key/i);
    await waitFor(() => expect(input).not.toBeDisabled());
    expect(input).toHaveValue('');
    fireEvent.change(input, { target: { value: replacementKey } });
    mocks.request.mockResolvedValueOnce(savedStatus);
    fireEvent.click(screen.getByRole('button', { name: /替换/ }));
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith(
        mocks.client,
        'save',
        expect.any(AbortSignal),
        replacementKey,
      ),
    );
    await waitFor(() => expect(input).toHaveValue(''));
    mocks.request.mockResolvedValueOnce(emptyStatus);
    fireEvent.click(screen.getByRole('button', { name: /移除/ }));
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith(
        mocks.client,
        'delete',
        expect.any(AbortSignal),
        undefined,
      ),
    );
    expect(input).toHaveValue('');
    expect(document.body).not.toHaveTextContent(replacementKey);
  });

  it('preserves the typed replacement after a failed save and supports a deliberate retry', async () => {
    showSettings();
    const input = await screen.findByLabelText(/DeepSeek API Key/i);
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: firstKey } });
    mocks.request.mockRejectedValueOnce(new Error(`内部保存错误：${firstKey}`));
    fireEvent.click(screen.getByRole('button', { name: /保存/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '保存失败，请稍后重试。',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(firstKey);
    expect(input).toHaveValue(firstKey);
    mocks.request.mockResolvedValueOnce(savedStatus);
    fireEvent.click(screen.getByRole('button', { name: /保存/ }));
    await waitFor(() => expect(input).toHaveValue(''));
    expect(mocks.request.mock.calls.filter((call) => call[1] === 'save')).toHaveLength(
      2,
    );
  });

  it('blocks saving when the server cannot securely store a personal key', async () => {
    mocks.request.mockResolvedValueOnce({ ...emptyStatus, canSave: false });
    showSettings();
    const input = await screen.findByLabelText(/DeepSeek API Key/i);
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: firstKey } });
    expect(screen.getByRole('button', { name: /保存/ })).toBeDisabled();
    fireEvent.submit(input.closest('form')!);
    expect(mocks.request).not.toHaveBeenCalledWith(
      mocks.client,
      'save',
      expect.anything(),
      expect.anything(),
    );
  });

  it('requires a cloud login before allowing key configuration', () => {
    mocks.loggedIn = false;
    showSettings();
    expect(screen.getByText(/登录/)).toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('still allows removing an existing key when secure saving is unavailable', async () => {
    mocks.request.mockResolvedValueOnce({ ...savedStatus, canSave: false });
    showSettings();
    const remove = await screen.findByRole('button', { name: /移除/ });
    expect(screen.getByRole('button', { name: /替换/ })).toBeDisabled();
    expect(remove).not.toBeDisabled();
    mocks.request.mockResolvedValueOnce({ ...emptyStatus, canSave: false });
    fireEvent.click(remove);
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('status')
          .some((item) => item.textContent?.includes('已移除')),
      ).toBe(true),
    );
    expect(mocks.request.mock.calls.map((call) => call[1])).toEqual([
      'status',
      'delete',
    ]);
  });

  it('aborts an unfinished settings request on unmount and starts with an empty key when reopened', async () => {
    const pending = deferred<typeof emptyStatus>();
    mocks.request.mockReturnValueOnce(pending.promise);
    const c = showSettings();
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
    const signal = mocks.request.mock.calls[0][2] as AbortSignal;
    c.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(emptyStatus));
    c.queryClient.clear();

    const reopened = showSettings();
    const input = await screen.findByLabelText(/DeepSeek API Key/i);
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: firstKey } });
    reopened.unmount();
    const last = showSettings();
    await waitFor(() =>
      expect(screen.getByLabelText(/DeepSeek API Key/i)).toHaveValue(''),
    );
    reopened.queryClient.clear();
    last.queryClient.clear();
  });
});

type InvokeOptions = {
  body: { action: 'status' | 'save' | 'delete'; apiKey?: string };
  signal: AbortSignal;
};
type InvokeResult = { data: unknown; error: unknown };

/** 替换云请求边界以执行真实配置客户端；响应从不包含可用密钥。 */
function makeApiClient(result: InvokeResult = { data: emptyStatus, error: null }) {
  const invoke = vi
    .fn<(name: string, options: InvokeOptions) => Promise<InvokeResult>>()
    .mockResolvedValue(result);
  return { invoke, client: { functions: { invoke } } as unknown as SupabaseClient };
}

/** 越过组件使用的 mock，直接读取真实客户端实现来核对敏感数据与取消边界。 */
async function loadApiClient() {
  return vi.importActual<typeof import('@/features/settings/ai-api-client')>(
    '@/features/settings/ai-api-client',
  );
}

describe('requestAiApiSettings', () => {
  it('sends a key only for save and returns configuration booleans for every operation', async () => {
    const { requestAiApiSettings } = await loadApiClient();
    const c = makeApiClient();
    const signal = new AbortController().signal;
    expect(await requestAiApiSettings(c.client, 'status', signal, firstKey)).toEqual(
      emptyStatus,
    );
    expect(await requestAiApiSettings(c.client, 'delete', signal, firstKey)).toEqual(
      emptyStatus,
    );
    expect(
      await requestAiApiSettings(c.client, 'save', signal, `  ${firstKey}  `),
    ).toEqual(emptyStatus);
    expect(c.invoke.mock.calls.map((call) => call[1].body)).toEqual([
      { action: 'status' },
      { action: 'delete' },
      { action: 'save', apiKey: firstKey },
    ]);
    expect(c.invoke.mock.calls.every((call) => call[0] === 'ai-api-settings')).toBe(
      true,
    );
  });

  it.each([
    { configured: false, serverConfigured: false },
    { ...savedStatus, apiKey: firstKey },
    { ...savedStatus, configured: 'true' },
  ])(
    'rejects incomplete or expanded configuration data without exposing returned keys',
    async (data) => {
      const { requestAiApiSettings } = await loadApiClient();
      const c = makeApiClient({ data, error: null });
      const pending = requestAiApiSettings(
        c.client,
        'status',
        new AbortController().signal,
      );
      await expect(pending).rejects.toThrow('API 接入状态不完整，请重新读取。');
      await expect(pending).rejects.not.toThrow(firstKey);
    },
  );

  it('does not reveal a key echoed in a failed Edge response or a thrown transport error', async () => {
    const { requestAiApiSettings } = await loadApiClient();
    const c = makeApiClient({
      data: null,
      error: {
        message: `invalid key ${firstKey}`,
        context: new Response(JSON.stringify({ error: firstKey }), { status: 400 }),
      },
    });
    const responseFailure = requestAiApiSettings(
      c.client,
      'save',
      new AbortController().signal,
      firstKey,
    );
    await expect(responseFailure).rejects.toThrow('保存失败，请稍后重试。');
    await expect(responseFailure).rejects.not.toThrow(firstKey);
    c.invoke.mockRejectedValueOnce(new Error(`internal fetch detail ${firstKey}`));
    const transportFailure = requestAiApiSettings(
      c.client,
      'save',
      new AbortController().signal,
      firstKey,
    );
    await expect(transportFailure).rejects.toThrow('保存失败，请稍后重试。');
    await expect(transportFailure).rejects.not.toThrow(firstKey);
  });

  it.each(['caller-abort', 'deadline'] as const)(
    'cancels %s without retaining a timer or surfacing key details',
    async (mode) => {
      vi.useFakeTimers();
      const { requestAiApiSettings } = await loadApiClient();
      const c = makeApiClient();
      let requestSignal: AbortSignal | undefined;
      /** 模拟完全忽略取消信号的挂起 SDK，限时必须由客户端自身结束等待。 */
      c.invoke.mockImplementationOnce(async (_name, options) => {
        requestSignal = options.signal;
        return new Promise<InvokeResult>(() => {});
      });
      const caller = new AbortController();
      const pending = requestAiApiSettings(c.client, 'save', caller.signal, firstKey);
      const assertion = expect(pending).rejects.toThrow('请求已取消或超时，请重试。');
      if (mode === 'caller-abort') caller.abort();
      else {
        await vi.advanceTimersByTimeAsync(19_999);
        expect(requestSignal?.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
      }
      await assertion;
      expect(requestSignal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('rejects an empty save before making a cloud request', async () => {
    const { requestAiApiSettings } = await loadApiClient();
    const c = makeApiClient();
    await expect(
      requestAiApiSettings(c.client, 'save', new AbortController().signal, '  '),
    ).rejects.toThrow('请输入 DeepSeek API Key。');
    expect(c.invoke).not.toHaveBeenCalled();
  });

  it('does not invoke the cloud service for an already cancelled request', async () => {
    vi.useFakeTimers();
    const { requestAiApiSettings } = await loadApiClient();
    const c = makeApiClient();
    const caller = new AbortController();
    caller.abort();
    await expect(
      requestAiApiSettings(c.client, 'status', caller.signal),
    ).rejects.toThrow('请求已取消或超时，请重试。');
    expect(c.invoke).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
