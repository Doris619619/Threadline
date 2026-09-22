/** @fileoverview 区分本会话首次完整加载和之后的后台同步状态。 */
import { useState } from 'react';
/** 账号改变清零；本会话首次就绪后不因后台错误重新遮挡工作台。 */
export function useSessionReadiness(owner: string, complete: boolean): boolean {
  const [state, setState] = useState({ owner, ready: complete });
  if (state.owner !== owner || (complete && !state.ready)) {
    setState({ owner, ready: complete });
    return complete;
  }
  return state.ready;
}
