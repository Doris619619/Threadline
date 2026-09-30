/** @fileoverview localhost 专用展示外壳；测试身份、时区和主题可切换，不访问正式数据。 */
'use client';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { setAccountTimezone } from '@/lib/account-clock';
import { useAppearance, saveAppearance } from '@/features/appearance/appearance-store';
import type { AppearanceTheme } from '@/features/appearance/appearance-preferences';
import { TogetherSession, useTogether } from './state';
import { TogetherPanel } from './panel';
const identities = [
  ['11111111-1111-4111-8111-111111111111', '小桃 · 北京', 'Asia/Shanghai'],
  ['22222222-2222-4222-8222-222222222222', '小熊 · 纽约', 'America/New_York'],
  ['33333333-3333-4333-8333-333333333333', '未绑定账号 C · 东京', 'Asia/Tokyo'],
  ['44444444-4444-4444-8444-444444444444', '未绑定账号 D · 伦敦', 'Europe/London'],
];
/** 预览切换销毁缓存，只有显式 dev 路由可以挂载此组件。 */
export function TogetherPreview() {
  const [index, setIndex] = useState(0);
  const appearance = useAppearance();
  const [user, , zone] = identities[index];
  const client = useMemo(
    () =>
      createClient('http://127.0.0.1:3102', 'sb_publishable_local_together_preview', {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { 'x-preview-user': user } },
      }),
    [user],
  );
  useEffect(() => {
    setAccountTimezone(zone);
    return () => setAccountTimezone(undefined);
  }, [zone]);
  return (
    <main className="together-preview">
      <details className="together-preview-dock">
        <summary>
          本地预览<span>设置</span>
        </summary>
        <div className="together-preview-controls">
          <label>
            查看身份
            <select
              value={index}
              onChange={(event) => {
                setAccountTimezone(identities[Number(event.target.value)][2]);
                setIndex(Number(event.target.value));
              }}
            >
              {identities.map((item, i) => (
                <option key={item[0]} value={i}>
                  {item[1]}
                </option>
              ))}
            </select>
          </label>
          <label>
            主题
            <select
              aria-label="主题"
              value={appearance.theme}
              onChange={(event) =>
                saveAppearance({
                  ...appearance,
                  theme: event.target.value as AppearanceTheme,
                })
              }
            >
              {['blue', 'anya', 'cottage', 'classic'].map((theme) => (
                <option key={theme}>{theme}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() =>
              saveAppearance({
                ...appearance,
                colorMode: appearance.colorMode === 'dark' ? 'light' : 'dark',
              })
            }
          >
            切换深浅色
          </button>
          <small>测试身份 · 数据仅保存在本机</small>
        </div>
      </details>
      {
        <TogetherSession key={user} client={client} user={user} realtime={false}>
          <PreviewRefresh />
          <TogetherPanel />
        </TogetherSession>
      }
    </main>
  );
}
/** 本地桥没有 Supabase Realtime，以轮询演示双窗口更新，正式实现仍使用真实订阅。 */
function PreviewRefresh() {
  const { refresh } = useTogether();
  useEffect(() => {
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh]);
  return null;
}
