/** @fileoverview 一张约定便笺承载目标、时间与奖励；卡片内可直接加油，详情保留完整验收过程。 */
'use client';
import { ArrowUpRight, Check, Clock3, Gift, Heart, Mail, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { memberName, statusLabel, togetherCopy } from './copy';
import { shortSpaceTime, spaceTime } from './time';
import { useTogether } from './state';
import { useSpaceCommand } from './use-command';
import type { Flag, Room } from './types';

/** 取称呼末字作印记，避免小桃和小熊都显示为“小”；完整称呼始终同时展示。 */
export function nameMark(name: string) {
  return Array.from(name).at(-1) ?? '你';
}

/** 次要互动只影响当前卡片；按钮可键盘操作，网络失败原位显示并保留稳定请求。 */
export function FlagCard({
  flag,
  room,
  zone,
  cheered,
  surprise,
  marksReady,
  onOpen,
}: {
  flag: Flag;
  room: Room;
  zone: string;
  cheered: boolean;
  surprise: boolean;
  marksReady: boolean;
  onOpen: (flag: Flag) => void;
}) {
  const { user } = useTogether();
  const command = useSpaceCommand();
  const [feedback, setFeedback] = useState('');
  const mine = flag.owner_id === user;
  const review = !mine && flag.status === 'submitted' && !room.ended_at;
  const completed = flag.status === 'completed';
  const ongoing = !room.ended_at && !['completed', 'cancelled'].includes(flag.status);
  const name = memberName(room, flag.owner_id);
  const date = completed ? flag.completed_at! : flag.deadline;
  /** 鼓励是一次轻触，不再弹出确认表单；实际加分仍由数据库事务决定。 */
  const cheer = async () => {
    const result = await command.submit('cheer', {
      room_id: room.id,
      flag_id: flag.id,
      version: flag.version,
    });
    if (result) setFeedback(result.points ? '好感度 +1' : '加油已送到');
  };
  return (
    <article
      className="together-note"
      data-status={flag.status}
      data-review={review}
      data-mine={mine}
    >
      <div className="together-note-top">
        <span className="together-note-author">
          <i aria-hidden="true">{nameMark(name)}</i>
          <span>{mine ? '我' : name}</span>
        </span>
        <span className="together-note-status">
          {completed ? (
            <Check size={13} aria-hidden="true" />
          ) : (
            <span className="together-status-dot" />
          )}
          {review ? '等你验收' : statusLabel[flag.status]}
        </span>
      </div>
      <button className="together-note-title" onClick={() => onOpen(flag)}>
        {flag.title}
      </button>
      <time
        className="together-note-time"
        dateTime={date}
        title={`${spaceTime(date, zone)} · ${zone}`}
      >
        <Clock3 size={13} aria-hidden="true" />
        {shortSpaceTime(date, zone)}
        {completed ? ' · 已见证' : ' 截止'}
      </time>
      <div className="together-note-footer">
        <div className="together-note-reward" title={flag.reward || undefined}>
          {flag.reward && (
            <>
              <Gift size={15} aria-hidden="true" />
              <span>{flag.reward}</span>
            </>
          )}
        </div>
        <div className="together-note-actions">
          {!mine && ongoing && (
            <button
              className="together-cheer"
              title={cheered ? '已为 TA 加油' : togetherCopy[room.relationship].cheer}
              aria-label={
                cheered ? '已为 TA 加油' : togetherCopy[room.relationship].cheer
              }
              disabled={command.busy || cheered || !marksReady}
              onClick={() => void cheer()}
              data-sent={cheered}
            >
              <Heart size={18} fill={cheered ? 'currentColor' : 'none'} />
            </button>
          )}
          {mine && cheered && (
            <span
              className="together-note-loved"
              title="对方在为你加油"
              aria-label="对方在为你加油"
            >
              <Heart size={16} fill="currentColor" />
            </span>
          )}
          <button
            className={['together-note-open', review && 'is-review']
              .filter(Boolean)
              .join(' ')}
            onClick={() => onOpen(flag)}
          >
            {surprise ? (
              <>
                <Mail size={16} />
                拆惊喜
              </>
            ) : review ? (
              '看看成果'
            ) : mine && ongoing && ['active', 'changes'].includes(flag.status) ? (
              '提交成果'
            ) : (
              '查看'
            )}
            <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      {completed && (
        <span className="together-note-seal" aria-hidden="true">
          <Sparkles size={17} />
        </span>
      )}
      {feedback && (
        <span className="together-note-feedback" role="status">
          <Heart size={13} />
          {feedback}
        </span>
      )}
      {command.error && (
        <p className="together-error" role="alert">
          {command.error}
        </p>
      )}
    </article>
  );
}
