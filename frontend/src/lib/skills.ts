import type { PxlKitData } from '@pxlkit/core'
import { Lightning, Scroll, Skull, SpellBook, Target } from '@pxlkit/gamification'
import type { AgentSpec, CaseInput, Turn } from '../types'
import type { EvidenceCard } from './evidence'
import { latestClaims } from './prediction'

export type SkillId = 'doubt' | 'present' | 'rebut' | 'summon' | 'ultimate'

export interface Skill {
  id: SkillId
  label: string
  cost: number
  icon: PxlKitData
  desc: string
  /** 需要先从证据宝箱里挑一张卡 */
  needsEvidence?: boolean
}

/** 显灵术：玩家（逝者的幽灵）能对庭审施加的五种干预 */
export const SKILLS: Skill[] = [
  { id: 'doubt', label: '质疑观点', cost: 10, icon: Target, desc: '点名刚发言的人，逼他拿证据' },
  { id: 'present', label: '出示证据', cost: 15, icon: Scroll, desc: '从证据宝箱挑一张卡，当庭亮出来', needsEvidence: true },
  { id: 'rebut', label: '逻辑反驳', cost: 20, icon: Lightning, desc: '抓两个人互相矛盾的主张' },
  { id: 'summon', label: '请求归纳', cost: 25, icon: SpellBook, desc: '让执行官收束争议焦点' },
  { id: 'ultimate', label: '终极显灵', cost: 80, icon: Skull, desc: '以逝者之名压场，一锤定音' },
]

export const ENERGY_MAX = 100
export const ENERGY_START = 40
export const ENERGY_PER_PHASE = 15
export const WHISPER_COST = 5

export interface SkillContext {
  caseData: CaseInput
  agents: AgentSpec[]
  turns: Turn[]
  evidence?: EvidenceCard
}

const nameOf = (agents: AgentSpec[], id: string) => agents.find((a) => a.id === id)?.name ?? id

function lastSpeakers(turns: Turn[], agents: AgentSpec[], n: number): string[] {
  const judge = agents.find((a) => a.kind === 'judge')?.id
  const ids: string[] = []
  for (let i = turns.length - 1; i >= 0 && ids.length < n; i--) {
    const t = turns[i]
    if (!t.done || t.agent_id === judge || ids.includes(t.agent_id)) continue
    ids.push(t.agent_id)
  }
  return ids
}

/** 生成幽灵台词；找不到合适对象时退回泛指版本，永远有话可说 */
export function castSkill(id: SkillId, ctx: SkillContext): string {
  const { caseData, agents, turns } = ctx
  const me = caseData.decedent_name || '我'
  switch (id) {
    case 'doubt': {
      const [who] = lastSpeakers(turns, agents, 1)
      return who ? `${nameOf(agents, who)}，你刚才那句话我可不认——拿出证据来！` : '你们说的这些，哪一句有证据？'
    }
    case 'present':
      return ctx.evidence ? `你们都别忘了：${ctx.evidence.quip}` : `你们都别忘了，卷宗上写得清清楚楚。`
    case 'rebut': {
      const [a, b] = lastSpeakers(turns, agents, 2)
      if (a && b) {
        const claims = latestClaims(turns)
        const shared = Object.keys(claims[a] ?? {}).find((assetId) => (claims[b]?.[assetId] ?? 0) > 0 && (claims[a]?.[assetId] ?? 0) > 0)
        const asset = caseData.assets.find((x) => x.id === shared)
        if (asset) return `${nameOf(agents, a)}说${asset.name}该归自己，${nameOf(agents, b)}也说该归自己——你们俩先对一对口供。`
        return `${nameOf(agents, a)}和${nameOf(agents, b)}，你们俩前后说的对不上，别糊弄我。`
      }
      return '你们前后说的话对不上，别糊弄我。'
    }
    case 'summon':
      return '执行官，请先归纳一下现在的争议焦点，别让他们跑题。'
    case 'ultimate': {
      const supporter = caseData.members.find((m) => m.main_support && !m.deceased)
      const neglecter = caseData.members.find((m) => m.neglect && !m.deceased)
      const parts = [`够了！${me}在此立言：`]
      if (supporter) parts.push(`${supporter.name}对我最尽心，这份情要算在份额里；`)
      if (neglecter) parts.push(`${neglecter.name}，你几年没回家，自己心里有数；`)
      parts.push('执行官，请依法裁断，但别忘了人心。')
      return parts.join('')
    }
  }
}
