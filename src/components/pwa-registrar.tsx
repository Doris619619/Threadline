/** @fileoverview 仅为普通浏览器/PWA 注册 Service Worker；Electron 一律跳过。 */

'use client';

import { useEffect } from 'react';
import { getThreadlineDesktopBridge } from '@/lib/desktop-bridge';

/** 在无 desktop bridge 的浏览器环境注册 PWA Service Worker。 */
export function PwaRegistrar() {
  useEffect(() => {
    if (getThreadlineDesktopBridge()) return;
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);
  return null;
}
