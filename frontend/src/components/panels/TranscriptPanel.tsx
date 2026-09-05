import { PxlKitIcon } from '@pxlkit/core'
import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import type { AgentSpec, Turn } from '../../types'
import { ACTION_STYLE } from '../scene/actionIcons'

const PHASE_LABEL: Record<string, string> = {
  opening: '开庭', statements: '陈述', debate: '辩论', negotiation: '协商', verdict: '裁决',
}

interface Props {
  turns: Turn[]
  agents: AgentSpec[]
  ghosts: { text: string; ts: number }[]
  decedent: string
}

export default function TranscriptPanel({ turns, agents, ghosts, decedent }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const byId = Object.fromEntries(agents.map((a) => [a.id, a]))
  const last = turns[turns.length - 1]
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns.length, last?.text.length, ghosts.length])

  const items: ({ kind: 'turn'; t: Turn } | { kind: 'ghost'; text: string; ts: number })[] = [
    ...turns.map((t) => ({ kind: 'turn' as const, t })),
    ...ghosts.map((g) => ({ kind: 'ghost' as const, text: g.text, ts: g.ts })),
  ].sort((a, b) => (a.kind === 'turn' ? a.t.ts : a.ts) - (b.kind === 'turn' ? b.t.ts : b.ts))

  if (!items.length) {
    return <div className="py-16 text-center text-sm text-ink-400">听证会即将开始，执行官正在翻卷宗…</div>
  }

  return (
    <div ref={ref} className="h-full space-y-3 overflow-y-auto pr-1 text-sm">
      {items.map((it) => {
        if (it.kind === 'ghost') {
          return (
            <motion.div key={`g${it.ts}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}
              className="mx-2 rounded-xl border border-violet-400/30 bg-violet-950/40 px-3 py-2 text-xs text-violet-100">
              👻 <b>{decedent} 的幽灵</b>：{it.text}
            </motion.div>
          )
        }
        const t = it.t
        const a = byId[t.agent_id]
        const target = t.meta?.target ? byId[t.meta.target] : null
        const action = t.meta ? ACTION_STYLE[t.meta.action] : null
        return (
          <motion.div key={t.turn_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="flex gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              style={{ background: `${a?.color ?? '#5b647a'}22`, color: a?.color ?? '#8b93a7', border: `1px solid ${a?.color ?? '#5b647a'}66` }}>
              {a?.kind === 'judge' ? '⚖' : a?.kind === 'pet' ? '🐾' : a?.kind === 'ai' ? '🤖' : (a?.name ?? '?').slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-semibold" style={{ color: a?.color }}>{a?.name ?? t.agent_id}</span>
                <span className="text-ink-400">{a?.role}</span>
                <span className="chip text-[10px] text-ink-300">{PHASE_LABEL[t.phase] ?? t.phase}{t.round ? ` R${t.round}` : ''}</span>
                {action && (
                  <span className={`chip text-[10px] ${action.cls}`}>
                    <PxlKitIcon icon={action.icon} size={11} aria-label={action.label} />
                    {action.label}{target ? ` → ${target.name}` : ''} {t.meta?.emoji}
                  </span>
                )}
              </div>
              <div className={`mt-1 rounded-xl rounded-tl-sm px-3 py-2 leading-relaxed ${a?.kind === 'judge' ? 'border border-gold-500/25 bg-gold-500/6 text-ink-100' : 'bg-ink-800/70 text-ink-200'}`}>
                {t.text || <span className="text-ink-400">…</span>}
                {!t.done && <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-caret bg-gold-300" />}
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
