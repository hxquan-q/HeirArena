import type { Action, Admission, SpeechCard } from '../../types'

export interface SeatDraft {
  text: string
  action: Action | ''
  target: string
  claims: Record<string, number>
  admitNeglect: boolean
  waiveShare: boolean
  supportId: string
}

export function emptySeatDraft(): SeatDraft {
  return {
    text: '',
    action: 'propose',
    target: '',
    claims: {},
    admitNeglect: false,
    waiveShare: false,
    supportId: '',
  }
}

export function applyCardToDraft(draft: SeatDraft, card: SpeechCard): SeatDraft {
  return {
    ...draft,
    text: card.text,
    action: card.action,
    target: card.responds_to ?? '',
    claims: { ...card.claims },
  }
}

export function draftAdmissions(draft: SeatDraft): Admission[] {
  const out: Admission[] = []
  if (draft.admitNeglect) out.push('admit_neglect')
  if (draft.waiveShare) out.push('waive_share')
  if (draft.supportId) out.push(`acknowledge_support:${draft.supportId}`)
  return out
}
