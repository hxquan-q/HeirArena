import { PxlKitIcon } from '@pxlkit/core'
import { MessageSquare } from '@pxlkit/feedback'
import { motion } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import type { AgentSpec, AgentStatus, Turn } from '../../types'
import CharacterPortrait from '../scene/CharacterPortrait'
import { ACTION_STYLE } from '../scene/actionIcons'
import { statusLabel } from './viewModel'

interface ActiveTestimonyProps {
  turn: Turn | null
  agent?: AgentSpec
  status: AgentStatus
  phaseLabel?: string
  targetName?: string
  onOpenTranscript: () => void
}

export default function ActiveTestimony({
  turn,
  agent,
  status,
  phaseLabel,
  targetName,
  onOpenTranscript,
}: ActiveTestimonyProps) {
  if (!turn || !agent) {
    return (
      <section className="panel-elevated flex min-h-[96px] shrink-0 items-center gap-3 px-4 py-3" aria-label="当前发言">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center border-2 border-ink-600 bg-ink-950 text-gold-300">
          <PxlKitIcon icon={MessageSquare} size={21} appearance="solid" color="#e2b25a" />
        </span>
        <div className="min-w-0">
          <div className="pixel-text text-[13px] tracking-[0.08em] text-gold-300">{phaseLabel || '等待发言'}</div>
          <p className="mt-1 text-xs leading-5 text-ink-400">执行官正在核对卷宗，下一位发言者会在这里出现。</p>
        </div>
      </section>
    )
  }

  const action = turn.meta ? ACTION_STYLE[turn.meta.action] : null
  const speaking = !turn.done

  return (
    <motion.section
      key={turn.turn_id}
      className="panel-elevated relative grid shrink-0 grid-cols-[58px_minmax(0,1fr)] gap-3 overflow-hidden px-3 py-3 sm:grid-cols-[68px_minmax(0,1fr)_auto] sm:px-4"
      aria-label={`当前发言：${agent.name}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{ background: agent.color, boxShadow: `2px 0 16px ${agent.color}66` }}
        aria-hidden
      />

      <div className="relative flex h-[68px] w-[58px] items-end justify-center overflow-hidden border-2 border-ink-600 bg-ink-950 sm:h-[78px] sm:w-[68px]">
        <CharacterPortrait
          agent={agent}
          status={status}
          size={54}
          petKind={/狗|犬|汪/.test(agent.name) ? 'dog' : 'cat'}
          animated={false}
        />
      </div>

      <div className="min-w-0">
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="pixel-text truncate text-[15px]" style={{ color: agent.color }}>{agent.name}</h2>
          <span className="text-[11px] text-ink-400">{agent.title || agent.role} · {agent.personality_label}</span>
          <span className={`chip border-ink-700 px-1.5 py-0 text-[10px] ${speaking ? 'text-gold-300' : 'text-ink-300'}`}>
            <span className={`h-1.5 w-1.5 ${speaking ? 'animate-blink-step bg-gold-300' : 'bg-ink-400'}`} aria-hidden />
            {statusLabel(status)}
          </span>
          {!speaking && <span className="font-mono text-[9px] text-ink-400">已记录</span>}
          {phaseLabel && <span className="font-mono text-[10px] text-ink-400">{phaseLabel}</span>}
          {action && (
            <span className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] ${action.cls}`}>
              <PxlKitIcon icon={action.icon} size={11} aria-hidden />
              {action.label}{targetName ? ` · 对 ${targetName}` : ''}
            </span>
          )}
        </header>
        <div className="mt-1.5 max-h-24 overflow-y-auto pr-2 text-[13px] leading-6 text-ink-100 sm:text-sm">
          {turn.text || <span className="text-ink-400">正在组织观点…</span>}
          {speaking && <span className="ml-1 inline-block h-[1em] w-0.5 translate-y-0.5 animate-caret bg-gold-300" aria-hidden />}
        </div>
      </div>

      <button
        type="button"
        className="btn-ghost col-span-2 min-h-11 justify-center self-center px-3 sm:col-span-1"
        onClick={onOpenTranscript}
        aria-label="查看完整庭审记录"
      >
        庭审记录 <ArrowRight size={13} />
      </button>
    </motion.section>
  )
}
