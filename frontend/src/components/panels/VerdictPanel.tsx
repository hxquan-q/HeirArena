import { ParallaxPxlKitIcon, PxlKitIcon } from '@pxlkit/core'
import { Flag, Skull, Sword, Trophy } from '@pxlkit/gamification'
import { Friends } from '@pxlkit/social'
import { PixelCrown } from '@pxlkit/parallax'
import { PixelChip, PixelStatCard, PixelTypewriter } from '@pxlkit/ui-kit'
import { motion } from 'motion/react'
import { Download, FileText, Handshake, ListChecks, RotateCcw, Search, Target } from 'lucide-react'
import type { ReactNode } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { api } from '../../api/client'
import { ASSET_EMOJI } from '../../data/presets'
import type { AgentSpec, CaseInput, DoneStats, Turn, Verdict } from '../../types'

interface Props {
  verdict: Verdict | null
  caseData: CaseInput
  agents: AgentSpec[]
  articleShort: Record<string, string>
  done: DoneStats | null
  sessionId: string
  onRestart: () => void
  turns: Turn[]
  /** 庭前竞猜：用户押注"谁拿大头"的 agent id */
  betId?: string | null
  onJumpToTurn: (turnId: string) => void
}

export default function VerdictPanel({ verdict, caseData, agents, articleShort, done, sessionId, onRestart, turns, betId, onJumpToTurn }: Props) {
  const byId = Object.fromEntries(agents.map((a) => [a.id, a]))
  const turnText = (tid: string) => {
    const t = turns.find((x) => x.turn_id === tid)
    return t ? `${t.text.slice(0, 60)}${t.text.length > 60 ? '…' : ''}` : null
  }
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
  const topHeir = heirs.reduce((best, id) => ((verdict.value_shares[id] ?? 0) > (verdict.value_shares[best] ?? 0) ? id : best), heirs[0])
  const betWin = betId != null && betId === topHeir

  return (
    <div className="space-y-4 text-sm">
      {betId && (
        <motion.div initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs ${betWin
            ? 'border-gold-500/40 bg-gold-500/10 text-gold-200'
            : 'border-white/10 bg-ink-900/70 text-ink-300'}`}>
          <Target size={15} className={betWin ? 'text-gold-300' : 'text-ink-400'} />
          {betWin ? (
            <span><b className="text-gold-300">神机妙算！</b>你押的 {byId[betId]?.name ?? betId} 真的拿了大头（{verdict.value_shares[betId]?.toFixed(1)}%）。</span>
          ) : (
            <span>你押了 {byId[betId]?.name ?? betId}（{verdict.value_shares[betId]?.toFixed(1) ?? 0}%），拿大头的是 {byId[topHeir]?.name ?? topHeir}（{verdict.value_shares[topHeir]?.toFixed(1)}%）。</span>
          )}
          {betWin && <PxlKitIcon icon={Trophy} size={15} className="ml-auto shrink-0" />}
        </motion.div>
      )}

      {verdict.speech && (
        <blockquote className="relative rounded-xl border border-gold-500/25 bg-gold-500/6 px-4 pt-4 pb-3 text-[13px] leading-relaxed text-ink-100">
          <span className="absolute -top-2.5 left-3 rounded-full border border-gold-500/35 bg-ink-900 px-2 py-0.5 text-[10px] font-bold tracking-[0.18em] text-gold-300">
            ⚖ 执行官宣判
          </span>
          <PixelTypewriter label={verdict.speech} speed={22} tone="gold" />
        </blockquote>
      )}

      {verdict.judgment && (verdict.judgment.findings || verdict.judgment.reasoning || verdict.judgment.orders?.length) && (
        <div className="rounded-xl border border-white/8 bg-ink-900/70 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-gold-300">
            <FileText size={13} /> 判决书 JUDGMENT
          </div>
          {verdict.judgment.findings && (
            <p className="text-xs leading-relaxed text-ink-200">
              <span className="font-bold text-ink-100">经审理查明：</span>{verdict.judgment.findings}
            </p>
          )}
          {verdict.judgment.reasoning && (
            <p className="mt-2 text-xs leading-relaxed text-ink-200">
              <span className="font-bold text-ink-100">本院认为：</span>{verdict.judgment.reasoning}
            </p>
          )}
          {verdict.judgment.orders?.length ? (
            <ol className="mt-3 space-y-1.5 border-t border-white/6 pt-3">
              {verdict.judgment.orders.map((o, i) => (
                <li key={i} className="flex gap-2 text-xs leading-relaxed text-ink-100">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-gold-500/25 bg-gold-500/10 font-mono text-[9px] text-gold-300">{i + 1}</span>
                  {o}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      )}

      {done && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <PixelStatCard label="戏剧指数" value={String(done.drama_score)} size="sm" tone="gold" valueTone align="start"
            icon={<PxlKitIcon icon={Trophy} size={16} />} />
          <PixelStatCard label="攻击" value={String(done.stats.attacks ?? 0)} size="sm" tone="red" valueTone align="start"
            icon={<PxlKitIcon icon={Sword} size={16} />} />
          <PixelStatCard label="结盟" value={String(done.stats.alliances ?? 0)} size="sm" tone="green" valueTone align="start"
            icon={<PxlKitIcon icon={Friends} size={16} />} />
          <PixelStatCard label="让步" value={String(done.stats.concessions ?? 0)} size="sm" tone="neutral" valueTone align="start"
            icon={<PxlKitIcon icon={Flag} size={16} />} />
          <PixelStatCard label="幽灵插话" value={String(done.stats.ghost ?? 0)} size="sm" tone="purple" valueTone align="start"
            icon={<PxlKitIcon icon={Skull} size={16} />} />
        </div>
      )}

      <div className="rounded-xl border border-white/6 bg-ink-800/60 p-3">
        <div className="mb-1 text-xs font-semibold text-ink-400">最终价值份额（遗产净额 {verdict.estate_total} 万元）</div>
        <div className="flex items-center gap-2">
          <div className="relative h-36 w-36 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={36} outerRadius={64} paddingAngle={2} stroke="#0b0d12" strokeWidth={2}>
                  {pie.map((p) => <Cell key={p.id} fill={p.color} />)}
                </Pie>
                <Tooltip formatter={(v) => `${v}%`} contentStyle={{ background: '#151924', border: '1px solid #2a3142', borderRadius: 10, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[9px] tracking-widest text-ink-400">净额</span>
              <span className="font-mono text-sm font-bold text-gold-300">{verdict.estate_total}万</span>
            </div>
          </div>
          <table className="w-full text-xs">
            <thead className="text-ink-400">
              <tr><th className="text-left font-normal">继承人</th><th className="pl-2 text-right font-normal">法定</th><th className="pl-2 text-right font-normal">裁决</th><th className="pl-2 text-right font-normal">到手</th></tr>
            </thead>
            <tbody>
              {heirs.map((id) => {
                const legal = verdict.legal_percent[id] ?? 0
                const final = verdict.value_shares[id] ?? 0
                const d = final - legal
                return (
                  <tr key={id} className="border-t border-white/5">
                    <td className="py-1 whitespace-nowrap">
                      <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: byId[id]?.color }} />
                      {byId[id]?.name ?? id}
                      {id === topHeir && heirs.length > 1 && (
                      <span className="ml-1 inline-flex align-middle" title="份额最高">
                        <ParallaxPxlKitIcon icon={PixelCrown} size={13} interactive appearance="palette" />
                      </span>
                    )}
                    </td>
                    <td className="pl-2 text-right font-mono text-ink-300">{legal.toFixed(1)}%</td>
                    <td className={`pl-2 text-right font-mono font-semibold ${d > 0.5 ? 'text-emerald-300' : d < -0.5 ? 'text-red-300' : 'text-ink-100'}`}>{final.toFixed(1)}%</td>
                    <td className="pl-2 text-right font-mono text-gold-300">{verdict.member_value[id] ?? 0} 万</td>
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
              {a.turn_ids?.length ? (
                <span className="ml-1 inline-flex gap-1 align-middle">
                  {a.turn_ids.map((tid) => (
                    <button key={tid} onClick={() => onJumpToTurn(tid)} title={turnText(tid) ?? undefined}
                      className="chip border-violet-400/20 bg-violet-400/6 px-1.5 font-mono text-[9px] text-violet-200 transition hover:border-violet-400/40 hover:text-violet-100">
                      {tid}
                    </button>
                  ))}
                </span>
              ) : null}
            </div>
          ))}
        </Section>
      )}

      {verdict.established_facts?.length ? (
        <Section title={`当庭成立的法律事实 · 证据卡（酌情 ±${verdict.discretion ?? 0}pt）`}>
          <div className="grid gap-2.5 pt-1 sm:grid-cols-2">
            {verdict.established_facts.map((f, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, y: 12, rotate: 0 }}
                animate={{ opacity: 1, y: 0, rotate: i % 2 ? 0.6 : -0.6 }}
                transition={{ delay: 0.15 + i * 0.09, type: 'spring', stiffness: 240, damping: 19 }}
                className="relative border-2 border-dashed border-gold-500/35 bg-[linear-gradient(165deg,rgba(233,190,111,.08),rgba(0,0,0,.3))] px-3 pt-3.5 pb-2.5 shadow-[3px_3px_0_rgba(0,0,0,.45)]">
                <span className="pixel-text absolute -top-2.5 left-2 border border-gold-600 bg-ink-950 px-1.5 text-[10px] leading-4 text-gold-300 shadow-[1.5px_1.5px_0_rgba(0,0,0,.6)]">
                  证据 {String(i + 1).padStart(2, '0')}
                </span>
                <div className="flex items-start gap-1.5 text-xs leading-relaxed text-ink-100">
                  <ListChecks size={13} className="mt-0.5 shrink-0 text-emerald-300" />
                  <span>{f.text}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-5">
                  <span className="chip text-[9px] text-ink-300">第{f.article}条</span>
                  {f.turn_ids?.length ? <span className="text-[10px] text-ink-400">来源发言：</span> : null}
                  {f.turn_ids?.map((tid) => (
                    <button key={tid} onClick={() => onJumpToTurn(tid)} title={turnText(tid) ?? undefined}
                      className="chip border-violet-400/20 bg-violet-400/6 px-1.5 font-mono text-[9px] text-violet-200 transition hover:border-violet-400/40 hover:text-violet-100">
                      {tid}
                    </button>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </Section>
      ) : null}

      {verdict.open_questions?.length ? (
        <Section title="需要进一步确认的问题">
          {verdict.open_questions.map((q, i) => (
            <div key={i} className="flex gap-1.5 text-xs leading-relaxed text-ink-200">
              <Search size={13} className="mt-0.5 shrink-0 text-amber-300" /> {q}
            </div>
          ))}
        </Section>
      ) : null}

      {verdict.unaddressed?.length ? (
        <Section title="各方论点评估 · 漏接分析">
          {verdict.unaddressed.map((u, i) => (
            <div key={i} className="rounded-lg border border-white/6 bg-black/20 px-2.5 py-2 text-xs leading-relaxed">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: byId[u.member_id]?.color ?? '#6d7588' }} />
                <span className="font-bold" style={{ color: byId[u.member_id]?.color }}>{byId[u.member_id]?.name ?? u.member_id}</span>
              </div>
              {u.strongest && <div className="mt-1 text-ink-200"><span className="text-emerald-300">最有说服力</span> · {u.strongest}</div>}
              {u.missed && <div className="mt-0.5 text-ink-300"><span className="text-red-300">未回应</span> · {u.missed}</div>}
            </div>
          ))}
        </Section>
      ) : null}

      {verdict.settlement && (verdict.settlement.overview || verdict.settlement.plans?.length) ? (
        <div className="rounded-xl border border-emerald-400/15 bg-emerald-950/20 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
            <Handshake size={13} /> 若不接受判决：和解三档方案
          </div>
          {verdict.settlement.overview && <p className="mb-2 text-xs leading-relaxed text-ink-200">{verdict.settlement.overview}</p>}
          <div className="grid gap-1.5">
            {verdict.settlement.plans?.map((p, i) => (
              <div key={i} className="rounded-lg border border-white/6 bg-black/25 px-2.5 py-2">
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <span className="flex h-4 w-4 items-center justify-center rounded bg-emerald-400/15 font-mono text-[10px] text-emerald-300">{p.tier}</span>
                  <span className="text-ink-100">{p.title}</span>
                </div>
                <div className="mt-1 text-xs leading-relaxed text-ink-300">{p.detail}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Section title="为什么这样分">
        <p className="text-xs leading-relaxed text-ink-200">{verdict.rationale}</p>
      </Section>

      <div className="flex flex-wrap gap-1.5">
        {verdict.citations.map((c) => (
          <PixelChip key={c} label={`第${c}条 ${articleShort[c] ?? ''}`} tone="gold" size="sm" />
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
