/** @fileoverview 简短 flag 表单；默认账号当天截止，首次提交后由服务端锁定目标。 */
'use client';
import { useState, type FormEvent } from 'react';
import { getAccountTimezone, timezoneLabel } from '@/lib/account-clock';
import { togetherCopy, memberName, address } from './copy';
import { SpaceDialog } from './dialog';
import { defaultDeadline, localDeadline, deadlineInstant } from './time';
import { useSpaceCommand } from './use-command';
import { useTogether } from './state';
import type { Flag, Room } from './types';
/** 打开时固定编辑版本与账号时区；服务器冲突保留输入，不自动覆盖。 */
export function FlagEditor({
  room,
  flag,
  onClose,
}: {
  room: Room;
  flag?: Flag;
  onClose: () => void;
}) {
  const { user } = useTogether();
  const command = useSpaceCommand();
  const [zone] = useState(getAccountTimezone);
  const [title, setTitle] = useState(flag?.title ?? '');
  const [reward, setReward] = useState(flag?.reward ?? '');
  const [description, setDescription] = useState(flag?.description ?? '');
  const [deadline, setDeadline] = useState(() =>
    flag ? localDeadline(flag.deadline, zone) : defaultDeadline(zone),
  );
  const partner = memberName(room, user === room.user_a ? room.user_b : room.user_a);
  /** 完成墙钟转换后发送一次完整意图；成功才关闭。 */
  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await command.submit(flag ? 'edit_flag' : 'create_flag', {
        room_id: room.id,
        ...(flag ? { flag_id: flag.id, version: flag.version } : {}),
        title: title.trim(),
        description,
        reward,
        deadline: deadlineInstant(deadline, zone),
        timezone: zone,
      });
      if (result) onClose();
    } catch (error) {
      command.setError(error instanceof Error ? error.message : '请检查输入。');
    }
  };
  return (
    <SpaceDialog
      title={flag ? '编辑 flag' : '立个 flag'}
      onClose={onClose}
      {...command}
    >
      <form onSubmit={(event) => void save(event)}>
        <fieldset disabled={command.busy}>
          <label>
            目标
            <input
              autoFocus
              required
              maxLength={100}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={address(
                togetherCopy[room.relationship].placeholder,
                partner,
              )}
            />
          </label>
          <label>
            截止时间
            <input
              required
              type="datetime-local"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
            />
          </label>
          <small>按你的时区填写：{timezoneLabel(zone)}</small>
          <label>
            完成后的奖励 <small>选填</small>
            <input
              maxLength={200}
              value={reward}
              onChange={(event) => setReward(event.target.value)}
              placeholder="奖励自己一杯奶茶"
            />
          </label>
          <details open={flag?.description ? true : undefined}>
            <summary>补充说明</summary>
            <label>
              怎样算完成
              <textarea
                maxLength={1000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="例如：完成默写，正确率达到 90%"
              />
            </label>
          </details>
          <p className="together-muted">请{partner}见证，成果通过微信发送。</p>
          <button className="together-primary" type="submit">
            {flag ? '保存修改' : '立下 flag'}
          </button>
        </fieldset>
      </form>
    </SpaceDialog>
  );
}
