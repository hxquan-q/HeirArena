import { describe, expect, it } from 'vitest'
import { agentMotionClass } from './agentMotion'

describe('agentMotionClass', () => {
  it('gives every animated state a distinct motion contract', () => {
    expect(agentMotionClass('idle')).toBe('agent-motion-idle')
    expect(agentMotionClass('thinking')).toBe('agent-motion-thinking')
    expect(agentMotionClass('speaking')).toBe('agent-motion-speaking')
    expect(agentMotionClass('angry')).toBe('agent-motion-angry')
    expect(agentMotionClass('happy')).toBe('agent-motion-happy')
  })

  it('disables state motion when animation is disabled', () => {
    expect(agentMotionClass('speaking', false)).toBe('')
  })
})
