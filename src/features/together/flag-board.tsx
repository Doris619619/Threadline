/** @fileoverview 将待验收、双方目标放进同一便笺网格；查询仍独立分页，待验收始终排在前面。 */
'use client';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { FlagTriangleRight } from 'lucide-react';
import { useTogether } from './state';
import { readFlags, checkSpaceError } from './repository';
import { getAccountTimezone } from '@/lib/account-clock';
import { useAccountTimezone } from '@/features/settings/account-timezone-provider';
import { FlagCard } from './flag-card';
import type { Flag, Room } from './types';

/** 无额外分组标题，所有目标采用相同的卡片结构；回忆只请求轻量的互动标记。 */
export function FlagList({
  room,
  mode,
  empty,
  onOpen,
}: {
  room: Room;
  mode: 'review' | 'mine' | 'theirs' | 'completed' | 'cancelled';
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
      {flags.map((flag) => (
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
      ))}
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
