/** @fileoverview 目标优先的轻量编辑器；属性集中排列，默认账号当天截止，提交后由服务端锁定。 */
'use client';
import { useState, type FormEvent } from 'react';
import {
  CalendarDays,
  ChevronDown,
  Gift,
  NotebookPen,
  ArrowUpRight,
} from 'lucide-react';
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
      className="together-editor"
      onClose={onClose}
      {...command}
    >
      <form onSubmit={(event) => void save(event)}>
        <fieldset disabled={command.busy}>
          <label className="together-editor-goal">
            <span className="sr-only">目标</span>
            <textarea
              autoFocus
              required
              rows={2}
              maxLength={100}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={address(
                togetherCopy[room.relationship].placeholder,
                partner,
              ).replace('？', '？\n')}
            />
          </label>
          <div className="together-editor-properties">
            <label className="together-editor-property">
              <span className="together-editor-caption">
                <CalendarDays size={15} aria-hidden="true" />
                截止时间
              </span>
              <input
                required
                type="datetime-local"
                title={timezoneLabel(zone)}
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
              />
            </label>
            <label className="together-editor-property">
              <span className="together-editor-caption">
                <Gift size={15} aria-hidden="true" />
                完成后的奖励<span className="together-optional">（选填）</span>
              </span>
              <input
                maxLength={200}
                value={reward}
                onChange={(event) => setReward(event.target.value)}
                placeholder="奖励自己一杯奶茶"
              />
            </label>
          </div>
          <details
            className="together-editor-notes"
            open={flag?.description ? true : undefined}
          >
            <summary>
              <NotebookPen size={15} aria-hidden="true" />
              <span>补充说明</span>
              <ChevronDown
                className="together-editor-chevron"
                size={15}
                aria-hidden="true"
              />
            </summary>
            <label>
              <span>
                怎样算完成<span className="together-optional">（选填）</span>
              </span>
              <textarea
                maxLength={1000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="例如：完成默写，正确率达到 90%"
              />
            </label>
          </details>
          <footer className="together-editor-footer">
            <button className="together-primary" type="submit">
              {flag ? '保存修改' : '立下 flag'}
              <ArrowUpRight size={17} aria-hidden="true" />
            </button>
          </footer>
        </fieldset>
      </form>
    </SpaceDialog>
  );
}
