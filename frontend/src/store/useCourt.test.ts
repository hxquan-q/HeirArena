import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SseEventType } from '../api/client'

const subscription = vi.hoisted(() => ({
  onEvent: undefined as ((type: SseEventType, data: Record<string, unknown>) => void) | undefined,
  onError: undefined as (() => void) | undefined,
}))

vi.mock('../api/client', () => ({
  subscribe: (
    _sessionId: string,
    onEvent: (type: SseEventType, data: Record<string, unknown>) => void,
    onError?: () => void,
  ) => {
    subscription.onEvent = onEvent
    subscription.onError = onError
    return () => undefined
  },
}))

import { selectIsMyTurn, selectMe, useCourt } from './useCourt'

describe('useCourt SSE connection state', () => {
  beforeEach(() => {
    useCourt.getState().reset()
    subscription.onEvent = undefined
    subscription.onError = undefined
  })

  it('marks the connection restored when an event arrives after an error', () => {
    const close = useCourt.getState().connect('session-1')
    subscription.onEvent?.('session_start', {
      agents: [],
      mode: 'mock',
      model: 'scripted',
      case: {},
      legal: {},
      article_short: {},
    })
    expect(useCourt.getState().connected).toBe(true)

    subscription.onError?.()
    expect(useCourt.getState().connected).toBe(false)

    subscription.onEvent?.('notice', { text: 'stream resumed' })
    expect(useCourt.getState().connected).toBe(true)
    close()
  })

  it('replays seat session into awaiting then clears on player speech', () => {
    const close = useCourt.getState().connect('seat-1')
    subscription.onEvent?.('session_start', {
      agents: [{ id: 'daughter', name: '王小美' }],
      mode: 'mock',
      model: 'scripted',
      case: {
        seat: {
          player_id: 'daughter',
          seat_human: true,
          goals: {},
          advisor_model: null,
          strategy: { player_id: 'daughter', matrix: [], briefs: {}, generated_by: 'rules' },
        },
      },
      legal: {},
      article_short: {},
      seat: { player_id: 'daughter', seat_human: true },
    })
    expect(useCourt.getState().seat).toEqual({ playerId: 'daughter', human: true })
    expect(useCourt.getState().strategy?.player_id).toBe('daughter')

    subscription.onEvent?.('awaiting_player', {
      turn_key: 'statements:0:daughter',
      phase: 'statements',
      round: 0,
      attacked_by: null,
      focus: '学区房归属',
      cards_pending: true,
    })
    expect(selectIsMyTurn(useCourt.getState())).toBe(true)
    expect(useCourt.getState().cardsPending).toBe(true)
    expect(useCourt.getState().awaiting?.focus).toBe('学区房归属')

    subscription.onEvent?.('cards', {
      cards: [{ id: 'c1', title: '要相册', text: '请把相册给我', responds_to: null, action: 'propose', claims: {}, suggests_admission: null, serves: [], risk_note: '' }],
    })
    expect(useCourt.getState().cards).toHaveLength(1)
    expect(useCourt.getState().cardsPending).toBe(false)

    subscription.onEvent?.('speech_start', {
      turn_id: 't9', agent_id: 'daughter', phase: 'statements', round: 0,
    })
    expect(useCourt.getState().awaiting).toBeNull()
    expect(useCourt.getState().cards).toEqual([])
    expect(selectMe(useCourt.getState())?.id).toBe('daughter')
    close()
  })

  it('clears awaiting when seat switches to AI', () => {
    const close = useCourt.getState().connect('seat-2')
    subscription.onEvent?.('session_start', {
      agents: [{ id: 'daughter', name: '王小美' }],
      mode: 'mock',
      model: 'scripted',
      case: { seat: { player_id: 'daughter', seat_human: true, goals: {}, advisor_model: null, strategy: null } },
      legal: {},
      article_short: {},
      seat: { player_id: 'daughter', seat_human: true },
    })
    subscription.onEvent?.('awaiting_player', {
      turn_key: 'k', phase: 'negotiation', round: 0, attacked_by: null, cards_pending: false,
    })
    subscription.onEvent?.('seat', { human: false })
    expect(useCourt.getState().seat?.human).toBe(false)
    expect(useCourt.getState().awaiting).toBeNull()
    close()
  })

  it('stores debrief and ignores seat events on spectator sessions', () => {
    const close = useCourt.getState().connect('watch-1')
    subscription.onEvent?.('session_start', {
      agents: [],
      mode: 'mock',
      model: 'scripted',
      case: {},
      legal: {},
      article_short: {},
    })
    expect(useCourt.getState().seat).toBeNull()
    subscription.onEvent?.('debrief', {
      scorecards: {},
      narrative: '下一局少让步',
      next_time: ['把目标定在可达区间内'],
      whatif_recap: [],
      generated_by: 'rules',
    })
    expect(useCourt.getState().debrief?.narrative).toBe('下一局少让步')
    subscription.onEvent?.('awaiting_player', { turn_key: 'x', phase: 'statements', round: 0 })
    expect(useCourt.getState().awaiting?.turn_key).toBe('x')
    close()
  })
})
