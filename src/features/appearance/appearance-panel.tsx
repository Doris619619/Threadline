/** @fileoverview Provides real theme previews and comparable Chinese font samples with independent device preferences. */
'use client';
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { ThemeChoices } from './theme-choices';
import {
  getAppearance,
  applyFontResult,
  loadAppearanceFont,
  saveAppearance,
  useAppearance,
} from './appearance-store';
import type { AppearanceFont, AppearancePreferences } from './appearance-preferences';

const fonts: { id: AppearanceFont; label: string }[] = [
  { id: 'default', label: '默认字体' },
  { id: 'source-han-sans', label: '思源黑体' },
  { id: 'source-han-serif', label: '思源宋体' },
];
/** Preview fonts on entering this screen; do not preload unused fonts on the ordinary workspace. */
export function AppearancePanel() {
  const preferences = useAppearance();
  const [notice, setNotice] = useState('');
  const [unavailable, setUnavailable] = useState<AppearanceFont[]>([]);
  const [previewLoading, setPreviewLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      fonts.map(async ({ id }) => {
        try {
          await loadAppearanceFont(id);
          return undefined;
        } catch {
          return id;
        }
      }),
    ).then((results) => {
      if (!cancelled) {
        setUnavailable(results.filter((id): id is AppearanceFont => id !== undefined));
        setPreviewLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  /** Persist each choice independently; a font failure retains the user's last readable selection. */
  const select = async (next: AppearancePreferences) => {
    setNotice('');
    const saved = saveAppearance(next);
    if (!saved) setNotice('当前无法保存设置；本次窗口仍可使用所选外观。');
    try {
      await loadAppearanceFont(next.font, true);
      setUnavailable((items) => items.filter((id) => id !== next.font));
      // A successful retry of the same choice also restores its root attribute.
      applyFontResult(next.font, true);
    } catch {
      if (getAppearance().font === next.font) {
        applyFontResult(next.font, false);
        setNotice('字体未能加载，暂时显示默认字体，请再次点击重试。');
      }
    }
  };
  return (
    <div className="appearance-panel">
      <p className="appearance-intro">
        让工作台更像你。主题与字体分别选择，仅保存在当前设备。
      </p>
      <ThemeChoices
        theme={preferences.theme}
        onSelect={(theme) => void select({ ...preferences, theme })}
      />
      <fieldset className="appearance-section">
        <legend>明暗模式</legend>
        <div className="appearance-mode-options">
          {(
            [
              { id: 'light', label: '浅色' },
              { id: 'dark', label: '深色' },
              { id: 'system', label: '跟随系统' },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className="appearance-mode-option"
              aria-pressed={preferences.colorMode === id}
              onClick={() => void select({ ...preferences, colorMode: id })}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="appearance-hint">
          立即生效，下次打开仍保留。与主题配色独立选择。
        </p>
      </fieldset>
      <fieldset className="appearance-section">
        <legend>字体</legend>
        <div className="appearance-font-options">
          {fonts.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className="appearance-font-option"
              aria-pressed={preferences.font === id}
              onClick={() => void select({ ...preferences, font: id })}
            >
              <span className="appearance-option-label">
                <strong>{label}</strong>
                <Check size={18} aria-hidden="true" />
              </span>
              <span className="appearance-font-sample" data-font={id}>
                把时间留给重要的事<span>Threadline · 09:30 · 2026</span>
              </span>
              {unavailable.includes(id) && <small>字体暂未加载，点击重试</small>}
              {previewLoading && id !== 'default' && <small>正在加载字体预览…</small>}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="appearance-hint" role="status">
        {notice}
      </p>
    </div>
  );
}
