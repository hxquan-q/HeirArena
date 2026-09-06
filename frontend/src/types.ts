export type AssetType =
  | 'house' | 'car' | 'cash' | 'crypto' | 'nft' | 'pet' | 'collectible' | 'stock' | 'equity' | 'other'

export type Relation =
  | 'spouse' | 'son' | 'daughter' | 'stepchild' | 'father' | 'mother' | 'grandchild'
  | 'daughter_in_law' | 'son_in_law' | 'sibling' | 'grandparent' | 'ex_spouse' | 'dependent'
  | 'pet' | 'ai_twin' | 'friend'

export type Personality =
  | 'greedy' | 'filial' | 'chill' | 'calculating' | 'drama' | 'lawyer' | 'loyal' | 'mischief'

/** 指向某个供应商下的某个模型；provider_id 为 "mock" 表示该角色明确使用剧本模式。 */
export interface ModelRef {
  provider_id: string
  model: string
}

export interface Provider {
  id: string
  name: string
  base_url: string
  models: string[]
  preset: string
  api_key_set: boolean
  api_key_hint: string
  ready: boolean
  source: 'file' | 'env'
}

export interface ProviderPreset {
  id: string
  name: string
  base_url: string
  models: string[]
  hint: string
  needs_key: boolean
}

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
  model: ModelRef | null
}

export type RedLineKind = 'no_sell_asset' | 'no_member_gets_asset' | 'not_below_legal' | 'no_co_own_asset' | 'custom'
export type SoftGoalKind = 'keep_relation' | 'pet_custody' | 'keep_residence' | 'recognition' | 'custom'
export type BriefConfidence = 'high' | 'medium' | 'low' | 'abstain'
export type ThreatLevel = 'high' | 'medium' | 'low' | 'none'
export type ScorePartKey = 'target_assets' | 'min_share' | 'red_lines' | 'soft_goals'

export interface RedLine {
  kind: RedLineKind
  asset_id: string | null
  member_id: string | null
  text: string
}

export interface SoftGoal {
  kind: SoftGoalKind
  member_id: string | null
  asset_id: string | null
  text: string
}

export interface Goals {
  target_assets: string[]
  min_value_share: number | null
  red_lines: RedLine[]
  soft_goals: SoftGoal[]
  narrative: string
  source: 'user' | 'inferred'
}

export interface BriefItem {
  id: string
  text: string
  enabled: boolean
  custom: boolean
  depends_on: string[]
  evidence: string[]
  article: string | null
  delta_pct: number | null
  confidence: BriefConfidence | null
}

export interface Brief {
  member_id: string
  baseline: BriefItem[]
  reachable: BriefItem[]
  levers: BriefItem[]
  asset_strategy: BriefItem[]
  playbook: BriefItem[]
  opponents: BriefItem[]
  risks: BriefItem[]
  generated_by: string
}

export interface WhatIfDelta {
  key: string
  subject_id: string
  label: string
  article: string
  delta_pct: number
  direction: 'favorable' | 'adverse'
  evidence: string[]
}

export interface Reachability {
  legal_pct: number
  low: number
  high: number
  value_low: number | null
  value_high: number | null
  favorable_keys: string[]
  adverse_keys: string[]
}

export interface CoalitionRow {
  member_id: string
  potential_confirmers: string[]
  gain_pct: number
  exposure_from: string[]
}

export interface AssetCompetitionRow {
  asset_id: string
  competitors: string[]
  can_absorb: Record<string, boolean>
  pref_score: Record<string, number>
  predicted_winner: string | null
  compensation_needed: number
}

export interface PayoffRow {
  option: string
  label: string
  my_value: number
  my_value_share: number
  assets_obtained: string[]
  compensation_paid: number
  compensation_received: number
}

export interface EquilibriumRow {
  profile: Record<string, string>
  payoffs: Record<string, number>
  my_value: number
  my_value_share: number
  stable: boolean
  note: string
}

export interface GameTables {
  coalition: CoalitionRow[]
  asset_competition: AssetCompetitionRow[]
  payoff: PayoffRow[]
  equilibrium: EquilibriumRow[]
}

export interface ScorecardPart {
  key: ScorePartKey
  label: string
  score: number
  max: number
  applicable: boolean
  detail: string
  turn_ids: string[]
}

export interface Scorecard {
  member_id: string
  parts: ScorecardPart[]
  total: number
  capped: boolean
  formula: string
  value_share: number
  nominal_pct: number
  legal_pct: number
}

export interface MatrixRow {
  member_id: string
  baseline_pct: number
  reachable: Reachability | null
  target_assets: string[]
  conflicts_with_player: string[]
  potential_allies: string[]
  strategy_summary: string
  threat_level: ThreatLevel
  no_legal_share_reason: string | null
  achieved: Scorecard | null
}

export interface StrategyPack {
  player_id: string
  matrix: MatrixRow[]
  briefs: Record<string, Brief>
  game: GameTables
  reachability: Reachability
  whatif: WhatIfDelta[]
  evidence_checklist: EvidenceHint[]
  warnings: string[]
  generated_by: string
  generated_at: number
}

export interface EvidenceHint {
  lever: string
  label: string
  article: string
  evidence: string[]
  burden: string
  note?: string
}

export interface SeatConfig {
  player_id: string
  goals: Record<string, Goals>
  seat_human: boolean
  advisor_model: ModelRef | null
  strategy: StrategyPack | null
}

export interface SeatAnalysis {
  player_id: string
  legal: LegalResult
  reachability: Reachability
  whatif: WhatIfDelta[]
  evidence_checklist: EvidenceHint[]
  inferred_goals: Record<string, Goals>
  game: GameTables
  matrix: MatrixRow[]
  warnings: string[]
}

export interface CaseInput {
  decedent_name: string
  story: string
  assets: Asset[]
  members: Member[]
  rounds: number
  speed: number
  /** 执行官相对法定份额的最大酌情偏移（百分点）。0 严格 / 5 参考 / 15 戏剧 */
  discretion?: number
  default_model: ModelRef | null
  executor_model: ModelRef | null
  seat: SeatConfig | null
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
  llm: boolean
  model_label: string
}

export type Phase = 'opening' | 'statements' | 'debate' | 'negotiation' | 'verdict'
export type AgentStatus = 'idle' | 'thinking' | 'speaking' | 'angry' | 'happy'
export type Action = 'attack' | 'ally' | 'propose' | 'concede' | 'plead'

/** 角色当庭承认的符号化事实；数值影响由规则引擎决定 */
export type Admission = 'admit_neglect' | 'waive_share' | `acknowledge_support:${string}`

export interface TurnMeta {
  action: Action
  target: string | null
  emoji: string
  claims: Record<string, number>
  admissions?: Admission[]
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

/** 三段式判决书：经审理查明 / 本院认为（三段论）/ 判决如下（编号主文） */
export interface Judgment {
  findings: string
  reasoning: string
  orders: string[]
}

/** 和解建议：总览 + A/B/C 三档让步方案 */
export interface SettlementPlan {
  tier: string
  title: string
  detail: string
}

export interface Settlement {
  overview: string
  plans: SettlementPlan[]
}

/** 漏接分析：每人最有说服力的论点 + 未回应的对方论点 */
export interface Unaddressed {
  member_id: string
  strongest: string
  missed: string
}

export interface Verdict {
  speech: string
  judgment?: Judgment
  settlement?: Settlement
  unaddressed?: Unaddressed[]
  allocation: Record<string, Record<string, number>>
  compensations: Compensation[]
  targets: Record<string, number>
  value_shares: Record<string, number>
  member_value: Record<string, number>
  legal_percent: Record<string, number>
  adjustments: { member_id: string; reason: string; article?: string; delta?: number; turn_ids?: string[] }[]
  established_facts?: EstablishedFact[]
  open_questions?: string[]
  discretion?: number
  conditions: string[]
  citations: string[]
  rationale: string
  disclaimer?: string
  estate_total: number
  community_deduction: number
}

export interface EstablishedFact {
  member_id: string
  kind: 'admit_neglect' | 'waive_share' | 'concede' | 'support_confirmed'
  article: string
  text: string
  turn_ids: string[]
}

export interface SpeechCard {
  id: string
  title: string
  text: string
  responds_to: string | null
  action: Action
  claims: Record<string, number>
  suggests_admission: Admission | null
  serves: string[]
  risk_note: string
}

export interface AwaitingInfo {
  turn_key: string
  phase: Phase
  round: number
  attacked_by: string | null
  focus: string
  cards_pending: boolean
}

export interface Debrief {
  scorecards: Record<string, Scorecard>
  narrative: string | null
  next_time: string[]
  whatif_recap: WhatIfDelta[]
  generated_by: string
}

export interface PlayerSpeech {
  text: string
  meta: {
    action?: Action
    target?: string | null
    claims?: Record<string, number>
    admissions: Admission[]
  }
}

export interface DoneStats {
  stats: Record<string, number>
  drama_score: number
}
