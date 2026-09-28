/** @fileoverview 两人空间称呼、双方确认关系与解除绑定；历史入口不占用主页。 */
'use client';
import { useState } from 'react';
import { useTogether } from './state';
import { SpaceDialog } from './dialog';
import { useSpaceCommand } from './use-command';
import { relationshipLabel, memberName } from './copy';
import { spaceTime } from './time';
import { getAccountTimezone } from '@/lib/account-clock';
import type { Room, Relationship } from './types';
/** 表单固定打开时的空间版本，避免把迟到编辑应用到新关系。 */
export function SpaceSettings({
  room,
  onClose,
  onHistory,
}: {
  room?: Room;
  onClose: () => void;
  onHistory: (room: Room) => void;
}) {
  const { user, rooms } = useTogether();
  const command = useSpaceCommand();
  const [name, setName] = useState(
    room ? (user === room.user_a ? room.name_a : room.name_b) : '',
  );
  const [nickname, setNickname] = useState(
    room ? ((user === room.user_a ? room.nickname_b : room.nickname_a) ?? '') : '',
  );
  const [relation, setRelation] = useState<Relationship>(
    room?.relationship ?? 'friends',
  );
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [base] = useState(() =>
    room ? { room_id: room.id, version: room.version } : {},
  );
  /** 操作成功关闭设置，重新打开时读取新的版本与称呼。 */
  const save = async (action: string, extra: Record<string, unknown> = {}) => {
    if (await command.submit(action, { ...base, ...extra })) onClose();
  };
  return (
    <SpaceDialog
      title="空间设置"
      onClose={onClose}
      busy={command.busy}
      error={command.error}
    >
      {room && !room.ended_at && (
        <fieldset disabled={command.busy}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save('settings', { name: name.trim(), nickname: nickname.trim() });
            }}
          >
            <label>
              自己的展示名
              <input
                required
                maxLength={30}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              给对方的昵称
              <input
                maxLength={30}
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="只有你们两个人用的称呼"
              />
            </label>
            <button className="together-primary">保存称呼</button>
          </form>
          {(user === room.user_a ? room.nickname_a : room.nickname_b) && (
            <button onClick={() => void save('reset_nickname')}>恢复我的展示名</button>
          )}
          <label>
            关系类型
            <select
              value={relation}
              onChange={(event) => setRelation(event.target.value as Relationship)}
            >
              <option value="friends">好朋友</option>
              <option value="couple">情侣</option>
            </select>
          </label>
          <button
            disabled={relation === room.relationship}
            onClick={() =>
              void save('propose_relationship', { relationship: relation })
            }
          >
            请对方确认关系
          </button>
          {room.proposed_by && (
            <p>
              {room.proposed_by === user
                ? '已发出关系变更，等待对方确认。'
                : `对方想绑定为${relationshipLabel[room.proposed_relationship!]}`}
            </p>
          )}
          {room.proposed_by && room.proposed_by !== user && (
            <div className="together-actions">
              <button
                onClick={() => void save('answer_relationship', { accept: true })}
              >
                确认关系
              </button>
              <button
                onClick={() => void save('answer_relationship', { accept: false })}
              >
                保留现在的关系
              </button>
            </div>
          )}
          <details open={confirmEnd}>
            <summary
              onClick={(event) => {
                event.preventDefault();
                setConfirmEnd(!confirmEnd);
              }}
            >
              解除绑定
            </summary>
            <button className="together-danger" onClick={() => void save('end_room')}>
              解除并结束未完成的 flag
            </button>
          </details>
        </fieldset>
      )}
      <details>
        <summary>以前的空间</summary>
        {rooms
          .filter((item) => item.ended_at)
          .map((item) => (
            <button
              className="together-history-link"
              key={item.id}
              onClick={() => onHistory(item)}
            >
              {memberName(item, item.user_a)}与{memberName(item, item.user_b)}
              <small>{spaceTime(item.ended_at!, getAccountTimezone())}结束</small>
            </button>
          ))}
        {!rooms.some((item) => item.ended_at) && (
          <p className="together-muted">还没有以前的空间。</p>
        )}
      </details>
    </SpaceDialog>
  );
}
