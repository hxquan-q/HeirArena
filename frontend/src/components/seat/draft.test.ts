import { describe, expect, it } from 'vitest'
import type { SpeechCard } from '../../types'
import { applyCardToDraft, emptySeatDraft } from './draft'

const card: SpeechCard = {
  id: 'c1',
  title: '确认扶养',
  text: '女儿尽了主要扶养，我可以确认。',
  responds_to: 'daughter',
  action: 'ally',
  claims: { album: 10 },
  suggests_admission: 'acknowledge_support:daughter',
  serves: ['playbook-0'],
  risk_note: '需你手动勾选',
}

describe('applyCardToDraft', () => {
  it('fills text action target claims but never touches admissions', () => {
    const draft = { ...emptySeatDraft(), waiveShare: true, supportId: '' }
    const next = applyCardToDraft(draft, card)
    expect(next.text).toBe(card.text)
    expect(next.action).toBe('ally')
    expect(next.target).toBe('daughter')
    expect(next.claims).toEqual({ album: 10 })
    expect(next.admitNeglect).toBe(false)
    expect(next.waiveShare).toBe(true)
    expect(next.supportId).toBe('')
  })
})
