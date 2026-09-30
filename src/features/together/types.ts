/** @fileoverview 两人空间独立领域类型；数据库字段保留 snake_case，时间均为绝对时刻。 */
export type Relationship = 'friends' | 'couple';
export type FlagStatus = 'active' | 'submitted' | 'changes' | 'completed' | 'cancelled';
export type Room = {
  id: string;
  user_a: string;
  user_b: string;
  name_a: string;
  name_b: string;
  nickname_a: string | null;
  nickname_b: string | null;
  relationship: Relationship;
  proposed_relationship: Relationship | null;
  proposed_by: string | null;
  affection: number;
  version: number;
  created_at: string;
  ended_at: string | null;
};
export type Flag = {
  id: string;
  room_id: string;
  owner_id: string;
  title: string;
  description: string;
  reward: string;
  deadline: string;
  timezone: string;
  status: FlagStatus;
  version: number;
  first_submitted_at: string | null;
  current_submission_id: string | null;
  completed_at: string | null;
  created_at: string;
  cancelled_reason: string | null;
};
export type SpaceEvent = {
  id: string;
  room_id: string;
  flag_id: string | null;
  actor: string;
  kind:
    | 'created'
    | 'edited'
    | 'submitted'
    | 'changes'
    | 'approved'
    | 'cancelled'
    | 'cheered'
    | 'surprise'
    | 'nickname'
    | 'relationship'
    | 'ended';
  body: string;
  points: number;
  created_at: string;
};
export type Invite = {
  id: string;
  code: string;
  relationship: Relationship;
  expires_at: string;
};
export type InvitePreview = { id: string; name: string; relationship: Relationship };
export type CommandResult = { points?: number; flag?: Flag } & Record<string, unknown>;
export type Command = { id: string; action: string; payload: Record<string, unknown> };
