/** @fileoverview 提供最小的个人 DeepSeek 密钥设置；密码草稿只在当前页面内存中存在，保存后立即清空。 */

'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Surface } from '@/components/ui/surface';
import { useOptionalCloudRuntime } from '@/features/auth/cloud-runtime-provider';
import {
  requestAiApiSettings,
  type AiApiAction,
  type AiApiStatus,
} from './ai-api-client';

/** 账号切换时重新挂载表单并销毁旧密码草稿；演示模式明确提示登录。 */
export function AiApiSettings() {
  const runtime = useOptionalCloudRuntime();
  if (!runtime)
    return (
      <Surface className="settings-copy ai-api-settings">
        <h2>DeepSeek</h2>
        <p>请登录 Cloud 工作区后设置个人 API Key，演示模式暂不支持。</p>
      </Surface>
    );
  return <AiApiSettingsForm key={runtime.user.id} client={runtime.client} />;
}

/** 管理当前账号的配置状态和临时密码草稿；所有操作等待服务端确认，失败保留输入供重试。 */
function AiApiSettingsForm({ client }: { client: SupabaseClient }) {
  const [status, setStatus] = useState<AiApiStatus>();
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<AiApiAction | undefined>('status');
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState('');
  const locked = useRef(false);
  const request = useRef<AbortController | undefined>(undefined);

  /** 按请求身份隔离晚回包；成功保存/移除立刻清除密码草稿，不把原始错误内容带入界面。 */
  const execute = useCallback(
    async (action: AiApiAction, key?: string) => {
      if (locked.current) return;
      locked.current = true;
      const controller = new AbortController();
      request.current = controller;
      setBusy(action);
      setMessage('');
      try {
        const next = await requestAiApiSettings(client, action, controller.signal, key);
        if (request.current !== controller || controller.signal.aborted) return;
        setStatus(next);
        setError(undefined);
        if (action !== 'status') {
          setApiKey('');
          setMessage(
            action === 'save' ? '个人 API Key 已保存。' : '个人 API Key 已移除。',
          );
        }
      } catch {
        if (request.current !== controller || controller.signal.aborted) return;
        setError(
          action === 'status'
            ? '暂时无法读取 API 接入状态，请重试。'
            : action === 'save'
              ? '保存失败，请稍后重试。'
              : '移除失败，请稍后重试。',
        );
      } finally {
        if (request.current === controller) {
          locked.current = false;
          setBusy(undefined);
        }
      }
    },
    [client],
  );

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    locked.current = true;
    // 初次读取只有异步响应改变状态；晚回包不能更新已卸载或切换账号的页面。
    void requestAiApiSettings(client, 'status', controller.signal)
      .then((next) => {
        if (request.current === controller && !controller.signal.aborted) {
          setStatus(next);
          setError(undefined);
        }
      })
      .catch(() => {
        if (request.current === controller && !controller.signal.aborted)
          setError('暂时无法读取 API 接入状态，请重试。');
      })
      .finally(() => {
        if (request.current === controller) {
          locked.current = false;
          setBusy(undefined);
        }
      });
    return () => {
      request.current?.abort();
      request.current = undefined;
      locked.current = false;
    };
  }, [client]);

  /** 仅在服务端支持保存时提交非空密码；同步锁防止同一事件周期重复提交。 */
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!status?.canSave || !apiKey.trim()) return;
    void execute('save', apiKey.trim());
  };

  return (
    <Surface className="settings-copy ai-api-settings">
      <h2>DeepSeek</h2>
      {!status ? (
        <>
          {busy && <p role="status">正在读取 API 接入状态…</p>}
          {!busy && (
            <button
              type="button"
              className="tl-button tl-button--secondary"
              onClick={() => void execute('status')}
            >
              重新读取
            </button>
          )}
        </>
      ) : (
        <>
          <p className="ai-api-status">
            个人 API Key：{status.configured ? '已保存' : '未设置'}
          </p>
          <p>
            {status.configured
              ? '智能导入优先使用你的个人 Key。'
              : status.serverConfigured
                ? '智能导入当前使用服务端配置。'
                : '保存个人 API Key 后即可用于智能导入。'}
          </p>
          {status.serverConfigured && status.configured && (
            <p>移除个人 Key 后，将使用服务端配置。</p>
          )}
          {!status.canSave && (
            <p role="status">服务尚未配置密钥存储，请联系管理员完成配置后再保存。</p>
          )}
          <form onSubmit={save} aria-busy={Boolean(busy)}>
            <label className="ai-api-key-field" htmlFor="deepseek-api-key">
              {status.configured ? '替换 DeepSeek API Key' : 'DeepSeek API Key'}
              <input
                id="deepseek-api-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                required
                value={apiKey}
                placeholder="粘贴你的 DeepSeek API Key"
                disabled={Boolean(busy) || !status.canSave}
                aria-describedby="deepseek-api-note"
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setMessage('');
                }}
              />
            </label>
            <p id="deepseek-api-note">
              密钥加密保存在服务端。保存仅确认已存储，解析时会调用 DeepSeek。
            </p>
            <div className="ai-api-actions">
              <button
                type="submit"
                className="tl-button tl-button--primary"
                disabled={Boolean(busy) || !status.canSave || !apiKey.trim()}
              >
                {status.configured ? '替换 API Key' : '保存 API Key'}
              </button>
              {status.configured && (
                <button
                  type="button"
                  className="tl-button tl-button--secondary"
                  disabled={Boolean(busy)}
                  onClick={() => void execute('delete')}
                >
                  移除个人 Key
                </button>
              )}
            </div>
          </form>
        </>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
    </Surface>
  );
}
