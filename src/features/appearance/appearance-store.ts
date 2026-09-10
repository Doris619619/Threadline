/** @fileoverview Synchronizes device appearance across React, tabs and the root document, without cloud writes. */
'use client';

import { useSyncExternalStore } from 'react';
import {
  appearanceStorageKey,
  defaultAppearance,
  parseAppearance,
  type AppearanceFont,
  type AppearancePreferences,
} from './appearance-preferences';

const changeEvent = 'threadline-appearance-change';
const defaultRaw = JSON.stringify(defaultAppearance);
let memoryRaw: string | undefined;
const recoveredFaces = new Map<AppearanceFont, FontFace>();
export const fontFamilies: Record<AppearanceFont, string> = {
  default: '',
  'source-han-sans': 'Threadline Source Han Sans',
  'source-han-serif': 'Threadline Source Han Serif',
};

/** Return a stable primitive snapshot; unavailable storage keeps this window's session preference. */
function readSnapshot() {
  if (memoryRaw !== undefined) return memoryRaw;
  try {
    return localStorage.getItem(appearanceStorageKey) ?? defaultRaw;
  } catch {
    return memoryRaw ?? defaultRaw;
  }
}
/** SSR must always match the default markup, independently of the pre-paint DOM attributes. */
function serverSnapshot() {
  return defaultRaw;
}
/** Subscribe to same-window edits and cross-window changes, including storage clear. */
function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === appearanceStorageKey || event.key === null) {
      memoryRaw = undefined;
      onChange();
    }
  };
  window.addEventListener(changeEvent, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener('storage', onStorage);
  };
}
/** Read preferences through a hydration-safe external store. */
export function useAppearance() {
  return parseAppearance(useSyncExternalStore(subscribe, readSnapshot, serverSnapshot));
}
/** Read current preferences outside React, guarding delayed font loads and the hydration effect. */
export function getAppearance() {
  return parseAppearance(readSnapshot());
}

/** Resolve the saved mode immediately, while keeping system changes optional. */
export function applyColorMode() {
  const { colorMode } = getAppearance();
  document.documentElement.dataset.colorScheme =
    colorMode === 'dark' ||
    (colorMode === 'system' &&
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-color-scheme: dark)').matches)
      ? 'dark'
      : 'light';
}

/** Apply only the latest font request, so a delayed load cannot overwrite a newer user choice. */
export function applyFontResult(requested: AppearanceFont, loaded: boolean) {
  if (getAppearance().font !== requested) return;
  document.documentElement.dataset.font = loaded ? requested : 'default';
  document.documentElement.dataset.fontError = loaded ? 'false' : 'true';
}
/** Apply an explicit validated choice immediately; return whether it was saved for the next launch. */
export function saveAppearance(value: AppearancePreferences): boolean {
  const preferences = parseAppearance(JSON.stringify(value));
  memoryRaw = JSON.stringify(preferences);
  let saved = true;
  try {
    localStorage.setItem(appearanceStorageKey, memoryRaw);
    memoryRaw = undefined;
  } catch {
    saved = false;
  }
  document.documentElement.dataset.theme = preferences.theme;
  document.documentElement.dataset.font = preferences.font;
  applyColorMode();
  window.dispatchEvent(new Event(changeEvent));
  return saved;
}
/** Load the chosen local variable font and reject real network/decode failures, so callers can show fallback. */
export async function loadAppearanceFont(font: AppearanceFont, retry = false) {
  if (font === 'default') return;
  if (!document.fonts) throw new Error('当前浏览器不支持自定义字体。');
  if (recoveredFaces.get(font)?.status === 'loaded') return;
  try {
    const faces = await document.fonts.load(
      `16px "${fontFamilies[font]}"`,
      '我的工作台 Threadline 09:30',
    );
    if (!faces.length) throw new Error('字体加载失败');
  } catch (error) {
    if (!retry) throw error;
    // A failed CSS-connected FontFace remains in an error state; a new loaded face enables a real retry.
    const source = font === 'source-han-sans' ? 'SourceHanSansSC' : 'SourceHanSerifSC';
    const face = new FontFace(fontFamilies[font], `url("/fonts/${source}.woff2")`, {
      weight: font === 'source-han-sans' ? '250 900' : '200 900',
      display: 'swap',
    });
    document.fonts.add(await face.load());
    recoveredFaces.set(font, face);
  }
}
