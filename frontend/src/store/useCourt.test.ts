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

  it('applies a court evidence event once and updates the legal preview', () => {
    const close = useCourt.getState().connect('seat-evidence')
    const option = {
      fact_key: 'main_support:daughter',
      subject_id: 'daughter',
      subject_name: '王小美',
      subject_kind: 'member',
      lever: 'main_support',
      label: '证明王小美尽了主要扶养义务',
      article: '1130',
      delta_pct: 8,
      direction: 'favorable',
      evidence_types: ['住院陪护记录'],
      burden: '由主张多分的一方举证',
      note: '',
    }
    subscription.onEvent?.('session_start', {
      agents: [{ id: 'daughter', name: '王小美', legal_percent: 40 }],
      mode: 'mock',
      model: 'scripted',
      case: {
        decedent_name: '老王',
        story: '',
        assets: [],
        members: [{ id: 'daughter', name: '王小美', main_support: false }],
        seat: { player_id: 'daughter', seat_human: true, goals: {}, advisor_model: null, strategy: null },
      },
      legal: { shares: [{ member_id: 'daughter', percent: 40 }] },
      article_short: {},
      seat: { player_id: 'daughter', seat_human: true },
      evidence_options: [option],
    })
    expect(useCourt.getState().evidenceOptions[0]?.fact_key).toBe(option.fact_key)

    const evidence = {
      id: 'ev-1',
      turn_key: 'statements:0:daughter',
      submitted_by: 'daughter',
      ...option,
      evidence_type: '住院陪护记录',
      note: '连续三年的陪护记录',
      submitted_at: 1_700_000_000,
      status: 'accepted_for_simulation',
    }
    const legal = { shares: [{ member_id: 'daughter', percent: 48 }] }
    subscription.onEvent?.('evidence', { evidence, legal })
    expect(useCourt.getState().submittedEvidence).toHaveLength(1)
    expect(useCourt.getState().caseData?.members[0]?.main_support).toBe(true)
    expect(useCourt.getState().legal?.shares[0]?.percent).toBe(48)
    expect(useCourt.getState().agents[0]?.legal_percent).toBe(48)

    subscription.onEvent?.('evidence', { evidence, legal })
    expect(useCourt.getState().submittedEvidence).toHaveLength(1)
    expect(useCourt.getState().caseData?.members[0]?.main_support).toBe(true)
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
