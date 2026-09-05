import { ASSET_EMOJI, ASSET_TYPES, RELATION_LABEL } from '../data/presets'
import type {
  Asset, Brief, BriefItem, CaseInput, Goals, Member, RedLine, RedLineKind, SoftGoal, SoftGoalKind,
} from '../types'

export const MEMBER_FLAGS = ['main_support', 'cohabit', 'hardship', 'neglect', 'dependency'] as const
export type MemberFlag = (typeof MEMBER_FLAGS)[number]

export const TARGET_WEIGHTS = ['60%', '30%', '10%'] as const

export const RED_LINE_TEMPLATES: { kind: RedLineKind; label: string }[] = [
  { kind: 'no_sell_asset', label: '不接受出售某资产' },
  { kind: 'no_member_gets_asset', label: '不接受某人取得某资产' },
  { kind: 'not_below_legal', label: '不接受低于法定份额' },
  { kind: 'no_co_own_asset', label: '不接受与某人共有某资产' },
  { kind: 'custom', label: '自定义' },
]

export const SOFT_GOAL_TEMPLATES: { kind: SoftGoalKind; label: string }[] = [
  { kind: 'keep_relation', label: '与某人关系不破裂' },
  { kind: 'pet_custody', label: '宠物照护权' },
  { kind: 'keep_residence', label: '继续居住' },
  { kind: 'recognition', label: '付出被当庭承认' },
  { kind: 'custom', label: '自定义' },
]

export const BRIEF_SECTIONS: { key: keyof Omit<Brief, 'member_id' | 'generated_by'>; title: string; defaultOpen: boolean }[] = [
  { key: 'baseline', title: '① 法定基线与法条', defaultOpen: false },
  { key: 'reachable', title: '② 可达区间', defaultOpen: false },
  { key: 'levers', title: '③ 杠杆清单', defaultOpen: true },
  { key: 'asset_strategy', title: '④ 资产策略', defaultOpen: false },
  { key: 'playbook', title: '⑤ 谈判剧本', defaultOpen: true },
  { key: 'opponents', title: '⑥ 对手预判与应对', defaultOpen: false },
  { key: 'risks', title: '⑦ 风险提示', defaultOpen: true },
]

export function emptyGoals(): Goals {
  return { target_assets: [], min_value_share: null, red_lines: [], soft_goals: [], narrative: '', source: 'user' }
}

export function assetEmoji(asset: Asset | undefined): string {
  if (!asset) return '📦'
  return ASSET_EMOJI[asset.type] ?? ASSET_TYPES.find((t) => t.value === asset.type)?.emoji ?? '📦'
}

export function assetLabel(assets: Asset[], id: string): string {
  const asset = assets.find((a) => a.id === id)
  return asset ? `${assetEmoji(asset)} ${asset.name}` : id
}

export function memberLabel(members: Member[], id: string): string {
  const member = members.find((m) => m.id === id)
  return member ? member.name : id
}

export function relationOf(members: Member[], id: string): string {
  const member = members.find((m) => m.id === id)
  return member ? (RELATION_LABEL[member.relation] ?? member.relation) : ''
}

export function isRedLineComplete(line: RedLine): boolean {
  if (line.kind === 'custom') return line.text.trim().length > 0
  if (line.kind === 'not_below_legal') return true
  if (line.kind === 'no_sell_asset') return Boolean(line.asset_id)
  return Boolean(line.asset_id && line.member_id)
}

export function isSoftGoalComplete(goal: SoftGoal): boolean {
  if (goal.kind === 'custom') return goal.text.trim().length > 0
  if (goal.kind === 'recognition') return true
  if (goal.kind === 'keep_relation') return Boolean(goal.member_id)
  return Boolean(goal.asset_id)
}

export function sanitizeGoals(goals: Goals): Goals {
  return {
    ...goals,
    target_assets: goals.target_assets.slice(0, 5),
    narrative: goals.narrative.slice(0, 600),
    red_lines: goals.red_lines.filter(isRedLineComplete),
    soft_goals: goals.soft_goals.filter(isSoftGoalComplete),
  }
}

export function redLineText(line: RedLine, assets: Asset[], members: Member[]): string {
  const asset = line.asset_id ? assetLabel(assets, line.asset_id) : '（未选资产）'
  const who = line.member_id ? memberLabel(members, line.member_id) : '（未选成员）'
  switch (line.kind) {
    case 'no_sell_asset':
      return `不接受出售 ${asset}`
    case 'no_member_gets_asset':
      return `不接受 ${who} 取得 ${asset}`
    case 'not_below_legal':
      return '不接受低于法定份额'
    case 'no_co_own_asset':
      return `不接受与 ${who} 共有 ${asset}`
    case 'custom':
      return line.text.trim() || '（未填写自定义红线）'
  }
}

export function softGoalText(goal: SoftGoal, assets: Asset[], members: Member[]): string {
  const asset = goal.asset_id ? assetLabel(assets, goal.asset_id) : '（未选资产）'
  const who = goal.member_id ? memberLabel(members, goal.member_id) : '（未选成员）'
  switch (goal.kind) {
    case 'keep_relation':
      return `与 ${who} 关系不破裂`
    case 'pet_custody':
      return `宠物照护权 · ${asset}`
    case 'keep_residence':
      return `继续居住 · ${asset}`
    case 'recognition':
      return '付出被当庭承认'
    case 'custom':
      return goal.text.trim() || '（未填写自定义软目标）'
  }
}

export function goalsSummary(goals: Goals | undefined, assets: Asset[]): string {
  if (!goals) return '尚无诉求'
  const first = goals.target_assets[0]
  const asset = first ? assetLabel(assets, first) : '未设目标资产'
  const floor = goals.min_value_share == null ? '未设底线' : `底线 ${goals.min_value_share}%`
  return `${asset} · ${floor}`
}

export function applyWhatIfKey(c: CaseInput, key: string): CaseInput {
  const sep = key.indexOf(':')
  if (sep < 0) return c
  const kind = key.slice(0, sep)
  const id = key.slice(sep + 1)
  if (kind === 'joint') {
    return { ...c, assets: c.assets.map((a) => (a.id === id ? { ...a, joint: !a.joint } : a)) }
  }
  if ((MEMBER_FLAGS as readonly string[]).includes(kind)) {
    const flag = kind as MemberFlag
    return { ...c, members: c.members.map((m) => (m.id === id ? { ...m, [flag]: !m[flag] } : m)) }
  }
  return c
}

export function applyWhatIfKeys(c: CaseInput, keys: string[]): CaseInput {
  return keys.reduce(applyWhatIfKey, c)
}

export function extractTurnIds(text: string): string[] {
  const found = new Set<string>()
  const re = /\[t:([^\]]+)\]/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) found.add(match[1])
  return [...found]
}

export function newBriefItem(section: string, index: number, text: string): BriefItem {
  return {
    id: `${section}-${index}`,
    text: text.slice(0, 160),
    enabled: true,
    custom: true,
    depends_on: [],
    evidence: [],
    article: null,
    delta_pct: null,
    confidence: null,
  }
}
