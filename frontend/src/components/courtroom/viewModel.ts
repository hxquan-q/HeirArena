import type { AgentStatus, Turn } from '../../types'

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: '待命',
  thinking: '思考中',
  speaking: '发言中',
  angry: '生气',
  happy: '开心',
}

export function statusLabel(status: AgentStatus): string {
  return STATUS_LABEL[status]
}

export function selectStageTurn(
  turns: Turn[],
  activeTurnId: string | null,
  now: number,
  maxAgeMs = 60_000,
): Turn | null {
  if (activeTurnId) {
    const active = turns.find((item) => item.turn_id === activeTurnId)
    if (active) return active
  }

  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (now - turns[index].ts <= maxAgeMs) return turns[index]
  }

  return null
}
