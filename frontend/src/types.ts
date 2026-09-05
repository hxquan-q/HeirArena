export type AssetType =
  | 'house' | 'car' | 'cash' | 'crypto' | 'nft' | 'pet' | 'collectible' | 'stock' | 'equity' | 'other'

export type Relation =
  | 'spouse' | 'son' | 'daughter' | 'stepchild' | 'father' | 'mother' | 'grandchild'
  | 'daughter_in_law' | 'son_in_law' | 'sibling' | 'grandparent' | 'ex_spouse' | 'dependent'
  | 'pet' | 'ai_twin' | 'friend'

export type Personality =
  | 'greedy' | 'filial' | 'chill' | 'calculating' | 'drama' | 'lawyer' | 'loyal' | 'mischief'

export interface Asset {
  id: string
  name: string
  type: AssetType
  value: number
  joint: boolean
  sentimental: boolean
  note: string
}

export interface Member {
  id: string
  name: string
  relation: Relation
  personality: Personality
  deceased: boolean
  parent_id: string | null
  main_support: boolean
  hardship: boolean
  neglect: boolean
  cohabit: boolean
  dependency: boolean
  disqualified: boolean
  wish: string
}

export interface CaseInput {
  decedent_name: string
  story: string
  assets: Asset[]
  members: Member[]
  rounds: number
  speed: number
}

export interface HeirShare {
  member_id: string
  name: string
  relation: string
  eligible: boolean
  order: number | null
  percent: number
  weight: number
  basis: string[]
  notes: string[]
  via: string | null
}

export interface LegalResult {
  order_used: number
  shares: HeirShare[]
  steps: string[]
  articles: Record<string, string>
  gross_total: number
  community_deduction: number
  estate_total: number
  spouse_id: string | null
  dependents_carveout: number
}

export type AvatarKind = 'judge' | 'human' | 'pet' | 'ai' | 'outsider'

export interface AgentSpec {
  id: string
  name: string
  role: string
  relation: Relation | 'executor'
  personality: Personality
  personality_label: string
  title: string
  color: string
  kind: AvatarKind
  legal_percent: number
  eligible: boolean
  wish: string
}

export type Phase = 'opening' | 'statements' | 'debate' | 'negotiation' | 'verdict'
export type AgentStatus = 'idle' | 'thinking' | 'speaking' | 'angry' | 'happy'
export type Action = 'attack' | 'ally' | 'propose' | 'concede' | 'plead'

export interface TurnMeta {
  action: Action
  target: string | null
  emoji: string
  claims: Record<string, number>
}

export interface Turn {
  turn_id: string
  agent_id: string
  phase: Phase
  round: number
  text: string
  meta?: TurnMeta
  done: boolean
  ts: number
}

export interface RelationEdge {
  id: string
  from: string
  to: string
  kind: 'attack' | 'ally'
  ts: number
}

export interface Reaction {
  emoji: string
  mood: 'angry' | 'happy' | 'neutral'
  ts: number
}

export interface Compensation {
  from: string
  to: string
  amount: number
}

export interface Verdict {
  speech: string
  allocation: Record<string, Record<string, number>>
  compensations: Compensation[]
  targets: Record<string, number>
  value_shares: Record<string, number>
  member_value: Record<string, number>
  legal_percent: Record<string, number>
  adjustments: { member_id: string; reason: string; article?: string; delta?: number }[]
  conditions: string[]
  citations: string[]
  rationale: string
  estate_total: number
  community_deduction: number
}

export interface DoneStats {
  stats: Record<string, number>
  drama_score: number
}
