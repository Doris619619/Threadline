/** @fileoverview 待我验收入口和最新微信成果摘要；只展示当前账号应处理的成果，不自动通过。 */
'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Inbox, MessageCircle } from 'lucide-react';
import { useTogether } from './state';
import { readFlags } from './repository';
import { address, memberName, togetherCopy } from './copy';
import { spaceTime } from './time';
import type { Flag, Room, SpaceEvent } from './types';

/** 入口在两个页签中均可见；直接打开待验收成果，避免手机用户先翻过自己的目标。 */
export function ReviewEntry({
  room,
  onOpen,
}: {
  room: Room;
  onOpen: (flag: Flag) => void;
}) {
  const { client, cache, user, pending } = useTogether();
  const query = useQuery(
    {
      queryKey: ['together', user, 'review-entry', room.id],
      enabled: !room.ended_at && pending > 0,
      queryFn: ({ signal }) => readFlags(client!, room.id, user, 'review', 0, signal),
    },
    cache,
  );
  if (room.ended_at || !pending) return null;
  if (query.isSuccess && !query.data.length) return null;
  const next = query.data?.[0];
  return (
    <aside className="together-review-entry" aria-label="待我验收">
      <Inbox size={20} aria-hidden="true" />
      <div className="together-review-entry-text">
        <strong>
          待我验收 <span>{pending}</span>
        </strong>
        <span>{query.error ? '成果暂未读取' : (next?.title ?? '正在读取成果…')}</span>
      </div>
      {query.error ? (
        <button onClick={() => void query.refetch()}>重试</button>
      ) : (
        <button disabled={!next} onClick={() => next && onOpen(next)}>
          去验收 <ArrowRight size={16} aria-hidden="true" />
        </button>
      )}
    </aside>
  );
}

/** 最新提交先于历史呈现；原图仍走微信，操作只在可验收且读取成功时提供。 */
export function ReviewSubmission({
  room,
  submission,
  mine,
  zone,
  canReview,
  onApprove,
  onChanges,
}: {
  room: Room;
  submission: SpaceEvent;
  mine: boolean;
  zone: string;
  canReview: boolean;
  onApprove: () => void;
  onChanges: () => void;
}) {
  const copy = togetherCopy[room.relationship];
  const witness = memberName(
    room,
    submission.actor === room.user_a ? room.user_b : room.user_a,
  );
  return (
    <section className="together-submission" aria-label="最新成果">
      <div className="together-submission-heading">
        <h3>{mine ? '我提交的成果' : `${memberName(room, submission.actor)}的成果`}</h3>
        <span>
          <MessageCircle size={14} aria-hidden="true" />
          微信已发送
        </span>
      </div>
      <time dateTime={submission.created_at} title={zone}>
        {spaceTime(submission.created_at, zone)} 提交
      </time>
      {submission.body && <p className="together-prewrap">{submission.body}</p>}
      <p className="together-submission-hint">
        {mine ? address(copy.waiting, witness) : '成果图片在微信里，看过后再来验收。'}
      </p>
      {canReview && (
        <div className="together-review-actions">
          <button className="together-primary" onClick={onApprove}>
            {copy.approve}
          </button>
          <button onClick={onChanges}>{copy.changes}</button>
        </div>
      )}
    </section>
  );
}
