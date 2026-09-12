/** @fileoverview Device-only wardrobe and small sidebar companion; opening the native dialog never moves workspace content. */
'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppearance } from './appearance-store';
import { CottageAvatar, CottageSprite, type CottageOutfit } from './cottage-sprite';
import {
  CottageFurniture,
  CottageSparkles,
  type CottageFurnitureName,
} from './cottage-furniture';

const outfitKey = 'threadline.cottage.avatar.v1';
const furnishings: Record<string, CottageFurnitureName> = {
  home: 'sofa',
  calendar: 'swing',
  projects: 'claw',
  insights: 'tv',
  habits: 'bear',
  rhythm: 'bear',
  settings: 'desk',
};
const outfits = [
  { id: 'blue', label: '冰蓝裙装' },
  { id: 'pink', label: '粉色外套' },
  { id: 'casual', label: '彩虹日常' },
] as const;

/** Ignore malformed or unsupported saved outfits; old room decoration preferences remain untouched. */
export function parseCottageOutfit(value: string | null): CottageOutfit {
  return value === 'pink' || value === 'casual' ? value : 'blue';
}

/** Share one wardrobe state across desktop/mobile entries while mounting nothing in other themes. */
export function CottageCompanion({
  compact = false,
  view = 'home',
}: {
  compact?: boolean;
  view?: string;
}) {
  const { theme } = useAppearance();
  return theme === 'cottage' || theme === 'classic' ? (
    <Companion compact={compact} view={view} />
  ) : null;
}

/** Restore local dress on mount, synchronize tabs and clean up the one finite pet response timer. */
function Companion({ compact, view }: { compact: boolean; view: string }) {
  const [outfit, setOutfit] = useState<CottageOutfit>('blue');
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [pet, setPet] = useState(0);
  const [happy, setHappy] = useState(false);
  const [dressEffect, setDressEffect] = useState(0);
  const [machineEffect, setMachineEffect] = useState(0);
  const furniture = furnishings[view] ?? 'sofa';
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    /** Storage denial still permits a temporary outfit and does not block the workspace. */
    const restore = () => {
      try {
        setOutfit(parseCottageOutfit(localStorage.getItem(outfitKey)));
      } catch {
        /* Use the default outfit. */
      }
      setReady(true);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === outfitKey || event.key === null) restore();
    };
    restore();
    window.addEventListener('storage', onStorage);
    window.addEventListener('cottage-outfit-changed', restore);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('cottage-outfit-changed', restore);
      clearTimeout(timer.current);
    };
  }, []);
  /** Persist synchronously, so closing the dialog or immediately refreshing retains the choice. */
  const choose = (next: CottageOutfit) => {
    setOutfit(next);
    setDressEffect((value) => value + 1);
    try {
      localStorage.setItem(outfitKey, next);
      window.dispatchEvent(new Event('cottage-outfit-changed'));
      setNotice('');
    } catch {
      setNotice('当前设备无法保存，装扮仅保留在本次窗口。');
    }
  };
  /** A direct pet action produces a short silent response, never a looping distraction. */
  const petCat = () => {
    setPet((value) => value + 1);
    setHappy(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHappy(false), 2200);
  };
  return (
    <>
      <div
        className={`cottage-companion ${compact ? 'cottage-companion--compact' : 'cottage-companion--sidebar'}`}
        data-happy={happy}
      >
        <div className="cottage-sidebar-scene" aria-hidden="true">
          <span className="cottage-tiny-window">
            <i />
            <i />
            <i />
            <i />
          </span>
          <CottageFurniture
            key={view}
            name={furniture}
            className="cottage-sidebar-furniture"
          />
          <CottageSprite name="flower" className="cottage-sill-flowers" />
          <CottageAvatar outfit={outfit} />
          <CottageSprite name="cat" className="cottage-sill-cat" />
        </div>
        <button
          className="cottage-wardrobe-trigger"
          ref={trigger}
          type="button"
          onClick={() => setOpen(true)}
          disabled={!ready}
        >
          <CottageSprite name="settings" />
          <span>我的装扮</span>
          <span aria-hidden="true">›</span>
        </button>
      </div>
      {open && (
        <WardrobeDialog onClose={() => setOpen(false)} returnFocus={trigger}>
          <div className="cottage-dressing-stage">
            <span className="cottage-dressing-mirror" key={dressEffect}>
              <CottageAvatar outfit={outfit} />
              {dressEffect > 0 && <CottageSparkles />}
            </span>
            <button
              className="cottage-machine-button"
              type="button"
              aria-label="点亮抓娃娃机"
              onClick={() => setMachineEffect((value) => value + 1)}
            >
              <span
                key={machineEffect}
                className={machineEffect ? 'cottage-machine-is-lit' : undefined}
              >
                <CottageFurniture name="claw" />
                {machineEffect > 0 && <CottageSparkles />}
              </span>
            </button>
            <button
              className="cottage-pet-button"
              onClick={petCat}
              type="button"
              data-happy={happy}
              aria-label="摸摸小猫"
            >
              <CottageSprite name="cat" />
              {happy && (
                <span key={pet}>
                  <CottageSparkles />
                </span>
              )}
            </button>
          </div>
          <p className="cottage-pet-response" role="status">
            {happy
              ? [
                  '呼噜呼噜，今天也陪着你。',
                  '摸到了！再靠近你一点。',
                  '伸个懒腰，慢慢来也很好。',
                ][(pet - 1) % 3]
              : '今天想穿哪一套？'}
          </p>
          <fieldset className="cottage-outfits">
            <legend>我的搭配</legend>
            {outfits.map(({ id, label }) => (
              <button
                type="button"
                key={id}
                aria-pressed={outfit === id}
                onClick={() => choose(id)}
              >
                <CottageAvatar outfit={id} />
                <span>{label}</span>
                {outfit === id && <b aria-hidden="true">✓</b>}
              </button>
            ))}
          </fieldset>
          <p className="cottage-wardrobe-note" role="status">
            {notice || '装扮保存在此设备。'}
          </p>
        </WardrobeDialog>
      )}
    </>
  );
}

/** Native modal supplies inert background, focus trapping, Escape and focus return without changing page layout. */
function WardrobeDialog({
  onClose,
  children,
  returnFocus,
}: {
  onClose: () => void;
  children: React.ReactNode;
  returnFocus: React.RefObject<HTMLButtonElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const returnElement = returnFocus.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      returnElement?.focus();
    };
  }, [returnFocus]);
  return createPortal(
    <dialog
      ref={ref}
      className="cottage-wardrobe"
      aria-label="我的装扮"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <CottageSprite name="settings" />
        <h2>我的装扮</h2>
        <button type="button" onClick={onClose} aria-label="关闭装扮">
          ×
        </button>
      </header>
      {children}
    </dialog>,
    document.body,
  );
}
