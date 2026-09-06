import type { AgentStatus } from '../../types'

export function agentMotionClass(status: AgentStatus, animated = true): string {
  return animated ? `agent-motion-${status}` : ''
}
