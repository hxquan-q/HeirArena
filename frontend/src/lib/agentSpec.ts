import { PERSONALITIES, RELATIONS } from '../data/presets'
import type { AgentSpec, Member } from '../types'

export const petKindOf = (name: string): 'cat' | 'dog' => (/狗|犬|汪/.test(name) ? 'dog' : 'cat')

export function memberAgent(m: Member): AgentSpec {
  const personality = PERSONALITIES.find((p) => p.value === m.personality) ?? PERSONALITIES[0]
  const relation = RELATIONS.find((r) => r.value === m.relation)
  return {
    id: m.id,
    name: m.name,
    role: relation?.label ?? m.relation,
    relation: m.relation,
    personality: m.personality,
    personality_label: personality.label,
    title: personality.desc,
    color: personality.color,
    kind: m.relation === 'pet' ? 'pet' : m.relation === 'ai_twin' ? 'ai' : 'human',
    legal_percent: 0,
    eligible: true,
    wish: m.wish,
    llm: !!m.model && m.model.provider_id !== 'mock',
    model_label: '',
  }
}
