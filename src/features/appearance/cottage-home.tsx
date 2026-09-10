/** @fileoverview Optional cottage companion with local decoration, calm pet feedback and derived completion flowers. */
'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Paintbrush } from 'lucide-react';
import { useAppearance } from './appearance-store';
import { CottageCat, CottageScene } from './cottage-scene';

type RoomPreferences = { decor: 'star' | 'bunny' | 'hydrangea'; collapsed: boolean };
const roomKey = 'threadline.cottage.v1';
const defaultRoom: RoomPreferences = { decor: 'star', collapsed: false };
const decorations = [
  { id: 'star', label: '星星坐垫', description: '在小屋中央放一颗奶油星星' },
  { id: 'bunny', label: '兔兔抱枕', description: '在小屋中央放一只软软的兔子' },
  { id: 'hydrangea', label: '绣球花盆', description: '在小屋中央放一盆淡紫绣球' },
] as const;

/** Treat stored decoration as untrusted; damaged and legacy data safely starts with the star cushion. */
export function parseRoomPreferences(raw: string | null): RoomPreferences {
  try {
    const value = JSON.parse(raw ?? 'null');
    return {
      decor:
        value?.decor === 'bunny' || value?.decor === 'hydrangea' ? value.decor : 'star',
      collapsed: value?.collapsed === true,
    };
  } catch {
    return defaultRoom;
  }
}

/** Mount the companion only for its selected theme, keeping existing themes and compact mode undisturbed. */
export function CottageHome(props: { completed: number; date: string }) {
  const { theme } = useAppearance();
  return theme === 'cottage' ? <CottageRoom {...props} /> : null;
}

/** Room changes are device-only; flowers derive from business totals and never write tasks or rewards. */
function CottageRoom({ completed, date }: { completed: number; date: string }) {
  const [room, setRoom] = useState(defaultRoom);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const [petCount, setPetCount] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const previous = useRef(completed);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    /** Synchronize only this device's room settings; unrelated storage changes do not touch the companion. */
    const restore = () => {
      try {
        setRoom(parseRoomPreferences(localStorage.getItem(roomKey)));
      } catch {
        /* A blocked read still permits a temporary room. */
      }
      setReady(true);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === roomKey || event.key === null) restore();
    };
    restore();
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    if (completed > previous.current) {
      setPetCount(0);
      setCelebrating(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCelebrating(false), 2600);
    } else if (completed < previous.current) {
      // Undo or a rolled-back save must not keep celebrating a completion that no longer exists.
      clearTimeout(timer.current);
      setCelebrating(false);
    }
    previous.current = completed;
  }, [completed]);
  /** Save synchronously before a reload; persistence failures are visible without undoing the current choice. */
  const saveRoom = (next: RoomPreferences) => {
    setRoom(next);
    try {
      localStorage.setItem(roomKey, JSON.stringify(next));
      setNotice('');
    } catch {
      setNotice('布置暂存于本次窗口，当前设备无法保存。');
    }
  };
  /** Petting is a short, silent response; repeated clicks restart one timer instead of stacking animations. */
  const pet = () => {
    setPetCount((count) => count + 1);
    setCelebrating(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCelebrating(false), 2600);
  };
  const message = celebrating
    ? petCount > 0
      ? [
          '呼噜呼噜，今天也陪着你。',
          '摸到了！再靠近你一点。',
          '小猫伸了个懒腰，陪你慢慢来。',
        ][(petCount - 1) % 3]
      : '又做好了一件事，小猫替你开心。'
    : completed > 0
      ? '你认真生活的痕迹，都在这里。'
      : '小猫已经把你的位置留好了。';
  return (
    <section
      className="cottage-home"
      aria-label="我的皮卡小屋"
      data-collapsed={room.collapsed}
      data-ready={ready}
    >
      <div className="cottage-copy">
        <span className="cottage-eyebrow">MY LITTLE HOME</span>
        <h2>{room.collapsed ? '小猫在家，安心做事。' : '欢迎回家呀'}</h2>
        {!room.collapsed && (
          <p className="cottage-message" role="status">
            {message}
          </p>
        )}
        {!room.collapsed && (
          <div className="cottage-actions">
            <button
              type="button"
              className="cottage-pet"
              onClick={pet}
              aria-label="摸摸小猫"
            >
              <CottageCat happy={celebrating} />
              <span>摸摸小猫</span>
            </button>
            <button
              type="button"
              className="cottage-decorate"
              onClick={() => setEditing(!editing)}
              aria-expanded={editing}
              aria-controls="cottage-decorations"
            >
              <Paintbrush size={15} aria-hidden="true" />
              布置小屋
            </button>
          </div>
        )}
        {!room.collapsed && (
          <p className="cottage-progress">
            {date.slice(5).replace('-', '.')} ·{' '}
            {completed > 0
              ? `已做好 ${completed} 件事，小屋里的花开了`
              : '小屋里的花，陪你从第一件事开始'}
          </p>
        )}
      </div>
      {!room.collapsed && (
        <div className="cottage-art">
          <CottageScene
            decor={room.decor}
            flowers={Math.min(5, completed)}
            happy={celebrating}
            onPet={pet}
          />
        </div>
      )}
      <button
        className="cottage-collapse"
        type="button"
        disabled={!ready}
        onClick={() => {
          saveRoom({ ...room, collapsed: !room.collapsed });
          setEditing(false);
        }}
        aria-label={room.collapsed ? '展开小屋' : '收起小屋'}
        aria-expanded={!room.collapsed}
      >
        {room.collapsed ? (
          <ChevronDown size={16} aria-hidden="true" />
        ) : (
          <ChevronUp size={16} aria-hidden="true" />
        )}
      </button>
      {editing && !room.collapsed && (
        <fieldset id="cottage-decorations" className="cottage-decorations">
          <legend>给小屋添一点可爱</legend>
          {decorations.map(({ id, label, description }) => (
            <button
              type="button"
              key={id}
              disabled={!ready}
              aria-pressed={room.decor === id}
              onClick={() => saveRoom({ ...room, decor: id })}
              title={description}
            >
              <i data-decor={id} aria-hidden="true" />
              {label}
              {room.decor === id && <span aria-hidden="true">✓</span>}
            </button>
          ))}
          <small>随心换，布置保存在此设备。</small>
        </fieldset>
      )}
      {notice && (
        <p className="cottage-notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
