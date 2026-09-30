/** @fileoverview Flag 详情和微信成果声明、验收、惊喜；每一步独立请求，保留全部提交历史。 */
'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAccountTimezone, timezoneLabel } from '@/lib/account-clock';
import { useAccountTimezone } from '@/features/settings/account-timezone-provider';
import { useTogether } from './state';
import { readEvents, checkSpaceError } from './repository';
import { SpaceDialog } from './dialog';
import { ReviewSubmission } from './review';
import { useSpaceCommand } from './use-command';
import { togetherCopy, memberName, address, statusLabel } from './copy';
import { spaceTime, isLate } from './time';
import type { Flag, Room } from './types';
const eventTitles: Record<string, string> = {
  created: '立下 flag',
  edited: '修改了约定',
  submitted: '已通过微信发送成果',
  changes: '请补充一下',
  approved: '验收通过',
  cancelled: '结束了这条 flag',
  cheered: '送来鼓励',
  surprise: '送来小惊喜',
};
/** 详情持续跟随服务端；操作面板固定版本，冲突时不会偷偷采用新版继续写入。 */
export function FlagDetail({
  initial,
  room,
  onClose,
  onEdit,
}: {
  initial: Flag;
  room: Room;
  onClose: () => void;
  onEdit: (flag: Flag) => void;
}) {
  const { client, cache, user } = useTogether();
  useAccountTimezone();
  const zone = getAccountTimezone();
  const [action, setAction] = useState<{ kind: string; flag: Flag } | null>(null);
  const [notice, setNotice] = useState('');
  const query = useQuery(
    {
      queryKey: ['together', user, 'flag', initial.id],
      initialData: initial,
      staleTime: 0,
      queryFn: async ({ signal }) => {
        const response = await client!
          .from('together_flags')
          .select('*')
          .eq('id', initial.id)
          .abortSignal(signal)
          .single();
        checkSpaceError(response.error);
        return response.data as Flag;
      },
    },
    cache,
  );
  const events = useQuery(
    {
      queryKey: ['together', user, 'events', initial.id],
      queryFn: ({ signal }) => readEvents(client!, initial.id, signal),
    },
    cache,
  );
  const flag = query.data;
  const copy = togetherCopy[room.relationship];
  const mine = flag.owner_id === user;
  const ended = !!room.ended_at || flag.status === 'cancelled';
  const cheered = events.data?.some((item) => item.kind === 'cheered');
  const surprised = events.data?.some((item) => item.kind === 'surprise');
  const submission = events.data?.filter((item) => item.kind === 'submitted').at(-1);
  const review = !mine && flag.status === 'submitted' && !ended;
  return (
    <SpaceDialog title={flag.title} onClose={onClose} drawer>
      <div className="together-detail-meta">
        <div className="together-detail-owner">
          <span>{memberName(room, flag.owner_id)}</span>
          <span className="together-detail-status">
            {review
              ? '待我验收'
              : mine && flag.status === 'submitted'
                ? '等对方验收'
                : statusLabel[flag.status]}
          </span>
        </div>
        <time dateTime={flag.deadline} title={timezoneLabel(zone)}>
          截止 {spaceTime(flag.deadline, zone)}
        </time>
      </div>
      {flag.description && (
        <section>
          <h3>怎样算完成</h3>
          <p className="together-prewrap">{flag.description}</p>
        </section>
      )}
      {query.error && <p role="alert">{query.error.message}</p>}
      {events.isPending && <p role="status">正在读取成果…</p>}
      {events.error && (
        <p role="alert">
          {events.error.message}
          <button onClick={() => void events.refetch()}>重新读取</button>
        </p>
      )}
      {flag.status === 'submitted' && submission && (
        <ReviewSubmission
          room={room}
          submission={submission}
          mine={mine}
          zone={zone}
          canReview={review && !query.error && !events.error}
          onApprove={() => setAction({ kind: 'approve', flag })}
          onChanges={() => setAction({ kind: 'changes', flag })}
        />
      )}
      {flag.reward && (
        <section>
          <h3>完成后的奖励</h3>
          <p className="together-prewrap">{flag.reward}</p>
        </section>
      )}
      {!ended && flag.status !== 'completed' && isLate(flag) && (
        <p className="together-muted">{copy.overdue}</p>
      )}
      {flag.first_submitted_at && flag.status !== 'submitted' && (
        <p>
          首次提交：{spaceTime(flag.first_submitted_at, zone)} ·{' '}
          {isLate(flag) ? '截止后提交' : '按时提交'}
        </p>
      )}
      {flag.status === 'completed' && (
        <p className="together-completed">
          {mine ? copy.approved : '已验收通过，这份努力由你见证。'}
        </p>
      )}
      {flag.cancelled_reason && <p>{flag.cancelled_reason}</p>}
      {notice && (
        <p className="together-affection" role="status">
          {notice === '好感度 +1' && <span aria-hidden="true">♥ </span>}
          {notice}
        </p>
      )}
      {!ended && !events.isPending && !events.error && (
        <div className="together-actions">
          {mine && ['active', 'changes'].includes(flag.status) && (
            <button
              className="together-primary"
              onClick={() => setAction({ kind: 'submit', flag })}
            >
              {copy.submit}
            </button>
          )}
          {!mine &&
            !['submitted', 'completed', 'cancelled'].includes(flag.status) &&
            !cheered && (
              <button onClick={() => setAction({ kind: 'cheer', flag })}>
                {copy.cheer}
              </button>
            )}
          {!mine && flag.status === 'completed' && !surprised && (
            <button onClick={() => setAction({ kind: 'surprise', flag })}>
              送个小惊喜
            </button>
          )}
          {mine && !flag.first_submitted_at && flag.status === 'active' && (
            <button onClick={() => onEdit(flag)}>编辑约定</button>
          )}
          {mine && flag.status !== 'completed' && (
            <button onClick={() => setAction({ kind: 'cancel_flag', flag })}>
              结束这条 flag
            </button>
          )}
        </div>
      )}
      {action && (
        <FlagAction
          key={`${action.kind}:${action.flag.version}`}
          room={room}
          flag={action.flag}
          action={action.kind}
          onClose={() => setAction(null)}
          onDone={(points) => {
            setAction(null);
            setNotice(points ? '好感度 +1' : '已保存');
          }}
        />
      )}
      <details className="together-timeline" open={flag.status !== 'submitted'}>
        <summary>这件事的过程</summary>
        {events.data?.map((item) => (
          <article key={item.id}>
            <strong>
              {memberName(room, item.actor)} ·{' '}
              {item.kind === 'cheered'
                ? address(copy.cheered, memberName(room, item.actor))
                : item.kind === 'surprise'
                  ? address(copy.surprise, memberName(room, item.actor))
                  : eventTitles[item.kind]}
            </strong>
            <time dateTime={item.created_at}>{spaceTime(item.created_at, zone)}</time>
            {item.body && <p className="together-prewrap">{item.body}</p>}
            {item.points > 0 && room.relationship === 'couple' && (
              <small>好感度 +{item.points}</small>
            )}
          </article>
        ))}
      </details>
    </SpaceDialog>
  );
}
/** 一次操作一张小表单，执行人明确声明微信已发；验收不依赖惊喜发送成功。 */
function FlagAction({
  room,
  flag,
  action,
  onClose,
  onDone,
}: {
  room: Room;
  flag: Flag;
  action: string;
  onClose: () => void;
  onDone: (points: number) => void;
}) {
  const command = useSpaceCommand();
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(false);
  const copy = togetherCopy[room.relationship];
  const title =
    action === 'submit'
      ? copy.submit
      : action === 'approve'
        ? copy.approve
        : action === 'changes'
          ? copy.changes
          : action === 'cheer'
            ? copy.cheer
            : action === 'surprise'
              ? '送个小惊喜'
              : '结束这条 flag';
  return (
    <SpaceDialog
      title={title}
      onClose={onClose}
      busy={command.busy}
      error={command.error}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void command
            .submit(action, {
              room_id: room.id,
              flag_id: flag.id,
              version: flag.version,
              body,
              ...(action === 'submit' ? { wechat_sent: sent } : {}),
            })
            .then((result) => {
              if (result) onDone(result.points ?? 0);
            });
        }}
      >
        <fieldset disabled={command.busy}>
          {action === 'submit' && (
            <>
              <p>请先在微信把成果发给对方，再回来提交。对方验收通过后才算完成。</p>
              <label className="together-check">
                <input
                  type="checkbox"
                  required
                  checked={sent}
                  onChange={(event) => setSent(event.target.checked)}
                />
                已通过微信发送成果
              </label>
            </>
          )}
          {action === 'approve' && (
            <p>请确认已经看过微信里的成果，并符合这条 flag 的约定。</p>
          )}
          {action === 'surprise' && (
            <p>在这里留一句奖励说明；照片或其他礼物通过微信发送。</p>
          )}
          {action === 'cancel_flag' ? (
            <p>结束后保留记录，不计为完成，也不扣好感度。</p>
          ) : (
            action !== 'cheer' && (
              <label>
                {action === 'changes'
                  ? '需要补充什么'
                  : action === 'approve'
                    ? '留一句夸奖（选填）'
                    : action === 'surprise'
                      ? '给对方的小惊喜'
                      : '成果说明（选填）'}
                <textarea
                  autoFocus
                  maxLength={1000}
                  required={action === 'changes' || action === 'surprise'}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
              </label>
            )
          )}
          <button
            className={
              action === 'cancel_flag' ? 'together-danger' : 'together-primary'
            }
          >
            {action === 'submit'
              ? '确认发送，交给对方验收'
              : action === 'cancel_flag'
                ? '确认结束'
                : action === 'surprise'
                  ? '送给对方'
                  : title}
          </button>
        </fieldset>
      </form>
    </SpaceDialog>
  );
}
