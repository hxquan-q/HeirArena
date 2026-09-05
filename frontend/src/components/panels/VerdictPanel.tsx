import { Download, RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { api } from '../../api/client'
import { ASSET_EMOJI } from '../../data/presets'
import type { AgentSpec, CaseInput, DoneStats, Verdict } from '../../types'

interface Props {
  verdict: Verdict | null
  caseData: CaseInput
  agents: AgentSpec[]
  articleShort: Record<string, string>
  done: DoneStats | null
  sessionId: string
  onRestart: () => void
}

export default function VerdictPanel({ verdict, caseData, agents, articleShort, done, sessionId, onRestart }: Props) {
  const byId = Object.fromEntries(agents.map((a) => [a.id, a]))
  if (!verdict) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center text-sm text-ink-400">
        <div className="text-4xl">⚖️</div>
        执行官还在听。等所有人吵完，这里会出现最终裁决。
      </div>
    )
  }
  const pie = Object.entries(verdict.value_shares)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, name: byId[id]?.name ?? id, value: v, color: byId[id]?.color ?? '#8b93a7' }))
  const heirs = Object.keys(verdict.targets)

  return (
    <div className="space-y-4 text-sm">
      {done && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gold-500/30 bg-gold-500/6 px-3 py-2 text-xs">
          <span className="font-semibold text-gold-300">戏剧指数 {done.drama_score}</span>
          <span className="chip">⚔ 攻击 {done.stats.attacks}</span>
          <span className="chip">🤝 结盟 {done.stats.alliances}</span>
          <span className="chip">🫠 让步 {done.stats.concessions}</span>
          <span className="chip">👻 幽灵插话 {done.stats.ghost}</span>
        </div>
      )}

      <div className="rounded-xl border border-white/6 bg-ink-800/60 p-3">
        <div className="mb-1 text-xs font-semibold text-ink-400">最终价值份额（遗产净额 {verdict.estate_total} 万元）</div>
        <div className="flex items-center gap-2">
          <div className="h-40 w-40 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={38} outerRadius={70} paddingAngle={2} stroke="#0b0d12" strokeWidth={2}>
                  {pie.map((p) => <Cell key={p.id} fill={p.color} />)}
                </Pie>
                <Tooltip formatter={(v) => `${v}%`} contentStyle={{ background: '#151924', border: '1px solid #2a3142', borderRadius: 10, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <table className="w-full text-xs">
            <thead className="text-ink-400">
              <tr><th className="text-left font-normal">继承人</th><th className="text-right font-normal">法定</th><th className="text-right font-normal">裁决</th><th className="text-right font-normal">到手</th></tr>
            </thead>
            <tbody>
              {heirs.map((id) => {
                const legal = verdict.legal_percent[id] ?? 0
                const final = verdict.value_shares[id] ?? 0
                const d = final - legal
                return (
                  <tr key={id} className="border-t border-white/5">
                    <td className="py-1"><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: byId[id]?.color }} />{byId[id]?.name ?? id}</td>
                    <td className="text-right font-mono text-ink-300">{legal.toFixed(1)}%</td>
                    <td className={`text-right font-mono font-semibold ${d > 0.5 ? 'text-emerald-300' : d < -0.5 ? 'text-red-300' : 'text-ink-100'}`}>{final.toFixed(1)}%</td>
                    <td className="text-right font-mono text-gold-300">{verdict.member_value[id] ?? 0} 万</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold text-ink-400">资产归属</div>
        <div className="space-y-2">
          {caseData.assets.map((a) => {
            const row = Object.entries(verdict.allocation[a.id] ?? {}).sort((x, y) => y[1] - x[1])
            return (
              <div key={a.id} className="rounded-xl border border-white/6 bg-ink-800/60 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{ASSET_EMOJI[a.type]}</span>
                  <span className="font-semibold">{a.name}</span>
                  <span className="text-xs text-ink-400">{a.value} 万</span>
                  {a.joint && <span className="chip text-[10px] text-sky-300">夫妻共同</span>}
                  {a.sentimental && <span className="chip text-[10px] text-pink-300">纪念</span>}
                </div>
                <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-ink-700">
                  {row.map(([id, pct]) => (
                    <div key={id} style={{ width: `${pct}%`, background: byId[id]?.color ?? '#5b647a' }} title={`${byId[id]?.name ?? id} ${pct}%`} />
                  ))}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                  {row.map(([id, pct]) => (
                    <span key={id}><span style={{ color: byId[id]?.color }}>{byId[id]?.name ?? (id === '__state__' ? '国家' : id)}</span> <span className="font-mono text-ink-300">{pct}%</span></span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {verdict.compensations.length > 0 && (
        <Section title="折价补偿 · 第1156条">
          {verdict.compensations.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span style={{ color: byId[c.from]?.color }}>{byId[c.from]?.name ?? c.from}</span>
              <span className="text-ink-400">→</span>
              <span style={{ color: byId[c.to]?.color }}>{byId[c.to]?.name ?? c.to}</span>
              <span className="ml-auto font-mono text-gold-300">{c.amount} 万元</span>
            </div>
          ))}
        </Section>
      )}

      {verdict.conditions.length > 0 && (
        <Section title="附加条件">
          {verdict.conditions.map((c, i) => <div key={i} className="text-xs text-ink-200">· {c}</div>)}
        </Section>
      )}

      {verdict.adjustments.length > 0 && (
        <Section title="酌情调整">
          {verdict.adjustments.map((a, i) => (
            <div key={i} className="text-xs text-ink-200">
              <span style={{ color: byId[a.member_id]?.color }}>{byId[a.member_id]?.name ?? a.member_id}</span>
              {typeof a.delta === 'number' && a.delta !== 0 && (
                <span className={`ml-1 font-mono ${a.delta > 0 ? 'text-emerald-300' : 'text-red-300'}`}>{a.delta > 0 ? '+' : ''}{a.delta}pt</span>
              )}
              <span className="text-ink-300">：{a.reason}</span>
              {a.article && <span className="ml-1 text-ink-400">（第{a.article}条）</span>}
            </div>
          ))}
        </Section>
      )}

      <Section title="为什么这样分">
        <p className="text-xs leading-relaxed text-ink-200">{verdict.rationale}</p>
      </Section>

      <div className="flex flex-wrap gap-1">
        {verdict.citations.map((c) => (
          <span key={c} className="chip text-[10px] text-ink-200">第{c}条 <span className="text-ink-400">{articleShort[c]}</span></span>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <a className="btn-ghost" href={api.exportUrl(sessionId)} download={`heirarena-${sessionId}.md`}><Download size={14} /> 导出庭审记录</a>
        <button className="btn-ghost" onClick={onRestart}><RotateCcw size={14} /> 再开一庭</button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/6 bg-ink-800/60 p-3">
      <div className="mb-1.5 text-xs font-semibold text-ink-400">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}
