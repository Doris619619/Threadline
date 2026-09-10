/** @fileoverview Defines device appearance preferences and the CSP-compatible pre-paint bootstrap. */

export type AppearanceTheme = 'blue' | 'anya' | 'cottage' | 'classic';
export type AppearanceFont = 'default' | 'source-han-sans' | 'source-han-serif';
export type AppearanceColorMode = 'system' | 'light' | 'dark';
export type AppearancePreferences = {
  theme: AppearanceTheme;
  font: AppearanceFont;
  colorMode: AppearanceColorMode;
};
export const appearanceStorageKey = 'threadline.appearance.v1';
export const defaultAppearance: AppearancePreferences = {
  theme: process.env.NEXT_PUBLIC_THREADLINE_THEME === 'anya' ? 'anya' : 'blue',
  font: 'default',
  colorMode: 'system',
};

/** Validate untrusted local preferences without accepting arbitrary attributes or font URLs. */
export function parseAppearance(raw: string | null): AppearancePreferences {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (!value || typeof value !== 'object') return defaultAppearance;
    return {
      theme:
        value.theme === 'classic'
          ? 'classic'
          : value.theme === 'cottage'
            ? 'cottage'
            : value.theme === 'anya'
              ? 'anya'
              : 'blue',
      colorMode:
        value.colorMode === 'light' || value.colorMode === 'dark'
          ? value.colorMode
          : 'system',
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
  root.dataset.theme = value ? (value.theme === 'classic' ? 'classic' : value.theme === 'cottage' ? 'cottage' : value.theme === 'anya' ? 'anya' : 'blue') : ${JSON.stringify(defaultAppearance.theme)};
  root.dataset.font = value && ['source-han-sans', 'source-han-serif'].includes(value.font) ? value.font : 'default';
  const mode = value && value.colorMode;
  root.dataset.colorScheme = mode === 'dark' || (mode !== 'light' && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
})();`;
