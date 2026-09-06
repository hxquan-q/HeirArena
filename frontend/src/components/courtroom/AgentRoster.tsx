import { PxlKitIcon } from '@pxlkit/core'
import { UserGroup } from '@pxlkit/social'
import { Robot } from '@pxlkit/ui'
import { motion } from 'motion/react'
import { Target } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import type { AgentSpec, AgentStatus, Turn } from '../../types'
import CharacterPortrait from '../scene/CharacterPortrait'
import DramaMeter from '../ui/DramaMeter'
import { statusLabel } from './viewModel'

interface AgentRosterProps {
  agents: AgentSpec[]
  statuses: Record<string, AgentStatus>
  turns: Turn[]
  betId: string | null
  bettingLocked: boolean
  onBet: (agentId: string) => void
}

const STATUS_COLOR: Record<AgentStatus, string> = {
  idle: '#a08d78',
  thinking: '#f3d38a',
  speaking: '#e2b25a',
  angry: '#ea6a5b',
  happy: '#7fd9ad',
}

export default function AgentRoster({
  agents,
  statuses,
  turns,
  betId,
  bettingLocked,
  onBet,
}: AgentRosterProps) {
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>())
  const activeId = useMemo(
    () => agents.find((agent) => statuses[agent.id] === 'speaking')?.id
      ?? agents.find((agent) => statuses[agent.id] === 'thinking')?.id
      ?? null,
    [agents, statuses],
  )
  const ordered = useMemo(() => {
    if (!activeId) return agents
    const active = agents.find((agent) => agent.id === activeId)
    return active ? [active, ...agents.filter((agent) => agent.id !== activeId)] : agents
  }, [activeId, agents])

  useEffect(() => {
    if (!activeId) return
    buttonRefs.current.get(activeId)?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }, [activeId])

  return (
    <section className="panel-elevated shrink-0 px-2.5 py-2 sm:px-3" aria-label="出席角色">
      <div className="no-scrollbar flex items-stretch gap-2 overflow-x-auto overscroll-x-contain">
        <div className="flex min-w-[86px] shrink-0 flex-col justify-center border-r-2 border-ink-700 pr-2 text-[10px] leading-tight text-ink-400">
          <span className="flex items-center gap-1.5 font-semibold text-ink-200">
            <PxlKitIcon icon={UserGroup} size={12} aria-hidden /> 出席
          </span>
          <span className="font-mono">{agents.length} 席</span>
          {!bettingLocked && (
            <span className={`mt-1 flex items-center gap-1 ${betId ? 'text-gold-300' : ''}`}>
              <Target size={9} /> {betId ? '已押注' : '点击押注'}
            </span>
          )}
        </div>

        {ordered.map((agent) => {
          const status = statuses[agent.id] ?? 'idle'
          const active = agent.id === activeId
          const betOn = betId === agent.id
          return (
            <motion.button
              ref={(node) => {
                if (node) buttonRefs.current.set(agent.id, node)
                else buttonRefs.current.delete(agent.id)
              }}
              key={agent.id}
              layout
              type="button"
              disabled={bettingLocked}
              aria-current={active || undefined}
              aria-pressed={betOn}
              aria-label={`${agent.name}，${statusLabel(status)}${bettingLocked ? '，庭审结果已锁定' : '，押注拿大头'}`}
              onClick={() => onBet(agent.id)}
              className={[
                'relative flex min-h-[58px] min-w-[148px] shrink-0 items-center gap-2 overflow-hidden border-2 px-2 py-1.5 text-left',
                'transition-[filter,opacity] disabled:cursor-default',
                active ? 'bg-ink-800' : 'border-ink-700 bg-ink-900/85',
                bettingLocked ? 'opacity-80' : 'hover:brightness-110',
              ].join(' ')}
              animate={{
                borderColor: betOn ? '#e2b25a' : active ? agent.color : '#55443a',
                boxShadow: betOn
                  ? 'inset 0 0 0 2px rgba(226,178,90,.18), 3px 3px 0 rgba(0,0,0,.6)'
                  : active
                    ? `inset 0 0 20px ${agent.color}18, 3px 3px 0 rgba(0,0,0,.6)`
                    : 'inset 0 0 0 rgba(0,0,0,0), 2px 2px 0 rgba(0,0,0,.45)',
              }}
              transition={{ duration: 0.2 }}
              title={bettingLocked ? (agent.llm ? `模型：${agent.model_label}` : '剧本模式') : `押 ${agent.name} 拿大头（再点取消）`}
            >
              <span className="flex h-11 w-10 shrink-0 items-end justify-center overflow-hidden border-2 border-ink-700 bg-ink-950">
                <CharacterPortrait
                  agent={agent}
                  status={status}
                  size={34}
                  petKind={/狗|犬|汪/.test(agent.name) ? 'dog' : 'cat'}
                  animated={false}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <strong className="truncate text-xs" style={{ color: agent.color }}>{agent.name}</strong>
                  {agent.llm && <PxlKitIcon icon={Robot} size={10} appearance="solid" color="#7dd3fc" aria-label="模型驱动" />}
                </span>
                <span className="block truncate text-[10px] text-ink-400">{agent.personality_label} · {agent.role}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[10px]" style={{ color: STATUS_COLOR[status] }}>
                  <span
                    className={`h-1.5 w-1.5 ${status === 'speaking' ? 'animate-blink-step' : ''}`}
                    style={{ background: STATUS_COLOR[status], boxShadow: active ? `0 0 7px ${agent.color}` : undefined }}
                    aria-hidden
                  />
                  {statusLabel(status)}
                </span>
              </span>
              {betOn && (
                <motion.span
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 16 }}
                  className="pixel-text absolute top-0 right-0 flex items-center gap-0.5 border-b-2 border-l-2 border-gold-600 bg-gold-500 px-1 text-[9px] leading-4 text-ink-950"
                >
                  <Target size={8} strokeWidth={3} /> 押
                </motion.span>
              )}
              {active && <motion.span layoutId="active-roster-agent" className="absolute inset-x-2 bottom-0 h-0.5" style={{ background: agent.color }} />}
            </motion.button>
          )
        })}

        <DramaMeter turns={turns} />
      </div>
    </section>
  )
}
