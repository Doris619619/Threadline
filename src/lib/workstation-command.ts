/** @fileoverview 工作站仅传递成员命令与排序锚点，禁止用旧的整集合替换服务器成员。 */
export type WorkstationCommand =
  | { type: 'add'; id: string }
  | { type: 'remove'; id: string }
  | { type: 'clear'; ids: string[] }
  | { type: 'move'; id: string; anchor: string; after: boolean };
/** 仅在本地预览指定意图；缺失锚点最终由服务端拒绝并刷新。 */
export function previewWorkstationCommand(
  ids: string[],
  command: WorkstationCommand,
): string[] {
  if (command.type === 'add')
    return ids.includes(command.id) ? ids : [...ids, command.id];
  if (command.type === 'remove') return ids.filter((id) => id !== command.id);
  if (command.type === 'clear') return ids.filter((id) => !command.ids.includes(id));
  const next = ids.filter((id) => id !== command.id);
  const index = next.indexOf(command.anchor);
  if (index < 0 || !ids.includes(command.id)) return ids;
  next.splice(index + (command.after ? 1 : 0), 0, command.id);
  return next;
}
