import { PxlKitIcon } from '@pxlkit/core'
import { PixelDivider } from '@pxlkit/ui-kit'
import { motion } from 'motion/react'
import { Crosshair } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { AgentSpec, Turn } from '../../types'
import { ACTION_STYLE } from '../scene/actionIcons'

const PHASE_LABEL: Record<string, string> = {
  opening: '开庭', statements: '陈述', debate: '辩论', negotiation: '协商', verdict: '裁决',
}

/** 一幕的标题：辩论带轮次，像剧本杀的幕间板 */
function actLabel(t: Turn): string {
  const base = PHASE_LABEL[t.phase] ?? t.phase
  return t.phase === 'debate' && t.round ? `${base} · 第 ${t.round} 轮` : base
}

type Item =
  | { kind: 'turn'; t: Turn }
  | { kind: 'ghost'; text: string; ts: number }
  | { kind: 'divider'; key: string; label: string }

interface Props {
  turns: Turn[]
  agents: AgentSpec[]
  ghosts: { text: string; ts: number }[]
  decedent: string
  focusIssues?: string[]
  highlightTurnId?: string | null
}

export default function TranscriptPanel({ turns, agents, ghosts, decedent, focusIssues, highlightTurnId }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const byId = Object.fromEntries(agents.map((a) => [a.id, a]))
  const last = turns[turns.length - 1]
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns.length, last?.text.length, ghosts.length])

  // 从裁决面板点 turn_id 跳转：切到本 Tab 并滚动到该发言
  useEffect(() => {
    if (!highlightTurnId) return
    const el = ref.current?.querySelector(`[data-turn="${highlightTurnId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // 洗掉高亮由父组件控制；这里只负责滚动
    }
  }, [highlightTurnId])

  const sorted: Item[] = [
    ...turns.map((t): Item => ({ kind: 'turn', t })),
    ...ghosts.map((g): Item => ({ kind: 'ghost', text: g.text, ts: g.ts })),
  ].sort((a, b) => (a.kind === 'turn' ? a.t.ts : a.kind === 'ghost' ? a.ts : 0) - (b.kind === 'turn' ? b.t.ts : b.kind === 'ghost' ? b.ts : 0))

  // 在阶段 / 轮次切换处插入幕间分隔（幽灵插话不影响幕次）
  const items: Item[] = []
  let lastAct = ''
  for (const it of sorted) {
    if (it.kind === 'turn') {
      const act = `${it.t.phase}-${it.t.round}`
      if (act !== lastAct) {
        lastAct = act
        items.push({ kind: 'divider', key: `act-${act}-${it.t.turn_id}`, label: actLabel(it.t) })
      }
    }
    items.push(it)
  }

  if (!items.length && !focusIssues?.length) {
    return <div className="py-16 text-center text-sm text-ink-400">听证会即将开始，执行官正在翻卷宗…</div>
  }

  return (
    <div ref={ref} className="h-full space-y-3 overflow-y-auto pr-1 text-sm">
      {focusIssues && focusIssues.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}
          className="rounded-xl border border-gold-500/20 bg-gold-500/6 px-3 py-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.16em] text-gold-300">
            <Crosshair size={12} /> 本庭争议焦点
          </div>
          <ol className="space-y-0.5">
            {focusIssues.map((f, i) => (
              <li key={i} className="flex gap-1.5 text-xs leading-relaxed text-ink-200">
                <span className="font-mono text-[10px] text-gold-400">{i + 1}.</span>{f}
              </li>
            ))}
          </ol>
        </motion.div>
      )}
      {items.map((it) => {
        if (it.kind === 'divider') {
          return (
            <motion.div key={it.key} initial={{ opacity: 0, scaleX: 0.7 }} animate={{ opacity: 1, scaleX: 1 }} transition={{ duration: 0.3 }}
              className="px-2 pt-1" style={{ transformOrigin: '50% 50%' }}>
              <PixelDivider label={`—— ${it.label} ——`} tone="gold" spacing="sm" />
            </motion.div>
          )
        }
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
          <motion.div key={t.turn_id} data-turn={t.turn_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}
            className={`flex gap-2.5 rounded-lg p-1 -m-1 transition-colors ${highlightTurnId === t.turn_id ? 'bg-violet-400/10 ring-1 ring-violet-400/30' : ''}`}>
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
