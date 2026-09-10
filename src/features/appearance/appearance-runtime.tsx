/** @fileoverview Applies external appearance updates and announces a readable fallback if a selected font fails. */
'use client';
import { useEffect } from 'react';
import { getMainDesktopBridge } from '@/lib/desktop-bridge';
import {
  getAppearance,
  applyColorMode,
  applyFontResult,
  loadAppearanceFont,
  useAppearance,
} from './appearance-store';

/** Mount outside authentication so login, workspace and Electron edge use the same device preference. */
export function AppearanceRuntime() {
  const { theme, font, colorMode } = useAppearance();
  useEffect(() => {
    applyColorMode();
    if (typeof matchMedia !== 'function') return;
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', applyColorMode);
    return () => media.removeEventListener('change', applyColorMode);
  }, [colorMode]);
  useEffect(() => {
    // Read the store only after hydration, leaving the pre-paint script in control of the first frame.
    let cancelled = false;
    const current = getAppearance();
    document.documentElement.dataset.theme = current.theme;
    void getMainDesktopBridge()
      ?.setAppearanceTheme(current.theme)
      .catch(() => undefined);
    document
      .querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]')
      .forEach((link) => {
        link.href =
          current.theme === 'classic'
            ? '/themes/classic/icon.png'
            : current.theme === 'cottage'
              ? '/themes/cottage/icon.png'
              : current.theme === 'anya'
                ? '/themes/anya/icon.png'
                : '/icon.png';
        link.type = 'image/png';
      });
    document.documentElement.dataset.font = current.font;
    void loadAppearanceFont(current.font)
      .then(() => {
        if (!cancelled) applyFontResult(current.font, true);
      })
      .catch(() => {
        if (cancelled) return;
        applyFontResult(current.font, false);
      });
    return () => {
      cancelled = true;
    };
  }, [theme, font]);
  return (
    <p className="appearance-load-notice" role="status">
      字体未能加载，暂时使用默认字体。可在外观设置中重试。
    </p>
  );
}
