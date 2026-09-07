import { PixelStatCard } from '@pxlkit/ui-kit'
import { ChevronDown, Scale } from 'lucide-react'
import { useState } from 'react'
import type { AgentSpec, LegalResult } from '../../types'

interface Props {
  legal: LegalResult
  agents: AgentSpec[]
  articleShort: Record<string, string>
}

export default function LegalPanel({ legal, agents, articleShort }: Props) {
  const [openArticle, setOpenArticle] = useState<string | null>(null)
  const [showSteps, setShowSteps] = useState(true)
  const color = Object.fromEntries(agents.map((a) => [a.id, a.color]))
  const eligible = legal.shares.filter((s) => s.eligible && s.percent > 0)
  const others = legal.shares.filter((s) => !(s.eligible && s.percent > 0))

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-3 gap-2">
        <PixelStatCard label="资产估值" value={`${fmt(legal.gross_total)} 万`} size="sm" tone="neutral" align="start" />
        <PixelStatCard label="配偶析产" value={legal.community_deduction ? `-${fmt(legal.community_deduction)} 万` : '—'} size="sm" tone="neutral" align="start" trend="第1153条" />
        <PixelStatCard label="遗产净额" value={`${fmt(legal.estate_total)} 万`} size="sm" tone="gold" valueTone align="start" />
      </div>

      <div className="flex items-center gap-2 text-xs text-ink-300">
        <Scale size={14} className="text-gold-400" />
        适用 <b className="text-ink-100">{legal.order_used === 1 ? '第一顺序' : legal.order_used === 2 ? '第二顺序' : '无人继承'}</b>
        法定继承（第1127条），同一顺序一般均等，依第1130条酌情多分 / 少分。
      </div>

      <div className="space-y-2">
        {/* 每位继承人一张"角色状态卡"：色块名牌 + HP 条式份额 */}
        {eligible.map((s) => {
          const c = color[s.member_id] ?? '#a08d78'
          return (
            <div key={s.member_id} className="panel-inset p-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0 border-2 border-ink-950 shadow-[1px_1px_0_rgba(0,0,0,.6)]" style={{ background: c }} aria-hidden />
                <span className="pixel-text text-[14px] text-ink-100">{s.name}</span>
                <span className="text-xs text-ink-400">{s.relation}{s.via ? ` · 代位 ${s.via}` : ''}</span>
                <span className="pixel-text ml-auto text-[16px] text-gold-300">{s.percent.toFixed(1)}%</span>
              </div>
              <div className="hp-track mt-2 h-3 overflow-hidden">
                <div className="h-full transition-[width] duration-300" style={{ width: `${Math.min(100, s.percent)}%`, background: c, boxShadow: 'inset 0 -2px 0 rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.3)' }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {s.basis.map((b) => (
                  <button key={b} onClick={() => setOpenArticle(openArticle === b ? null : b)}
                    className={`chip transition hover:border-gold-600 ${openArticle === b ? 'border-gold-600 bg-gold-600/15 text-gold-300' : 'text-ink-200'}`}>
                    第{b}条 <span className="text-ink-400">{articleShort[b]}</span>
                  </button>
                ))}
                {s.weight !== 1 && s.weight > 0 && (
                  <span className={`chip ${s.weight > 1 ? 'border-jade-700 text-jade-300' : 'border-seal-700 text-seal-400'}`}>权重 ×{s.weight.toFixed(2)}</span>
                )}
              </div>
              <ul className="mt-2 space-y-0.5 text-xs text-ink-300">
                {s.notes.map((n, i) => <li key={i}>· {n}</li>)}
              </ul>
            </div>
          )
        })}
        {others.length > 0 && (
          <div className="border-2 border-dashed border-ink-600 bg-ink-950/60 p-3">
            <div className="pixel-text mb-2 text-[12px] text-ink-400">不参与分配 / 酌情分给</div>
            <div className="space-y-2">
              {others.map((s) => (
                <div key={s.member_id} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 border border-ink-950" style={{ background: color[s.member_id] ?? '#55443a' }} aria-hidden />
                    <span className="pixel-text text-[13px] text-ink-200">{s.name}</span>
                    <span className="text-ink-400">{s.relation}</span>
                    {s.percent > 0 && <span className="pixel-text ml-auto text-[13px] text-gold-300">{s.percent}%</span>}
                    {s.basis.map((b) => (
                      <button key={b} onClick={() => setOpenArticle(openArticle === b ? null : b)} className="chip py-0 text-[11px] text-ink-300 hover:border-gold-600">第{b}条</button>
                    ))}
                  </div>
                  <div className="mt-0.5 pl-4 text-ink-400">{s.notes.join('；')}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {openArticle && legal.articles[openArticle] && (
        <div className="panel-inset border-gold-600 p-3 text-xs leading-relaxed text-ink-200">
          <div className="pixel-text mb-1 text-[12px] text-gold-300">《民法典》第{openArticle}条 · {articleShort[openArticle]}</div>
          {legal.articles[openArticle]}
        </div>
      )}

      <div className="panel">
        <button onClick={() => setShowSteps((v) => !v)} className="pixel-text flex w-full items-center justify-between px-3 py-2 text-[12px] text-ink-200">
          规则引擎计算过程
          <ChevronDown size={14} className={`transition ${showSteps ? 'rotate-180' : ''}`} />
        </button>
        {showSteps && (
          <ol className="space-y-1.5 border-t-2 border-ink-700 px-3 py-2 text-xs text-ink-300">
            {legal.steps.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="pixel-text mt-[2px] flex h-4 w-4 shrink-0 items-center justify-center border border-ink-600 bg-ink-950 text-[10px] text-gold-300">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

const fmt = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1))
