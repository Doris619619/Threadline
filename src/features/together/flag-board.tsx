/** @fileoverview 按执行人分栏展示便笺；双方各自分页，待验收置顶于对方栏。 */
'use client';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { FlagTriangleRight } from 'lucide-react';
import { useTogether } from './state';
import { readFlags, checkSpaceError } from './repository';
import { getAccountTimezone } from '@/lib/account-clock';
import { useAccountTimezone } from '@/features/settings/account-timezone-provider';
import { FlagCard } from './flag-card';
import { MemoryTimeline } from './memory-timeline';
import type { Flag, Room } from './types';
import { memberName } from './copy';

/** 所有状态固定分为我与对方，切换身份时由当前登录者重新确定归属。 */
export function FlagLanes({
  room,
  mode,
  onOpen,
}: {
  room: Room;
  mode: 'active' | 'completed' | 'cancelled';
  onOpen: (flag: Flag) => void;
}) {
  const { user } = useTogether();
  const partner = memberName(room, user === room.user_a ? room.user_b : room.user_a);
  return (
    <div className="together-lanes">
      {(['mine', 'theirs'] as const).map((owner) => (
        <section
          className="together-lane"
          key={owner}
          aria-label={owner === 'mine' ? '我的 flag' : '对方的 flag'}
        >
          <h2 className="together-lane-heading">
            <span>{owner === 'mine' ? '我的 flag' : '对方的 flag'}</span>
            <small>{owner === 'mine' ? memberName(room, user) : partner}</small>
          </h2>
          <div className="together-lane-list">
            {mode === 'active' && owner === 'theirs' && (
              <FlagList room={room} mode="review" onOpen={onOpen} />
            )}
            <FlagList
              room={room}
              mode={mode === 'active' ? owner : mode}
              owner={owner}
              onOpen={onOpen}
              empty={
                mode === 'active'
                  ? owner === 'mine'
                    ? '立个小目标，请对方见证。'
                    : '等 TA 立下一个小目标。'
                  : mode === 'completed'
                    ? '完成的目标会留在这里。'
                    : '还没有结束的约定。'
              }
            />
          </div>
        </section>
      ))}
    </div>
  );
}

/** 列内独立分页；历史查询也在服务端按执行人过滤，不在客户端截断后分组。 */
export function FlagList({
  room,
  mode,
  empty,
  onOpen,
  owner,
}: {
  room: Room;
  mode: 'review' | 'mine' | 'theirs' | 'completed' | 'cancelled';
  empty?: string;
  onOpen: (flag: Flag) => void;
  owner?: 'mine' | 'theirs';
}) {
  const { client, cache, user } = useTogether();
  useAccountTimezone();
  const zone = getAccountTimezone();
  const query = useInfiniteQuery(
    {
      queryKey: ['together', user, 'flags', room.id, mode, owner],
      initialPageParam: 0,
      queryFn: ({ pageParam, signal }) =>
        readFlags(client!, room.id, user, mode, pageParam, signal, owner),
      getNextPageParam: (last, pages) =>
        last.length === 20 ? pages.length : undefined,
    },
    cache,
  );
  const flags = query.data?.pages.flat() ?? [];
  const marks = useQuery(
    {
      queryKey: ['together', user, 'card-marks', room.id, flags.map((flag) => flag.id)],
      enabled: flags.length > 0,
      queryFn: async ({ signal }) => {
        const response = await client!
          .from('together_events')
          .select('flag_id,kind')
          .in('kind', ['cheered', 'surprise'])
          .in(
            'flag_id',
            flags.map((flag) => flag.id),
          )
          .abortSignal(signal);
        checkSpaceError(response.error);
        return response.data as { flag_id: string; kind: string }[];
      },
    },
    cache,
  );
  return (
    <>
      {query.isPending && (
        <div
          className="together-note-skeleton"
          role="status"
          aria-label="正在读取目标"
        />
      )}
      {query.error && (
        <p className="together-error" role="alert">
          {query.error.message}
          <button onClick={() => void query.refetch()}>重新读取</button>
        </p>
      )}
      {!query.isPending && !query.error && !flags.length && empty && (
        <div className="together-board-empty">
          <FlagTriangleRight size={28} aria-hidden="true" />
          <p>{empty}</p>
        </div>
      )}
      {mode === 'completed' ? (
        <MemoryTimeline
          flags={flags}
          zone={zone}
          onOpen={onOpen}
          surprises={
            new Set(
              marks.data
                ?.filter((event) => event.kind === 'surprise')
                .map((event) => event.flag_id),
            )
          }
        />
      ) : (
        flags.map((flag) => (
          <FlagCard
            key={flag.id}
            room={room}
            flag={flag}
            zone={zone}
            onOpen={onOpen}
            cheered={
              !!marks.data?.some(
                (event) => event.flag_id === flag.id && event.kind === 'cheered',
              )
            }
            surprise={
              !!marks.data?.some(
                (event) => event.flag_id === flag.id && event.kind === 'surprise',
              )
            }
            marksReady={!!marks.data}
          />
        ))
      )}
      {marks.error && (
        <p className="together-error" role="alert">
          互动暂未读取。<button onClick={() => void marks.refetch()}>重试</button>
        </p>
      )}
      {query.hasNextPage && (
        <button
          className="together-load-more"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? '正在读取…' : '再看一些'}
        </button>
      )}
    </>
  );
}
