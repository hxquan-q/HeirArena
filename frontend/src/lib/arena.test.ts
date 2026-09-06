import { describe, expect, it } from 'vitest'
import type { AgentSpec, CaseInput, Turn } from '../types'
import { buildEvidence } from './evidence'
import { claimedShares, contestedAssets } from './prediction'
import { castSkill } from './skills'

const caseData: CaseInput = {
  decedent_name: '老王',
  story: '',
  rounds: 1,
  speed: 1,
  default_model: null,
  executor_model: null,
  seat: null,
  assets: [
    { id: 'house', name: '学区房', type: 'house', value: 600, joint: true, sentimental: false, note: '' },
    { id: 'cat', name: '大橘', type: 'pet', value: 1, joint: false, sentimental: true, note: '' },
  ],
  members: [
    { id: 'son', name: '王大宝', relation: 'son', personality: 'greedy', deceased: false, parent_id: null, main_support: false, hardship: false, neglect: true, cohabit: false, dependency: false, disqualified: false, wish: '', model: null },
    { id: 'dau', name: '王小美', relation: 'daughter', personality: 'filial', deceased: false, parent_id: null, main_support: true, hardship: false, neglect: false, cohabit: false, dependency: false, disqualified: false, wish: '', model: null },
  ],
}

const agent = (id: string, name: string, kind: AgentSpec['kind'] = 'human'): AgentSpec => ({
  id, name, role: '', relation: 'son', personality: 'chill', personality_label: '', title: '', color: '#fff', kind,
  legal_percent: 0, eligible: true, wish: '', llm: false, model_label: '',
})
const agents = [agent('exec', '执行官', 'judge'), agent('son', '王大宝'), agent('dau', '王小美')]

const turn = (id: string, agent_id: string, text: string, meta: Partial<NonNullable<Turn['meta']>> = {}, ts = 1): Turn => ({
  turn_id: id, agent_id, phase: 'debate', round: 1, text, done: true, ts,
  meta: { action: 'propose', target: null, emoji: '', claims: {}, ...meta },
})

describe('prediction', () => {
  it('folds latest claims into value shares and flags contested assets', () => {
    const turns = [
      turn('t1', 'son', '房子归我', { claims: { house: 100 } }),
      turn('t2', 'dau', '我要大橘', { claims: { cat: 100, house: 50 } }),
      turn('t3', 'son', '算了一半', { claims: { house: 50 } }, 2),
    ]
    const shares = claimedShares(turns, caseData.assets, ['son', 'dau'])
    expect(shares.map((s) => s.id)).toEqual(['dau', 'son'])
    expect(shares[0].value).toBe(301)
    expect(shares[1].value).toBe(300)
    expect(contestedAssets(turns)).toEqual([{ assetId: 'house', claimants: 2, totalPct: 100 }])
  })
})

describe('evidence', () => {
  it('unlocks assets on mention, promotes admissions to testimony, confirms facts', () => {
    const turns = [
      turn('t1', 'son', '学区房必须归我', { claims: { house: 80 } }),
      turn('t2', 'dau', '大宝确实没回过家', { admissions: ['acknowledge_support:dau'] }, 2),
      turn('t3', 'son', '我承认没尽孝', { admissions: ['admit_neglect', 'acknowledge_support:dau'] }, 3),
    ]
    const cards = buildEvidence(caseData, turns, agents)
    const house = cards.find((c) => c.id === 'asset:house')!
    const cat = cards.find((c) => c.id === 'asset:cat')!
    expect(house.unlocked).toBe(true)
    expect(house.turnIds).toEqual(['t1'])
    expect(cat.unlocked).toBe(false)

    const support = cards.find((c) => c.id === 'adm:support:dau')!
    expect(support.title).toContain('2 人当庭承认')
    expect(support.weight).toBe(100)
    expect(support.turnIds).toEqual(['t2', 't3'])

    const neglectFact = cards.find((c) => c.id === 'fact:son:neglect')!
    expect(neglectFact.subtitle).toContain('本人当庭承认')
    const supportFact = cards.find((c) => c.id === 'fact:dau:main_support')!
    expect(supportFact.weight).toBe(90)
    expect(cards[0].kind).toBe('testimony')
  })
})

describe('skills', () => {
  it('targets the latest non-judge speaker and spots shared claims', () => {
    const turns = [
      turn('t1', 'dau', '', { claims: { house: 50 } }),
      turn('t2', 'exec', '归纳一下'),
      turn('t3', 'son', '', { claims: { house: 100 } }),
    ]
    expect(castSkill('doubt', { caseData, agents, turns })).toContain('王大宝')
    expect(castSkill('rebut', { caseData, agents, turns })).toContain('学区房')
    expect(castSkill('ultimate', { caseData, agents, turns })).toContain('王小美')
    expect(castSkill('doubt', { caseData, agents, turns: [] })).toMatch(/证据/)
  })
})
