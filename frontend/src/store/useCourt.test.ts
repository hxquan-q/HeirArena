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

import { useCourt } from './useCourt'

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
})
