import { PxlKitIcon } from '@pxlkit/core'
import { QuestCompass, Trophy } from '@pxlkit/gamification'
import { PixelProgress } from '@pxlkit/ui-kit'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { claimedShares } from '../../lib/prediction'
import type { PhaseState } from '../../store/useCourt'
import type { AgentSpec, CaseInput, LegalResult, Turn, Verdict } from '../../types'

interface Props {
  caseData: CaseInput
  legal: LegalResult
  agents: AgentSpec[]
  turns: Turn[]
  verdict: Verdict | null
  focusIssues: string[]
  phase: PhaseState | null
}

/**
 * 终局裁决预测：裁决前按各方"当前主张"折成价值画环，与法定份额并排对比；
 * 裁决后切成最终份额。下方是争议焦点的推进度（第 i 个焦点对应第 i 轮辩论）。
 */
export default function PredictionCard({ caseData, legal, agents, turns, verdict, focusIssues, phase }: Props) {
  const debaters = useMemo(() => agents.filter((a) => a.kind !== 'judge'), [agents])
  const byId = useMemo(() => Object.fromEntries(agents.map((a) => [a.id, a])), [agents])
  const legalPct = useMemo(() => Object.fromEntries(legal.shares.map((s) => [s.member_id, s.percent])), [legal])

  const rows = useMemo(() => {
    if (verdict) {
      return Object.entries(verdict.value_shares)
        .filter(([, v]) => v > 0)
        .map(([id, percent]) => ({ id, percent, value: verdict.member_value[id] ?? 0 }))
        .sort((a, b) => b.percent - a.percent)
    }
    return claimedShares(turns, caseData.assets, debaters.map((a) => a.id))
  }, [verdict, turns, caseData.assets, debaters])

  const pie = rows.map((r) => ({ ...r, name: byId[r.id]?.name ?? r.id, color: byId[r.id]?.color ?? '#8b93a7' }))
  const claimedTotal = rows.reduce((s, r) => s + r.value, 0)
  const heat = verdict ? 0 : legal.estate_total > 0 ? Math.round((claimedTotal / legal.estate_total) * 100) : 0

  // 辩论轮 i 对应焦点 i：已过的轮次算 100，进行中的按已发言人数算
  const debaterCount = Math.max(1, debaters.filter((a) => !caseData.members.find((m) => m.id === a.id)?.deceased).length)
  const progressOf = (i: number) => {
    if (!phase) return 0
    const round = i + 1
    const order = ['opening', 'statements', 'debate', 'negotiation', 'verdict']
    if (phase.phase === 'debate') {
      if (phase.round > round) return 100
      if (phase.round < round) return 0
      const spoken = new Set(turns.filter((t) => t.done && t.phase === 'debate' && t.round === round && byId[t.agent_id]?.kind !== 'judge').map((t) => t.agent_id)).size
      return Math.min(100, Math.round((spoken / debaterCount) * 100))
    }
    return order.indexOf(phase.phase) > order.indexOf('debate') ? 100 : 0
  }

  return (
    <div className="border-b-2 border-ink-700 bg-ink-900 p-3">
      <div className="mb-1 flex items-center justify-between">
        <div className="pixel-text flex items-center gap-1.5 text-[12px] text-gold-300">
          <PxlKitIcon icon={verdict ? Trophy : QuestCompass} size={14} />
          {verdict ? '最终裁决 · 价值份额' : '终局裁决预测 · 各方主张'}
        </div>
        {!verdict && rows.length > 0 && (
          <span className={`chip px-1.5 text-[10px] ${heat > 130 ? 'border-seal-700 text-seal-400' : 'text-ink-300'}`} title="各方主张价值之和 ÷ 遗产净额">
            争夺 {heat}%
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="py-5 text-center text-[11px] text-ink-400">还没人开口要东西，先听听陈述…</div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative h-[108px] w-[108px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={30} outerRadius={50} paddingAngle={2}
                  stroke="#17120f" strokeWidth={2} isAnimationActive={false}>
                  {pie.map((p) => <Cell key={p.id} fill={p.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center leading-none">
              <span className="text-[8px] tracking-widest text-ink-400">净额</span>
              <span className="pixel-text text-[12px] text-gold-300">{legal.estate_total}万</span>
            </div>
          </div>
          <ul className="min-w-0 flex-1 space-y-1">
            {pie.slice(0, 5).map((p) => {
              const lp = legalPct[p.id] ?? 0
              const d = p.percent - lp
              return (
                <li key={p.id} className="flex items-center gap-1.5 text-[11px]">
                  <span className="h-2 w-2 shrink-0 border border-ink-950" style={{ background: p.color }} />
                  <span className="min-w-0 flex-1 truncate text-ink-200">{p.name}</span>
                  <motion.span key={p.percent} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className="font-mono font-bold" style={{ color: p.color }}
                    title={verdict ? `到手 ${p.value} 万` : `主张价值约 ${p.value} 万`}>
                    {p.percent > 0 && p.percent < 1 ? '<1' : p.percent.toFixed(0)}%
                  </motion.span>
                  <span className="w-[54px] text-right font-mono text-[10px] text-ink-400" title="法定参考份额">
                    法定 {lp.toFixed(0)}%
                  </span>
                  <span className={`w-6 text-right font-mono text-[10px] ${d > 3 ? 'text-jade-300' : d < -3 ? 'text-seal-400' : 'text-ink-600'}`}>
                    {d > 3 ? '▲' : d < -3 ? '▼' : '·'}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {focusIssues.length > 0 && !verdict && (
        <div className="mt-2 space-y-1.5 border-t border-dashed border-ink-700 pt-2">
          {focusIssues.slice(0, 3).map((issue, i) => (
            <div key={i}>
              <div className="mb-0.5 flex items-center gap-1.5 text-[10px] leading-tight">
                <span className="pixel-text text-gold-400">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-ink-300" title={issue}>{issue}</span>
                <span className="font-mono text-ink-400">{progressOf(i)}%</span>
              </div>
              <PixelProgress value={progressOf(i)} tone={progressOf(i) >= 100 ? 'green' : 'gold'} showValue={false} aria-label={`焦点 ${i + 1} 推进度`} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
