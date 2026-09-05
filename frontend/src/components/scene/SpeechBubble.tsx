import { motion } from 'motion/react'
import { useEffect, useRef, type CSSProperties } from 'react'
import type { AgentSpec, TurnMeta } from '../../types'

const ACTION_LABEL: Record<string, { label: string; cls: string }> = {
  attack: { label: '⚔ 攻击', cls: 'text-red-300 border-red-400/40 bg-red-500/10' },
  ally: { label: '🤝 结盟', cls: 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10' },
  propose: { label: '📝 提案', cls: 'text-sky-300 border-sky-400/40 bg-sky-500/10' },
  concede: { label: '🫠 让步', cls: 'text-amber-300 border-amber-400/40 bg-amber-500/10' },
  plead: { label: '🥺 恳求', cls: 'text-pink-300 border-pink-400/40 bg-pink-500/10' },
}

interface Props {
  agent: AgentSpec
  text: string
  live: boolean
  meta?: TurnMeta
  scale: number
  anchor: { x: number; y: number }
  side: 'left' | 'right'
}

export default function SpeechBubble({ agent, text, live, meta, scale, anchor, side }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [text])

  const width = 400 * scale
  const style: CSSProperties = side === 'right'
    ? { left: anchor.x * scale, top: anchor.y * scale, width }
    : { left: anchor.x * scale - width, top: anchor.y * scale, width }
  const action = meta ? ACTION_LABEL[meta.action] : null

  return (
    <motion.div className="absolute z-[900]" style={style} initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25 }}>
      <div className="relative rounded-2xl border bg-ink-900/90 shadow-[0_18px_50px_-12px_rgba(0,0,0,.7)] backdrop-blur-md"
        style={{ borderColor: `${agent.color}66`, boxShadow: `0 0 0 1px ${agent.color}22, 0 18px 50px -12px rgba(0,0,0,.7)` }}>
        <div className="flex items-center gap-2 border-b border-white/6 px-3 py-1.5" style={{ fontSize: Math.max(10, 12 * scale) }}>
          <span className="h-2 w-2 rounded-full" style={{ background: agent.color, boxShadow: `0 0 10px ${agent.color}` }} />
          <span className="font-semibold" style={{ color: agent.color }}>{agent.name}</span>
          <span className="text-ink-400">{agent.role}</span>
          {live && <span className="ml-auto text-ink-400">发言中…</span>}
          {!live && action && (
            <span className={`ml-auto rounded-full border px-2 py-[1px] text-[0.9em] ${action.cls}`}>{action.label}</span>
          )}
        </div>
        <div ref={ref} className="overflow-y-auto px-3 py-2 leading-relaxed text-ink-100"
          style={{ fontSize: Math.max(11, 14 * scale), maxHeight: 150 * scale }}>
          {text || <span className="text-ink-400">…</span>}
          {live && <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-caret bg-gold-300" />}
        </div>
        <span className={`absolute bottom-5 h-3 w-3 rotate-45 border bg-ink-900 ${side === 'right' ? '-left-[7px] border-r-0 border-t-0' : '-right-[7px] border-l-0 border-b-0'}`}
          style={{ borderColor: `${agent.color}66` }} />
      </div>
    </motion.div>
  )
}
