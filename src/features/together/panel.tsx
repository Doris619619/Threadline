/** @fileoverview 两人空间紧凑页头与统一目标便笺；历史、称呼消息和详情按需展开。 */
'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Heart, Plus, Settings2, ArrowLeft, ChevronRight, Link2 } from 'lucide-react';
import { getAccountTimezone } from '@/lib/account-clock';
import { useAccountTimezone } from '@/features/settings/account-timezone-provider';
import { useTogether } from './state';
import { togetherCopy, memberName, address } from './copy';
import { checkSpaceError } from './repository';
import { FlagList } from './flag-board';
import { nameMark } from './flag-card';
import { spaceTime } from './time';
import { SpaceClock } from './clock';
import { BindingPanel } from './binding';
import { SpaceSettings } from './settings';
import { FlagEditor } from './flag-editor';
import { FlagDetail } from './flag-detail';
import type { Flag, Room, SpaceEvent } from './types';
/** 页面使用当前关系或显式打开的旧空间；旧空间不会污染导航绑定状态。 */
export function TogetherPanel() {
  const store = useTogether();
  const [historyId, setHistoryId] = useState<string>();
  const [settings, setSettings] = useState(false);
  const room = historyId
    ? store.rooms.find((item) => item.id === historyId)
    : store.room;
  return (
    <div className="together-page" data-relationship={room?.relationship ?? 'friends'}>
      <header className="together-heading">
        <div className="together-identity">
          {room && (
            <div
              className="together-pair"
              aria-label={`${memberName(room, room.user_a)}与${memberName(room, room.user_b)}`}
            >
              <span className="together-person" title={memberName(room, room.user_a)}>
                {nameMark(memberName(room, room.user_a))}
              </span>
              <span className="together-pair-link" aria-hidden="true">
                {room.relationship === 'couple' ? (
                  <Heart size={14} fill="currentColor" />
                ) : (
                  <Link2 size={14} />
                )}
              </span>
              <span className="together-person" title={memberName(room, room.user_b)}>
                {nameMark(memberName(room, room.user_b))}
              </span>
            </div>
          )}
          <div className="together-heading-text">
            <h1>{room ? togetherCopy[room.relationship].title : '两人空间'}</h1>
            {room && (
              <div className="together-byline">
                <span>
                  {memberName(room, room.user_a)} & {memberName(room, room.user_b)}
                </span>
                {room.relationship === 'couple' && (
                  <span
                    className="together-score"
                    title="每次鼓励、见证与惊喜，都会留下一个小心意"
                  >
                    <Heart size={12} aria-hidden="true" />
                    好感度 {room.affection}
                  </span>
                )}
                {room.ended_at && <span>只读</span>}
              </div>
            )}
          </div>
        </div>
        <div className="together-heading-tools">
          <SpaceClock />
          <button
            className="together-icon-button"
            aria-label="空间设置"
            onClick={() => setSettings(true)}
          >
            <Settings2 size={19} />
          </button>
        </div>
      </header>
      {historyId && (
        <button className="together-back" onClick={() => setHistoryId(undefined)}>
          <ArrowLeft size={16} />
          回到现在的空间
        </button>
      )}
      {!store.client ? (
        <section className="together-empty">
          <h2>找一个人，见证彼此的小目标。</h2>
          <p>请使用已有账号登录后开启两人空间。当前演示不连接真实账号。</p>
        </section>
      ) : store.loading ? (
        <p role="status">正在打开两人空间…</p>
      ) : (
        <>
          {store.error && (
            <div className="together-error" role="alert">
              {store.error}
              <button onClick={() => void store.refresh()}>重新读取</button>
            </div>
          )}
          {store.syncError && <p className="together-muted">{store.syncError}</p>}
          {room ? (
            <RoomContent
              key={room.id}
              room={room}
              onSettings={() => setSettings(true)}
            />
          ) : (
            !store.error && <BindingPanel />
          )}
        </>
      )}
      {settings && (
        <SpaceSettings
          key={room?.id}
          room={room}
          onClose={() => setSettings(false)}
          onHistory={(old) => {
            setSettings(false);
            setHistoryId(old.id);
          }}
        />
      )}
    </div>
  );
}
/** 主体只显示当前事项或已完成回忆；表单与抽屉覆盖显示而不卸载列表。 */
function RoomContent({ room, onSettings }: { room: Room; onSettings: () => void }) {
  const { user, client, cache } = useTogether();
  useAccountTimezone();
  const [tab, setTab] = useState<'active' | 'completed'>(
    room.ended_at ? 'completed' : 'active',
  );
  const [ended, setEnded] = useState(false);
  const [editing, setEditing] = useState<Flag | 'new' | null>(null);
  const [detail, setDetail] = useState<Flag | null>(null);
  const copy = togetherCopy[room.relationship];
  const partner = memberName(room, user === room.user_a ? room.user_b : room.user_a);
  const latest = useQuery(
    {
      queryKey: ['together', user, 'room-notice', room.id],
      queryFn: async ({ signal }) => {
        const response = await client!
          .from('together_events')
          .select('*')
          .eq('room_id', room.id)
          .is('flag_id', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .abortSignal(signal);
        checkSpaceError(response.error);
        return (response.data?.[0] ?? null) as SpaceEvent | null;
      },
    },
    cache,
  );
  return (
    <>
      {latest.data && latest.data.actor !== user && latest.data.kind === 'nickname' && (
        <details className="together-room-notice">
          <summary>称呼更新了</summary>
          <p>
            {memberName(room, latest.data.actor)}
            {latest.data.body} ·{' '}
            {spaceTime(latest.data.created_at, getAccountTimezone())}
          </p>
        </details>
      )}
      {room.proposed_by && !room.ended_at && (
        <p className="together-room-notice">
          {room.proposed_by === user
            ? '关系变更已发出，等待对方确认。'
            : `${partner}发来了关系变更。`}
          <button onClick={onSettings}>查看</button>
        </p>
      )}
      <div className="together-toolbar">
        <div className="together-tabs" aria-label="空间内容">
          <button aria-pressed={tab === 'active'} onClick={() => setTab('active')}>
            正在进行
          </button>
          <button
            aria-pressed={tab === 'completed'}
            onClick={() => setTab('completed')}
          >
            我们的回忆
          </button>
        </div>
        {!room.ended_at && (
          <button className="together-primary" onClick={() => setEditing('new')}>
            <Plus size={18} aria-hidden="true" />
            立个 flag
          </button>
        )}
      </div>
      {tab === 'active' ? (
        <div className="together-board">
          <FlagList room={room} mode="review" onOpen={setDetail} />
          <FlagList
            room={room}
            mode="mine"
            onOpen={setDetail}
            empty={address(copy.empty, partner)}
          />
          <FlagList room={room} mode="theirs" onOpen={setDetail} />
        </div>
      ) : (
        <div className="together-board together-memory-board">
          <FlagList
            room={room}
            mode="completed"
            onOpen={setDetail}
            empty="完成的每一件小事，都会留在这里。"
          />
        </div>
      )}
      <button
        className="together-ended-toggle"
        aria-expanded={ended}
        onClick={() => setEnded(!ended)}
      >
        已结束的约定 <ChevronRight size={14} />
      </button>
      {ended && (
        <div className="together-board">
          <FlagList
            room={room}
            mode="cancelled"
            onOpen={setDetail}
            empty="这里还没有结束的约定。"
          />
        </div>
      )}
      {detail && (
        <FlagDetail
          initial={detail}
          room={room}
          onClose={() => setDetail(null)}
          onEdit={(flag) => {
            setDetail(null);
            setEditing(flag);
          }}
        />
      )}
      {editing && (
        <FlagEditor
          room={room}
          flag={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
