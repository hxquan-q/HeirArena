import { describe, expect, it } from 'vitest'
import { SSE_EVENTS } from './client'

describe('SSE_EVENTS', () => {
  it('includes the four seat-mode events and stays a closed set of 19', () => {
    expect(SSE_EVENTS).toContain('seat')
    expect(SSE_EVENTS).toContain('awaiting_player')
    expect(SSE_EVENTS).toContain('cards')
    expect(SSE_EVENTS).toContain('debrief')
    expect(SSE_EVENTS.length).toBe(19)
  })
})
