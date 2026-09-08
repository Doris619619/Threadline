/** @fileoverview Defines device appearance preferences and the CSP-compatible pre-paint bootstrap. */

export type AppearanceTheme = 'blue' | 'anya';
export type AppearanceFont = 'default' | 'source-han-sans' | 'source-han-serif';
export type AppearancePreferences = { theme: AppearanceTheme; font: AppearanceFont };
export const appearanceStorageKey = 'threadline.appearance.v1';
export const defaultAppearance: AppearancePreferences = {
  theme: 'blue',
  font: 'default',
};

/** Validate untrusted local preferences without accepting arbitrary attributes or font URLs. */
export function parseAppearance(raw: string | null): AppearancePreferences {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (!value || typeof value !== 'object') return defaultAppearance;
    return {
      theme: value.theme === 'anya' ? 'anya' : 'blue',
      font:
        value.font === 'source-han-sans' || value.font === 'source-han-serif'
          ? value.font
          : 'default',
    };
  } catch {
    return defaultAppearance;
  }
}

/** A self-contained synchronous script: Web supplies a nonce; static Electron hashes its contents. */
export const appearanceBootstrap = `(() => {
  let value;
  try { value = JSON.parse(localStorage.getItem(${JSON.stringify(appearanceStorageKey)}) || 'null'); } catch {}
  const root = document.documentElement;
  root.dataset.theme = value && value.theme === 'anya' ? 'anya' : 'blue';
  root.dataset.font = value && ['source-han-sans', 'source-han-serif'].includes(value.font) ? value.font : 'default';
})();`;
