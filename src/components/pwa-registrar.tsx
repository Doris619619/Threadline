'use client';
import { useEffect } from 'react';
export function PwaRegistrar() {
  useEffect(() => {
    // The packaged application is already installed by Tauri. Its asset
    // protocol cannot host a browser service worker, so retain registration
    // for the Web/PWA only.
    if ('__TAURI_INTERNALS__' in window) return;
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);
  return null;
}
