/** @fileoverview 两人空间主页：两个切换项、分组列表和详情抽屉；历史与设置按需打开。 */
'use client';
import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Heart, Plus, Settings2, ArrowLeft, ChevronRight, Gift } from 'lucide-react';
import { getAccountTimezone } from '@/lib/account-clock';
import { useAccountTimezone } from '@/features/settings/account-timezone-provider';
import { useTogether } from './state';
import { togetherCopy, memberName, address, statusLabel } from './copy';
import { readFlags, checkSpaceError } from './repository';
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
        <div>
          <span className="together-eyebrow">
            {room?.ended_at ? '以前的空间 · 只读' : '只属于你们两个人'}
          </span>
          <h1>{room ? togetherCopy[room.relationship].title : '两人空间'}</h1>
        </div>
        <button
          className="together-icon-button"
          aria-label="空间设置"
          onClick={() => setSettings(true)}
        >
          <Settings2 size={20} />
        </button>
      </header>
      <SpaceClock />
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
      <div className="together-pair">
        <div className="together-avatars" aria-hidden="true">
          <span>{Array.from(memberName(room, room.user_a))[0]}</span>
          <span>{Array.from(memberName(room, room.user_b))[0]}</span>
        </div>
        <div>
          <strong>
            {memberName(room, room.user_a)}
            <span className="together-muted"> 与 </span>
            {memberName(room, room.user_b)}
          </strong>
          <p>{copy.intro}</p>
        </div>
        {room.relationship === 'couple' && (
          <small className="together-score">
            <Heart size={14} aria-hidden="true" />
            好感度 {room.affection}
          </small>
        )}
      </div>
      {latest.data && (
        <p className="together-room-notice">
          {memberName(room, latest.data.actor)}
          {latest.data.body} · {spaceTime(latest.data.created_at, getAccountTimezone())}
        </p>
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
        <>
          <FlagList room={room} mode="review" title="等我验收" onOpen={setDetail} />
          <FlagList
            room={room}
            mode="mine"
            title="我的小目标"
            onOpen={setDetail}
            empty={address(copy.empty, partner)}
          />
          <FlagList
            room={room}
            mode="theirs"
            title={`${partner}的小目标`}
            onOpen={setDetail}
          />
        </>
      ) : (
        <FlagList
          room={room}
          mode="completed"
          title="一起见证过的努力"
          onOpen={setDetail}
          empty="完成的每一件小事，都会留在这里。"
        />
      )}
      <button
        className="together-ended-toggle"
        aria-expanded={ended}
        onClick={() => setEnded(!ended)}
      >
        已结束的约定 <ChevronRight size={14} />
      </button>
      {ended && (
        <FlagList
          room={room}
          mode="cancelled"
          title="已结束的约定"
          onOpen={setDetail}
          empty="这里还没有结束的约定。"
        />
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
/** 分组独立分页使待验收始终置顶；回忆不加载图片，仅按需读取惊喜标记。 */
function FlagList({
  room,
  mode,
  title,
  empty,
  onOpen,
}: {
  room: Room;
  mode: 'review' | 'mine' | 'theirs' | 'completed' | 'cancelled';
  title: string;
  empty?: string;
  onOpen: (flag: Flag) => void;
}) {
  const { client, cache, user } = useTogether();
  useAccountTimezone();
  const zone = getAccountTimezone();
  const query = useInfiniteQuery(
    {
      queryKey: ['together', user, 'flags', room.id, mode],
      initialPageParam: 0,
      queryFn: ({ pageParam, signal }) =>
        readFlags(client!, room.id, user, mode, pageParam, signal),
      getNextPageParam: (last, pages) =>
        last.length === 20 ? pages.length : undefined,
    },
    cache,
  );
  const flags = query.data?.pages.flat() ?? [];
  const surprises = useQuery(
    {
      queryKey: ['together', user, 'surprises', room.id, flags.map((flag) => flag.id)],
      enabled: mode === 'completed' && flags.length > 0,
      queryFn: async ({ signal }) => {
        const response = await client!
          .from('together_events')
          .select('flag_id')
          .eq('kind', 'surprise')
          .in(
            'flag_id',
            flags.map((flag) => flag.id),
          )
          .abortSignal(signal);
        checkSpaceError(response.error);
        return response.data?.map((item) => item.flag_id) ?? [];
      },
    },
    cache,
  );
  if (!query.isPending && !query.error && !flags.length && !empty) return null;
  return (
    <section className="together-list">
      <h2>{title}</h2>
      {query.isPending && <p role="status">正在读取 flag…</p>}
      {query.error && (
        <p role="alert">
          {query.error.message}
          <button onClick={() => void query.refetch()}>重新读取</button>
        </p>
      )}
      {!query.isPending && !query.error && !flags.length && (
        <p className="together-empty-copy">{empty}</p>
      )}
      {flags.map((flag) => (
        <article className="together-flag" key={flag.id} data-status={flag.status}>
          <div className="together-flag-text">
            <small>
              {memberName(room, flag.owner_id)} · {statusLabel[flag.status]}
            </small>
            <button className="together-flag-title" onClick={() => onOpen(flag)}>
              {flag.title}
            </button>
            <p>
              {mode === 'completed'
                ? `完成于 ${spaceTime(flag.completed_at!, zone)}`
                : `截止 ${spaceTime(flag.deadline, zone)}`}
            </p>
            {flag.reward && <p className="together-reward">完成后：{flag.reward}</p>}
            {surprises.data?.includes(flag.id) && (
              <span className="together-gift">
                <Gift size={14} />
                有一份小惊喜
              </span>
            )}
          </div>
          <button
            className={mode === 'review' ? 'together-primary' : 'together-open'}
            onClick={() => onOpen(flag)}
          >
            {mode === 'review'
              ? '看看成果'
              : flag.owner_id === user &&
                  ['active', 'changes'].includes(flag.status) &&
                  !room.ended_at
                ? '提交成果'
                : '查看'}
            <ChevronRight size={16} />
          </button>
        </article>
      ))}
      {query.hasNextPage && (
        <button
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? '正在读取…' : '再看一些'}
        </button>
      )}
    </section>
  );
}
