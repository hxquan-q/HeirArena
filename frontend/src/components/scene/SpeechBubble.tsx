import { PxlKitIcon } from '@pxlkit/core'
import { motion } from 'motion/react'
import { useEffect, useRef, type CSSProperties } from 'react'
import type { AgentSpec, TurnMeta } from '../../types'
import { ACTION_STYLE } from './actionIcons'

interface Props {
  agent: AgentSpec
  text: string
  live: boolean
  meta?: TurnMeta
  scale: number
  anchor: { x: number; y: number }
  side: 'left' | 'right'
  /** 窄舞台：不再悬浮在人物旁边，而是贴在舞台底部横铺成一条 RPG 对话条 */
  compact?: boolean
}

/**
 * 舞台发言框：RPG 对话框式——方角、2px 亮边 + 内嵌暗线、硬阴影，
 * 左上角是角色名牌，说完后右下角出现闪烁的 ▼（"按键继续"的老习惯）。
 */
export default function SpeechBubble({ agent, text, live, meta, scale, anchor, side, compact = false }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [text])

  const width = 400 * scale
  const style: CSSProperties = compact
    ? { left: 8, right: 8, bottom: 8 }
    : side === 'right'
      ? { left: anchor.x * scale, top: anchor.y * scale, width }
      : { left: anchor.x * scale - width, top: anchor.y * scale, width }
  const action = meta ? ACTION_STYLE[meta.action] : null
  const fs = compact ? 12 : Math.max(11, 14 * scale)
  const maxHeight = compact ? Math.max(72, 0.34 * 700 * scale) : 150 * scale

  return (
    <motion.div className="absolute z-[900]" style={style} initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25 }}>
      <div
        className="relative mt-3 border-2 bg-ink-950/95"
        style={{
          borderColor: agent.color,
          boxShadow: 'inset 0 0 0 2px #17120f, inset 0 0 0 3px rgba(224,211,185,.28), 4px 4px 0 rgba(0,0,0,.65)',
        }}
      >
        {/* 名牌：像 NPC 对话框那样顶在左上角 */}
        <div
          className="absolute -top-3.5 left-3 flex items-center gap-1.5 border-2 bg-ink-800 px-2 py-0.5 shadow-[2px_2px_0_rgba(0,0,0,.6)]"
          style={{ borderColor: agent.color, fontSize: Math.max(10, 12 * scale) }}
        >
          <span className="h-2 w-2 shrink-0" style={{ background: agent.color }} aria-hidden />
          <span className="pixel-text font-semibold" style={{ color: agent.color }}>{agent.name}</span>
          <span className="pixel-text text-ink-400">{agent.role}</span>
        </div>

        {/* 右上角：发言中 / 动作标签 */}
        <div className="absolute -top-3.5 right-3" style={{ fontSize: Math.max(10, 11 * scale) }}>
          {live ? (
            <span className="pixel-text inline-flex items-center gap-1 border-2 border-ink-600 bg-ink-800 px-1.5 py-0.5 text-gold-300 shadow-[2px_2px_0_rgba(0,0,0,.6)]">
              <span className="h-1.5 w-1.5 animate-blink-step bg-gold-300" aria-hidden /> 发言中
            </span>
          ) : action ? (
            <span className={`pixel-text inline-flex items-center gap-1 border-2 px-1.5 py-0.5 shadow-[2px_2px_0_rgba(0,0,0,.6)] ${action.cls}`}>
              <PxlKitIcon icon={action.icon} size={Math.max(10, 12 * scale)} aria-label={action.label} />
              {action.label}
            </span>
          ) : null}
        </div>

        <div ref={ref} className="overflow-y-auto px-3.5 pt-4 pb-4 leading-relaxed text-ink-100"
          style={{ fontSize: fs, maxHeight }}>
          {text || <span className="text-ink-400">…</span>}
          {live && <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-caret bg-gold-300" />}
        </div>
        {!live && (
          <span className="pixel-text pointer-events-none absolute right-2.5 bottom-1 animate-blink-step text-gold-300" style={{ fontSize: fs * 0.85 }} aria-hidden>▼</span>
        )}

        {/* 指向发言人的三角：与边框同色的方块旋转 45°，保持像素硬边；贴底对话条不需要 */}
        {!compact && (
          <span
            className={`absolute bottom-5 h-3 w-3 rotate-45 border-2 bg-ink-950 ${side === 'right' ? '-left-[8px] border-t-0 border-r-0' : '-right-[8px] border-b-0 border-l-0'}`}
            style={{ borderColor: agent.color }}
            aria-hidden
          />
        )}
      </div>
    </motion.div>
  )
}
