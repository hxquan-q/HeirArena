import { ASSET_EMOJI } from '../data/presets'
import type { AgentSpec, CaseInput, CourtEvidence, Member, Turn } from '../types'
import { contestedAssets, latestClaims } from './prediction'

export type EvidenceKind = 'asset' | 'fact' | 'testimony' | 'submission'

export interface EvidenceCard {
  id: string
  kind: EvidenceKind
  title: string
  subtitle: string
  emoji: string
  /** 卷宗里的资产要被点名/主张过才算"浮出水面"；事实与证言默认已解锁 */
  unlocked: boolean
  /** 0-100：资产是争夺热度，事实是被确认程度，证言是分量 */
  weight: number
  /** 相关发言，可跳转 */
  turnIds: string[]
  /** 出示证据时幽灵的台词 */
  quip: string
  article?: string
  contested?: boolean
  /** 首次解锁的时间戳（用于"新证据"徽章与排序） */
  unlockedAt?: number
  memberId?: string
  assetId?: string
}

const FACT_META: Record<string, { label: string; article: string; quip: (name: string) => string }> = {
  main_support: { label: '尽了主要扶养义务', article: '1130', quip: (n) => `${n}这几年床前床后照顾我，这一点谁也别装看不见。` },
  cohabit: { label: '与逝者共同生活', article: '1130', quip: (n) => `${n}一直和我住在一起，日子是怎么过的你们都清楚。` },
  hardship: { label: '生活困难且缺乏劳动能力', article: '1130', quip: (n) => `${n}生活不容易，法律说了要照顾，你们也该有点良心。` },
  neglect: { label: '有能力却不尽扶养义务', article: '1130', quip: (n) => `${n}，你几年没回过家，这事今天得摊开说。` },
  dependency: { label: '继子女：有扶养关系', article: '1127', quip: (n) => `${n}是我一手带大的，跟亲生的没两样。` },
  disqualified: { label: '丧失继承权', article: '1125', quip: (n) => `${n}做过什么自己心里知道，别在这儿装无辜。` },
  deceased: { label: '先于逝者去世', article: '1128', quip: (n) => `${n}走得早，那一份该由孩子代位继承。` },
}
const FACT_KEYS = Object.keys(FACT_META) as (keyof Member)[]

function assetQuip(c: CaseInput, a: CaseInput['assets'][number]): string {
  const spouse = c.members.find((m) => m.relation === 'spouse')?.name
  if (a.type === 'pet') return `${a.name}是条命，不是财产——谁能照顾它，它就跟谁。`
  if (a.joint) return `${a.name}是我和${spouse ?? '老伴'}的共同财产，先析出一半再谈。`
  if (a.sentimental) return `${a.name}是留着念想的东西，谁真心惦记它，就该归谁。`
  return `${a.name}值${a.value}万，别一个人全揽了，法定份额摆在那儿。`
}

/**
 * 从卷宗 + 已落定的发言里推导"证据卡牌"：
 * - 资产卡：被点名或被主张后解锁，热度随争夺升温
 * - 事实卡：卷宗登记的法律事实，被他人当庭承认时加权
 * - 证言卡：当庭自认 / 放弃 / 承认他人扶养，即时解锁
 * - 举证卡：玩家从庭前 what-if 清单提交、由后端规则采信的结构化材料
 */
export function buildEvidence(
  caseData: CaseInput,
  turns: Turn[],
  agents: AgentSpec[],
  submitted: CourtEvidence[] = [],
): EvidenceCard[] {
  const nameOf = (id: string) => agents.find((a) => a.id === id)?.name ?? caseData.members.find((m) => m.id === id)?.name ?? id
  const done = turns.filter((t) => t.done)
  const claims = latestClaims(done)
  const contested = new Set(contestedAssets(done).map((c) => c.assetId))

  const assets: EvidenceCard[] = caseData.assets.map((a) => {
    const hits = done.filter((t) => (a.name && t.text.includes(a.name)) || (t.meta?.claims?.[a.id] ?? 0) > 0)
    const totalPct = Object.values(claims).reduce((s, row) => s + (row[a.id] ?? 0), 0)
    const heat = hits.length ? Math.min(100, Math.round(totalPct / 2 + hits.length * 6)) : 0
    return {
      id: `asset:${a.id}`, kind: 'asset', assetId: a.id,
      title: a.name || '未命名资产', emoji: ASSET_EMOJI[a.type] ?? '📦',
      subtitle: `${a.value} 万${a.joint ? ' · 夫妻共同' : ''}${a.sentimental ? ' · 纪念' : ''}`,
      unlocked: hits.length > 0, weight: heat, contested: contested.has(a.id),
      turnIds: hits.map((t) => t.turn_id), unlockedAt: hits[0]?.ts, quip: assetQuip(caseData, a),
    }
  })

  // 当庭承认：谁承认了谁的扶养、谁自认未扶养、谁放弃
  const supportConfirmers: Record<string, Set<string>> = {}
  const testimonies: EvidenceCard[] = []
  const seen = new Set<string>()
  for (const t of done) {
    for (const adm of t.meta?.admissions ?? []) {
      let card: EvidenceCard | null = null
      if (adm === 'admit_neglect') {
        card = {
          id: `adm:${t.agent_id}:neglect`, kind: 'testimony', memberId: t.agent_id, article: '1130', emoji: '🗣️',
          title: `${nameOf(t.agent_id)} 当庭承认未尽扶养义务`, subtitle: '第1130条 · 应当不分或少分', unlocked: true, weight: 90,
          turnIds: [t.turn_id], unlockedAt: t.ts, quip: `刚才${nameOf(t.agent_id)}自己也承认了没尽过孝——执行官，请记下这句。`,
        }
      } else if (adm === 'waive_share') {
        card = {
          id: `adm:${t.agent_id}:waive`, kind: 'testimony', memberId: t.agent_id, article: '1124', emoji: '🕊️',
          title: `${nameOf(t.agent_id)} 当庭表示放弃部分份额`, subtitle: '第1124条 · 放弃继承', unlocked: true, weight: 70,
          turnIds: [t.turn_id], unlockedAt: t.ts, quip: `${nameOf(t.agent_id)}刚说了愿意让，这份体面大家都看见了。`,
        }
      } else if (adm.startsWith('acknowledge_support:')) {
        const who = adm.slice('acknowledge_support:'.length)
        ;(supportConfirmers[who] ??= new Set()).add(t.agent_id)
        const n = supportConfirmers[who].size
        card = {
          id: `adm:support:${who}`, kind: 'testimony', memberId: who, article: '1130', emoji: '🤝',
          title: `${nameOf(who)} 的扶养被 ${n} 人当庭承认`, subtitle: n >= 2 ? '第1130条 · 两人以上承认，事实成立' : '第1130条 · 还需一人承认',
          unlocked: true, weight: Math.min(100, 50 + n * 25), turnIds: [t.turn_id], unlockedAt: t.ts,
          quip: `连${nameOf(t.agent_id)}都承认${nameOf(who)}照顾我最多，这还有什么可争的？`,
        }
      }
      if (!card) continue
      if (seen.has(card.id)) {
        const prev = testimonies.find((x) => x.id === card!.id)!
        prev.turnIds.push(t.turn_id)
        prev.weight = card.weight
        prev.title = card.title
        prev.subtitle = card.subtitle
      } else {
        seen.add(card.id)
        testimonies.push(card)
      }
    }
  }

  const facts: EvidenceCard[] = []
  for (const m of caseData.members) {
    for (const key of FACT_KEYS) {
      if (!m[key]) continue
      const meta = FACT_META[key]
      const confirmers = key === 'main_support' ? supportConfirmers[m.id]?.size ?? 0 : 0
      const admitted = key === 'neglect' && seen.has(`adm:${m.id}:neglect`)
      facts.push({
        id: `fact:${m.id}:${key}`, kind: 'fact', memberId: m.id, article: meta.article, emoji: '📜',
        title: `${m.name || '未命名'} · ${meta.label}`, subtitle: `卷宗记载 · 第${meta.article}条${confirmers ? ` · ${confirmers} 人当庭承认` : admitted ? ' · 本人当庭承认' : ''}`,
        unlocked: true, weight: Math.min(100, 40 + confirmers * 25 + (admitted ? 45 : 0)),
        turnIds: [], quip: meta.quip(m.name || '那孩子'),
      })
    }
  }

  const submissions: EvidenceCard[] = submitted.map((item) => ({
    id: `submission:${item.id}`,
    kind: 'submission',
    memberId: item.subject_kind === 'member' ? item.subject_id : item.submitted_by,
    assetId: item.subject_kind === 'asset' ? item.subject_id : undefined,
    article: item.article,
    emoji: '🧾',
    title: item.label,
    subtitle: `${item.evidence_type} · 本次沙盘采信`,
    unlocked: true,
    weight: 100,
    turnIds: [],
    unlockedAt: item.submitted_at < 10_000_000_000 ? item.submitted_at * 1000 : item.submitted_at,
    quip: item.note,
  }))

  return [
    ...submissions.sort((a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0)),
    ...testimonies.sort((a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0)),
    ...assets.sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || b.weight - a.weight),
    ...facts.sort((a, b) => b.weight - a.weight),
  ]
}
