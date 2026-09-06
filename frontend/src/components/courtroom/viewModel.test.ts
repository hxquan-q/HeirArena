import { describe, expect, it } from 'vitest'
import type { Turn } from '../../types'
import { selectStageTurn, statusLabel } from './viewModel'

const turn = (id: string, ts: number, done = true): Turn => ({
  turn_id: id,
  agent_id: `agent-${id}`,
  phase: 'debate',
  round: 1,
  text: `发言 ${id}`,
  done,
  ts,
})

describe('selectStageTurn', () => {
  it('prefers the active turn even when it is older than the recent window', () => {
    expect(selectStageTurn([turn('old', 1, false)], 'old', 100_000)?.turn_id).toBe('old')
  })

  it('falls back to the newest recent turn', () => {
    expect(selectStageTurn([turn('a', 80_000), turn('b', 95_000)], null, 100_000)?.turn_id).toBe('b')
  })

  it('returns null when the latest completed turn is stale', () => {
    expect(selectStageTurn([turn('old', 1)], null, 100_000)).toBeNull()
  })
})

it('provides a non-color status label for every agent state', () => {
  expect((['idle', 'thinking', 'speaking', 'angry', 'happy'] as const).map(statusLabel))
    .toEqual(['待命', '思考中', '发言中', '生气', '开心'])
})
