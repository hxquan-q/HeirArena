import { AnimatedPxlKitIcon } from '@pxlkit/core'
import { PulsingDot } from '@pxlkit/ui'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useCourt } from '../../store/useCourt'
import type { AgentSpec } from '../../types'
import CharacterPortrait from './CharacterPortrait'
import { EXECUTOR_ANCHOR, H, PODIUM_ANCHOR, W, seatPositions, spriteSize, type Pt } from './layout'
import { RoomBackground, RoomForeground } from './Room'
import SpeechBubble from './SpeechBubble'

function useSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

export default function CourtroomScene() {
  const boxRef = useRef<HTMLDivElement>(null)
  const box = useSize(boxRef)
  // 桌面单屏布局（与页面的 xl 断点一致）下容器有独立的固定高度，舞台取"宽 / 高"两个约束的较小者；
  // 堆叠布局下容器高度就是舞台自身高度，若也按高度算会自引用，因此只按宽度铺满。
  const oneScreen = useMediaQuery('(min-width: 80rem)')
  const fitW = oneScreen && box.h > 0 ? Math.min(box.w, box.h * (W / H)) : box.w
  const scale = fitW > 0 ? fitW / W : 0

  const agents = useCourt((s) => s.agents)
  const caseData = useCourt((s) => s.caseData)
  const statuses = useCourt((s) => s.statuses)
  const turns = useCourt((s) => s.turns)
  const activeTurnId = useCourt((s) => s.activeTurnId)
  const relations = useCourt((s) => s.relations)
  const reactions = useCourt((s) => s.reactions)
  const gavelAt = useCourt((s) => s.gavelAt)
  const ghosts = useCourt((s) => s.ghosts)
  const phase = useCourt((s) => s.phase)

  const executor = agents.find((a) => a.kind === 'judge')
  const debaters = useMemo(() => {
    const deceased = new Set(caseData?.members.filter((m) => m.deceased).map((m) => m.id) ?? [])
    return agents.filter((a) => a.kind !== 'judge' && !deceased.has(a.id))
  }, [agents, caseData])

  const seats = useMemo(() => seatPositions(debaters.length), [debaters.length])
  const seatOf = useMemo(() => {
    const m = new Map<string, Pt>()
    debaters.forEach((a, i) => m.set(a.id, seats[i]))
    return m
  }, [debaters, seats])
  const size = spriteSize(debaters.length)

  // 1 秒一跳的时钟：用于气泡保留、幽灵消息、落槌特效等基于时间的派生状态
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const activeTurn = turns.find((t) => t.turn_id === activeTurnId) ?? null
  const lastTurn = turns.length ? turns[turns.length - 1] : null
  const bubbleTurn = activeTurn ?? (lastTurn && now - lastTurn.ts < 60_000 ? lastTurn : null)
  const speakerId = activeTurn && activeTurn.agent_id !== executor?.id ? activeTurn.agent_id : null

  const posOf = (id: string): Pt => {
    if (id === executor?.id) return EXECUTOR_ANCHOR
    if (id === speakerId) return PODIUM_ANCHOR
    return seatOf.get(id) ?? PODIUM_ANCHOR
  }

  const activeAgent = agents.find((a) => ['thinking', 'speaking'].includes(statuses[a.id] ?? 'idle'))
  const activeStatus = activeAgent ? statuses[activeAgent.id] : null

  const petKind = (a: AgentSpec): 'cat' | 'dog' => {
    const hay = `${a.name} ${caseData?.assets.map((x) => x.name).join(' ') ?? ''}`
    return /狗|犬|汪|dog/i.test(hay) && !/猫|喵|cat/i.test(a.name) ? 'dog' : 'cat'
  }

  const gavelVisible = gavelAt !== null && now - gavelAt < 2600
  const recentGhost = ghosts.length && now - ghosts[ghosts.length - 1].ts < 8000 ? ghosts[ghosts.length - 1] : null

  // 阶段切换横幅：新阶段出现时闪现约 2 秒
  const [splash, setSplash] = useState<{ label: string; key: number } | null>(null)
  const prevPhaseKey = useRef<string | null>(null)
  useEffect(() => {
    if (!phase) return
    const key = `${phase.phase}-${phase.round}`
    if (prevPhaseKey.current === key) return
    prevPhaseKey.current = key
    setSplash({ label: phase.label, key: Date.now() })
    const t = setTimeout(() => setSplash(null), 2100)
    return () => clearTimeout(t)
  }, [phase])

  return (
    <div ref={boxRef} className="flex h-full w-full items-center justify-center">
    <div className={`relative isolate overflow-hidden rounded-2xl border border-white/6 bg-ink-900 shadow-2xl ${gavelVisible ? 'animate-shake' : ''}`}
      style={{ width: fitW || '100%', aspectRatio: `${W}/${H}` }}>
      <RoomBackground decedentName={caseData?.decedent_name} />

      {/* agents layer */}
      {scale > 0 && (
        <div className="absolute inset-0">
          {executor && (
            <Agent agent={executor} pos={EXECUTOR_ANCHOR} scale={scale} size={112} status={statuses[executor.id] ?? 'idle'}
              reaction={reactions[executor.id]} petKind="cat" showPlate={false} index={0} />
          )}
          {debaters.map((a, i) => (
            <Agent key={a.id} agent={a} pos={posOf(a.id)} scale={scale} size={a.id === speakerId ? size * 1.1 : size}
              status={statuses[a.id] ?? 'idle'} reaction={reactions[a.id]} petKind={petKind(a)} showPlate index={i + 1} />
          ))}
        </div>
      )}

      <RoomForeground seats={seats} speakerActive={!!speakerId} />

      {/* vignette：轻微压暗四角，突出舞台中心 */}
      <div className="pointer-events-none absolute inset-0 z-[800]"
        style={{ background: 'radial-gradient(115% 95% at 50% 42%, transparent 58%, rgba(0,0,0,.38) 100%)' }} />

      {/* relation lines */}
      <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <defs>
          <marker id="arrow-attack" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
            <path d="M0 0 L10 5 L0 10 Z" fill="#f87171" />
          </marker>
          <marker id="arrow-ally" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
            <path d="M0 0 L10 5 L0 10 Z" fill="#34d399" />
          </marker>
        </defs>
        <AnimatePresence>
          {relations.map((r) => {
            const a = posOf(r.from)
            const b = posOf(r.to)
            const ay = a.y - 70
            const by = b.y - 70
            const mx = (a.x + b.x) / 2
            const my = Math.min(ay, by) - 90
            const color = r.kind === 'attack' ? '#f87171' : '#34d399'
            return (
              <motion.g key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
                <path d={`M${a.x} ${ay} Q${mx} ${my} ${b.x} ${by}`} fill="none" stroke={color} strokeWidth="6" opacity=".18" />
                <path d={`M${a.x} ${ay} Q${mx} ${my} ${b.x} ${by}`} fill="none" stroke={color} strokeWidth="2.5"
                  strokeDasharray={r.kind === 'attack' ? '10 8' : '0'} className={r.kind === 'attack' ? 'animate-dash' : ''}
                  markerEnd={`url(#arrow-${r.kind})`} />
                <g transform={`translate(${mx} ${(ay + by) / 2 - 45})`}>
                  <rect x="-26" y="-11" width="52" height="22" rx="11" fill="#0b0d12" stroke={color} strokeWidth="1.2" />
                  <text textAnchor="middle" y="4.5" fontSize="11" fill={color} fontWeight="700">
                    {r.kind === 'attack' ? '⚔ 攻击' : '🤝 结盟'}
                  </text>
                </g>
              </motion.g>
            )
          })}
        </AnimatePresence>
      </svg>

      {/* bubbles */}
      {scale > 0 && bubbleTurn && (() => {
        const agent = agents.find((a) => a.id === bubbleTurn.agent_id)
        if (!agent) return null
        const isExec = agent.kind === 'judge'
        const seat = seatOf.get(agent.id)
        const side: 'left' | 'right' = isExec ? 'right' : seat && seat.x > 600 ? 'left' : 'right'
        const anchor = isExec ? { x: 780, y: 96 } : side === 'right' ? { x: 690, y: 206 } : { x: 510, y: 206 }
        return (
          <SpeechBubble key={bubbleTurn.turn_id} agent={agent} text={bubbleTurn.text} live={!bubbleTurn.done}
            meta={bubbleTurn.meta} scale={scale} anchor={anchor} side={side} />
        )
      })()}

      {/* phase splash */}
      <AnimatePresence>
        {splash && (
          <motion.div key={splash.key} className="pointer-events-none absolute inset-0 z-[850] flex items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.45 } }}>
            <div className="absolute inset-0 bg-black/35" />
            <motion.div initial={{ scale: 0.86, y: 16 }} animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 240, damping: 22 }}
              className="relative flex items-center gap-4 rounded-2xl border border-gold-400/25 bg-black/60 px-8 py-4 shadow-[0_24px_80px_-24px_rgba(0,0,0,.9)] backdrop-blur-md">
              <span className="h-px w-12 bg-gradient-to-r from-transparent to-gold-400/80" />
              <span className="gold-text font-serif text-2xl font-black tracking-[0.3em]">{splash.label}</span>
              <span className="h-px w-12 bg-gradient-to-l from-transparent to-gold-400/80" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* stage status：左上直播 + 阶段，右上当前发言人 */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[810] flex items-start justify-between gap-2" style={{ fontSize: Math.max(10, 12 * scale) }}>
        <div className="flex items-center gap-2 rounded-full border border-white/8 bg-black/55 px-2.5 py-1 text-gold-300 backdrop-blur">
          <AnimatedPxlKitIcon icon={PulsingDot} size={12} appearance="tinted" color="#f87171" aria-label="直播中" />
          <span className="font-mono text-[0.8em] font-bold tracking-[0.18em] text-red-300">LIVE</span>
          <span className="h-3 w-px bg-white/15" />
          <span className="font-semibold">{phase?.label ?? '等待开庭'}</span>
        </div>
        <AnimatePresence mode="wait">
          {activeAgent && (
            <motion.div key={activeAgent.id + activeStatus} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="flex max-w-[52%] items-center gap-2 truncate rounded-full border bg-black/55 px-2.5 py-1 text-ink-200 backdrop-blur"
              style={{ borderColor: `${activeAgent.color}55` }}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: activeAgent.color, boxShadow: `0 0 8px ${activeAgent.color}` }} />
              <span className="truncate"><b style={{ color: activeAgent.color }}>{activeAgent.name}</b>{activeStatus === 'speaking' ? ' 正在发言' : ' 正在组织观点'}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ghost interjection */}
      <AnimatePresence>
        {recentGhost && (
          <motion.div key={recentGhost.ts} initial={{ opacity: 0, y: 20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30 }} className="absolute top-14 left-1/2 z-[860] max-w-[46%] -translate-x-1/2">
            <div className="animate-float rounded-2xl border border-violet-300/30 bg-violet-950/70 px-4 py-2 text-sm text-violet-100 shadow-[0_0_40px_rgba(167,139,250,.35)] backdrop-blur">
              <span className="mr-2 text-base">👻</span>
              <span className="text-violet-300/80">{caseData?.decedent_name} 的幽灵：</span>
              {recentGhost.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* gavel */}
      <AnimatePresence>
        {gavelVisible && (
          <motion.div key="gavel" className="pointer-events-none absolute inset-0 z-[880] flex items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="absolute inset-0 bg-gold-300" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.35, 0] }} transition={{ duration: 0.6, delay: 0.35 }} />
            <motion.svg viewBox="0 0 200 200" className="h-[46%] drop-shadow-[0_20px_40px_rgba(0,0,0,.6)]"
              initial={{ rotate: -70, y: -60, scale: 0.6 }} animate={{ rotate: [-70, 10, 0], y: [-60, 10, 0], scale: [0.6, 1.05, 1] }}
              transition={{ duration: 0.55, times: [0, 0.7, 1], ease: 'easeIn' }}>
              <rect x="94" y="80" width="12" height="100" rx="6" fill="#6b3f23" transform="rotate(-35 100 130)" />
              <rect x="50" y="40" width="100" height="44" rx="10" fill="#8a5a34" transform="rotate(-35 100 62)" />
              <rect x="50" y="40" width="100" height="10" rx="5" fill="#b8794a" transform="rotate(-35 100 62)" />
            </motion.svg>
            <motion.div className="absolute bottom-[18%] font-serif text-6xl font-black tracking-widest gold-text"
              initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1.2, 1, 1] }} transition={{ duration: 2.2, delay: 0.4 }}>
              咚！
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </div>
  )
}

/* ------------------------------------------------------------------ agent */
interface AgentProps {
  agent: AgentSpec
  pos: Pt
  scale: number
  size: number
  status: 'idle' | 'thinking' | 'speaking' | 'angry' | 'happy'
  reaction?: { emoji: string; ts: number }
  petKind: 'cat' | 'dog'
  showPlate: boolean
  /** 入场顺序：开庭时按此错峰落座 */
  index: number
}

function Agent({ agent, pos, scale, size, status, reaction, petKind, showPlate, index }: AgentProps) {
  const px = size * scale
  const x = pos.x * scale - px / 2
  const y = pos.y * scale - px * 1.25
  // 首次挂载时从上方落座；落座完成后后续走位不再带入场延迟
  const [seated, setSeated] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSeated(true), 400 + index * 90 + 700)
    return () => clearTimeout(t)
  }, [index])
  return (
    <motion.div className="absolute top-0 left-0" style={{ zIndex: Math.round(pos.y) }}
      initial={{ x, y: y - 56 * scale, width: px, opacity: 0 }}
      animate={{ x, y, width: px, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 120, damping: 18, mass: 0.9, delay: seated ? 0 : 0.4 + index * 0.09 }}>
      <div className="relative" style={{ width: px, height: px * 1.25 }}>
        {(status === 'speaking' || status === 'thinking') && (
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2" style={{ width: px * 0.8, height: px * 0.22 }}>
            <div className="animate-pulse-ring absolute inset-0 rounded-full border-2" style={{ borderColor: agent.color }} />
            <div className="absolute inset-0 rounded-full border" style={{ borderColor: agent.color, opacity: 0.6 }} />
          </div>
        )}
        <CharacterPortrait agent={agent} status={status} size={px} petKind={petKind} />
        <AnimatePresence>
          {reaction && (
            <motion.div key={reaction.ts} className="absolute -top-2 left-1/2 -translate-x-1/2 text-2xl animate-rise"
              style={{ fontSize: Math.max(18, px * 0.28) }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {reaction.emoji}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {showPlate && (
        <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center whitespace-nowrap"
          style={{ top: px * 1.25 + 4 * scale, fontSize: Math.max(10, 12.5 * scale) }}>
          <span className="rounded-md px-1.5 py-0.5 font-semibold text-ink-100" style={{ background: 'rgba(0,0,0,.55)', border: `1px solid ${agent.color}55` }}>
            {agent.name}
          </span>
          <span className="mt-0.5 rounded px-1 text-[0.85em]" style={{ color: agent.color, background: 'rgba(0,0,0,.4)' }}>
            {agent.personality_label}{agent.role}
            {agent.eligible ? ` · ${agent.legal_percent.toFixed(0)}%` : ''}
          </span>
        </div>
      )}
    </motion.div>
  )
}
