/** @fileoverview 已有账号的邀请码绑定；明确展示双方关系，不公开邮箱、不增加注册入口。 */
'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UsersRound, Copy } from 'lucide-react';
import { useTogether } from './state';
import { checkSpaceError } from './repository';
import { useSpaceCommand } from './use-command';
import { relationshipLabel } from './copy';
import { spaceTime } from './time';
import { getAccountTimezone } from '@/lib/account-clock';
import type { Invite, InvitePreview, Relationship } from './types';
/** 先保存空间名再提供邀请或接受；忙碌只锁定表单，预览不是接受，绑定仍由最终明确点击完成。 */
export function BindingPanel() {
  const { client, cache, user } = useTogether();
  const command = useSpaceCommand();
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState<Relationship>('friends');
  const [mode, setMode] = useState<'invite' | 'accept'>('invite');
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState('');
  const profile = useQuery(
    {
      queryKey: ['together', user, 'profile'],
      queryFn: async () => {
        const response = await client!
          .from('together_profiles')
          .select('*')
          .eq('user_id', user)
          .maybeSingle();
        checkSpaceError(response.error);
        return response.data as { display_name: string } | null;
      },
    },
    cache,
  );
  const invite = useQuery(
    {
      queryKey: ['together', user, 'invite'],
      queryFn: async () => {
        const response = await client!
          .from('together_invites')
          .select('*')
          .eq('creator', user)
          .eq('revoked', false)
          .gt('expires_at', new Date().toISOString())
          .order('expires_at', { ascending: false })
          .limit(1);
        checkSpaceError(response.error);
        return (response.data?.[0] ?? null) as Invite | null;
      },
    },
    cache,
  );
  /** 邀请码预览独立锁定输入并标记 busy；重试保留错误到成功，绑定只接受明确的已有账号关系。 */
  const inspect = async () => {
    setChecking(true);
    setPreview(null);
    try {
      const response = await client!.rpc('together_preview_invite', { p_code: code });
      checkSpaceError(response.error);
      setPreview(response.data as InvitePreview);
      command.setError('');
    } catch (reason) {
      command.setError(
        reason instanceof Error ? reason.message : '无法读取邀请，请重试。',
      );
    } finally {
      setChecking(false);
    }
  };
  return (
    <section className="together-binding" aria-busy={command.busy || checking}>
      <UsersRound className="together-binding-icon" size={36} aria-hidden="true" />
      <h2>找一个人，见证彼此的小目标。</h2>
      <p>
        一次只绑定一个人。目标各自完成，成果通过微信分享，在这里给彼此一个认真回应。
      </p>
      {profile.isPending ? (
        <p role="status">正在读取空间资料…</p>
      ) : profile.error ? (
        <p role="alert">{profile.error.message}</p>
      ) : !profile.data ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void command.submit('profile', { name: name.trim() });
          }}
        >
          <fieldset disabled={command.busy}>
            <label>
              先告诉对方怎么称呼你
              <input
                required
                maxLength={30}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="空间展示名，不使用邮箱"
              />
            </label>
            <button type="submit" className="together-primary">
              保存称呼
            </button>
          </fieldset>
        </form>
      ) : (
        <>
          <p className="together-muted">你在这里叫「{profile.data.display_name}」</p>
          <div className="together-tabs">
            <button aria-pressed={mode === 'invite'} onClick={() => setMode('invite')}>
              邀请一个人
            </button>
            <button aria-pressed={mode === 'accept'} onClick={() => setMode('accept')}>
              输入邀请码
            </button>
          </div>
          <fieldset disabled={command.busy || checking}>
            {mode === 'invite' ? (
              <>
                <label>
                  我们的关系
                  <select
                    value={relationship}
                    onChange={(event) =>
                      setRelationship(event.target.value as Relationship)
                    }
                  >
                    <option value="friends">好朋友</option>
                    <option value="couple">情侣</option>
                  </select>
                </label>
                {invite.error && <p role="alert">{invite.error.message}</p>}
                {invite.data ? (
                  <div className="together-invite">
                    <p>{relationshipLabel[invite.data.relationship]}邀请</p>
                    <code>{invite.data.code}</code>
                    <small>
                      有效至 {spaceTime(invite.data.expires_at, getAccountTimezone())}
                    </small>
                    <div className="together-actions">
                      <button
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(invite.data!.code)
                            .then(() => setNotice('邀请码已复制，通过微信发给对方吧。'))
                            .catch(() => setNotice('复制失败，请手动选择邀请码复制。'));
                        }}
                      >
                        <Copy size={16} />
                        复制邀请码
                      </button>
                      <button
                        onClick={() =>
                          void command.submit('revoke_invite', { id: invite.data!.id })
                        }
                      >
                        撤销邀请
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="together-primary"
                    disabled={invite.isPending}
                    onClick={() => void command.submit('invite', { relationship })}
                  >
                    生成邀请码
                  </button>
                )}
              </>
            ) : (
              <>
                <label>
                  对方的邀请码
                  <input
                    value={code}
                    maxLength={32}
                    autoComplete="off"
                    onChange={(event) => {
                      setCode(event.target.value.trim().toUpperCase());
                      setPreview(null);
                    }}
                  />
                </label>
                {preview ? (
                  <div className="together-invite">
                    <p>
                      {preview.name}邀请你绑定为
                      <strong>{relationshipLabel[preview.relationship]}</strong>。
                    </p>
                    <div className="together-actions">
                      <button
                        className="together-primary"
                        onClick={() =>
                          void command.submit('accept_invite', { id: preview.id })
                        }
                      >
                        接受邀请
                      </button>
                      <button onClick={() => setPreview(null)}>取消</button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="together-primary"
                    disabled={!code || checking}
                    onClick={() => void inspect()}
                  >
                    查看邀请
                  </button>
                )}
              </>
            )}
          </fieldset>
        </>
      )}
      {command.error && (
        <p className="together-error" role="alert">
          {command.error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
