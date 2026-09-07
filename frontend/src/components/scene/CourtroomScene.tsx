import { AnimatedPxlKitIcon } from '@pxlkit/core'
import { PulsingDot } from '@pxlkit/ui'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useCourt } from '../../store/useCourt'
import type { AgentSpec } from '../../types'
import { Gavel } from '../icons/pixel'
import CharacterPortrait from './CharacterPortrait'
import { EXECUTOR_ANCHOR, H, PODIUM_ANCHOR, W, seatPositions, spriteSize, type Pt } from './layout'
import PixelGlyph from './PixelGlyph'
import { RoomBackground, RoomForeground } from './Room'
import SpeechBubble from './SpeechBubble'

/* 与 index.css 里 panel-wood 的尺寸保持一致：6px 木框 + 6px 外圈描边 */
const FRAME_BORDER = 6
const FRAME_RING = 6

/**
 * 把二次贝塞尔曲线采样后吸附到 8px 网格，再只用横 / 竖段连起来：一条台阶状的像素折线。
 * 返回路径、终点与最后一段的朝向（用来摆轴对齐的箭头）。
 */
function pixelCurve(a: Pt, b: Pt, ctrl: Pt, step = 8) {
  const pts: Pt[] = []
  const N = 28
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const mt = 1 - t
    const x = Math.round((mt * mt * a.x + 2 * mt * t * ctrl.x + t * t * b.x) / step) * step
    const y = Math.round((mt * mt * a.y + 2 * mt * t * ctrl.y + t * t * b.y) / step) * step
    const last = pts[pts.length - 1]
    if (!last || last.x !== x || last.y !== y) pts.push({ x, y })
  }
  let d = `M${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[i - 1]
    if (p.x !== q.x) d += ` H${p.x}`
    if (p.y !== q.y) d += ` V${p.y}`
  }
  const end = pts[pts.length - 1]
  const prev = pts[pts.length - 2] ?? end
  const angle = end.y !== prev.y ? (end.y > prev.y ? 90 : 270) : end.x >= prev.x ? 0 : 180
  return { d, end, angle }
}

/* 聚光锥的两条斜边切成 6 级台阶，光也是像素的 */
const CONE_CLIP = (() => {
  const steps = 6
  const pts: string[] = []
  const lx = (t: number) => 43 - 31 * t
  const rx = (t: number) => 57 + 31 * t
  for (let i = 0; i < steps; i++) {
    const y = (i / steps) * 100
    pts.push(`${lx(i / steps)}% ${y}%`, `${lx((i + 1) / steps)}% ${y}%`)
  }
  pts.push(`${lx(1)}% 100%`, `${rx(1)}% 100%`)
  for (let i = steps; i > 0; i--) {
    const y = (i / steps) * 100
    pts.push(`${rx(i / steps)}% ${y}%`, `${rx((i - 1) / steps)}% ${y}%`)
  }
  pts.push(`${rx(0)}% 0%`)
  return `polygon(${pts.join(', ')})`
})()

function useSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    // 兜底：跨断点时网格重排，个别环境下 RO 通知会丢，窗口 resize 再量一次
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [ref])
  return size
}

/** children：挂在舞台画框内部的 HUD（证据宝箱、闭庭横幅等），随舞台一起居中缩放 */
export default function CourtroomScene({ children }: { children?: ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const box = useSize(boxRef)
  // 容器尺寸完全由页面布局给定（桌面端是网格剩余高度，堆叠布局是 1200:700 的比例盒），
  // 舞台取"宽 / 高"两个约束的较小者居中。木框外圈还有 RING 宽的描边与硬阴影，先留出来；
  // 人物坐标系以框内 padding box 为准。
  const outerW = box.h > 0 ? Math.min(box.w, (box.h - FRAME_RING * 2) * (W / H)) : box.w
  const fitW = Math.max(0, outerW - FRAME_RING * 2)
  const innerW = Math.max(0, fitW - FRAME_BORDER * 2)
  const scale = innerW > 0 ? innerW / W : 0
  // 舞台不到 ~660px 宽（手机 / 窄平板）：收起头顶碎语与连线标签，发言框改成贴底的 RPG 对话条
  const compact = scale > 0 && scale < 0.55

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

  // 每个座位上的人保留自己最后一句（30 秒内），像参考剧本杀里全场同时冒泡
  const whisperOf = useMemo(() => {
    const m = new Map<string, string>()
    for (let i = turns.length - 1; i >= 0; i--) {
      const t = turns[i]
      if (!t.done || m.has(t.agent_id) || now - t.ts > 30_000 || !t.text) continue
      m.set(t.agent_id, t.text)
    }
    return m
  }, [turns, now])

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
    <div className={`panel-wood relative isolate overflow-hidden bg-ink-900 ${gavelVisible ? 'animate-shake' : ''}`}
      style={innerW > 0
        ? { width: fitW, height: innerW * (H / W) + FRAME_BORDER * 2 }
        : { width: '100%', aspectRatio: `${W}/${H}` }}>
      <RoomBackground decedentName={caseData?.decedent_name} />

      {/* 辩席聚光：唯一的大幅舞台动效，始终指向当前发言人的落脚点；光锥斜边与亮度都是阶梯状。 */}
      <AnimatePresence>
        {speakerId && scale > 0 && (
          <motion.div
            key="speaker-cone"
            aria-hidden
            className="pointer-events-none absolute z-[4]"
            style={{
              left: (PODIUM_ANCHOR.x - 170) * scale,
              top: 28 * scale,
              width: 340 * scale,
              height: (PODIUM_ANCHOR.y + 52) * scale,
              clipPath: CONE_CLIP,
              background: 'linear-gradient(180deg, rgba(243,211,138,.22) 0 28%, rgba(243,211,138,.14) 28% 56%, rgba(243,211,138,.07) 56% 82%, rgba(243,211,138,.03) 82% 100%)',
              mixBlendMode: 'screen',
            }}
            initial={{ opacity: 0, scaleX: 0.82 }}
            animate={{ opacity: 1, scaleX: 1 }}
            exit={{ opacity: 0, scaleX: 0.9 }}
            transition={{ duration: 0.22, ease: (t) => Math.floor(t * 4) / 4 }}
          />
        )}
      </AnimatePresence>

      {/* agents layer */}
      {scale > 0 && (
        <div className="absolute inset-0">
          {executor && (
            <Agent agent={executor} pos={EXECUTOR_ANCHOR} scale={scale} size={112} status={statuses[executor.id] ?? 'idle'}
              reaction={reactions[executor.id]} petKind="cat" showPlate={false} index={0} compact={compact} />
          )}
          {debaters.map((a, i) => (
            <Agent key={a.id} agent={a} pos={posOf(a.id)} scale={scale} size={a.id === speakerId ? size * 1.1 : size}
              status={statuses[a.id] ?? 'idle'} reaction={reactions[a.id]} petKind={petKind(a)} showPlate index={i + 1} compact={compact}
              whisper={!compact && a.id !== speakerId && bubbleTurn?.agent_id !== a.id ? whisperOf.get(a.id) : undefined} />
          ))}
        </div>
      )}

      <RoomForeground seats={seats} speakerActive={!!speakerId} />

      {/* vignette：轻微压暗四角，突出舞台中心 */}
      <div className="pointer-events-none absolute inset-0 z-[800]"
        style={{ background: 'radial-gradient(115% 95% at 50% 42%, transparent 58%, rgba(0,0,0,.38) 100%)' }} />

      {/* relation lines */}
      <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" shapeRendering="crispEdges">
        <AnimatePresence>
          {relations.map((r) => {
            const a = posOf(r.from)
            const b = posOf(r.to)
            const ay = a.y - 70
            const by = b.y - 70
            const mx = (a.x + b.x) / 2
            const my = Math.min(ay, by) - 90
            const color = r.kind === 'attack' ? '#ea6a5b' : '#7fd9ad'
            const line = pixelCurve({ x: a.x, y: ay }, { x: b.x, y: by }, { x: mx, y: my })
            return (
              <motion.g key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: (t) => Math.floor(t * 4) / 4 }}>
                {/* 台阶折线：底下一条粗的半透明光晕，上面一条实线；攻击线是流动的虚线 */}
                <path d={line.d} fill="none" stroke={color} strokeWidth="12" opacity=".16" strokeLinejoin="miter" />
                <path d={line.d} fill="none" stroke="#17120f" strokeWidth="6" strokeLinejoin="miter" opacity=".8" />
                <path d={line.d} fill="none" stroke={color} strokeWidth="4" strokeLinejoin="miter"
                  strokeDasharray={r.kind === 'attack' ? '12 12' : undefined} className={r.kind === 'attack' ? 'animate-dash' : ''} />
                {/* 轴对齐的像素箭头：三级台阶三角形，只做 90° 旋转 */}
                <g transform={`translate(${line.end.x} ${line.end.y}) rotate(${line.angle})`}>
                  <rect x="-14" y="-10" width="4" height="20" fill="#17120f" />
                  <rect x="-10" y="-6" width="4" height="12" fill="#17120f" />
                  <rect x="-6" y="-2" width="8" height="4" fill="#17120f" />
                  <rect x="-12" y="-8" width="4" height="16" fill={color} />
                  <rect x="-8" y="-4" width="4" height="8" fill={color} />
                  <rect x="-4" y="-2" width="4" height="4" fill={color} />
                </g>
                {/* 像素标签：方角 + 右下硬阴影；窄舞台上只留线和箭头 */}
                {!compact && <g transform={`translate(${mx} ${(ay + by) / 2 - 45})`}>
                  <rect x="-24" y="-9" width="52" height="22" fill="rgba(0,0,0,.65)" />
                  <rect x="-26" y="-11" width="52" height="22" fill="#17120f" stroke={color} strokeWidth="2" />
                  <text textAnchor="middle" y="4.5" fontSize="11" fill={color} fontWeight="700" style={{ fontFamily: 'var(--font-pixel)' }}>
                    {r.kind === 'attack' ? '⚔ 攻击' : '🤝 结盟'}
                  </text>
                </g>}
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
            meta={bubbleTurn.meta} scale={scale} anchor={anchor} side={side} compact={compact} />
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
              className="panel-wood relative flex items-center gap-4 bg-ink-950/92 px-8 py-4">
              <span className="flex items-center gap-1" aria-hidden>
                <span className="h-1 w-3 bg-gold-600" /><span className="h-1 w-3 bg-gold-400" /><span className="h-2 w-2 bg-gold-300" />
              </span>
              <span className="gold-text pixel-text text-[26px] tracking-[0.3em]" style={{ filter: 'drop-shadow(3px 3px 0 rgba(0,0,0,.7))' }}>{splash.label}</span>
              <span className="flex items-center gap-1" aria-hidden>
                <span className="h-2 w-2 bg-gold-300" /><span className="h-1 w-3 bg-gold-400" /><span className="h-1 w-3 bg-gold-600" />
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* stage status：左上直播 + 阶段，右上当前发言人 */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[810] flex items-start justify-between gap-2" style={{ fontSize: Math.max(10, 12 * scale) }}>
        <div className="flex items-center gap-2 border-2 border-ink-600 bg-ink-950/85 px-2.5 py-1 text-gold-300 shadow-[2px_2px_0_rgba(0,0,0,.55)]">
          <AnimatedPxlKitIcon icon={PulsingDot} size={12} appearance="tinted" color="#ea6a5b" aria-label="直播中" />
          <span className="pixel-text text-[0.9em] tracking-[0.18em] text-seal-400">LIVE</span>
          <span className="h-3 w-0.5 bg-ink-600" />
          <span className="pixel-text">{phase?.label ?? '等待开庭'}</span>
        </div>
        <AnimatePresence mode="wait">
          {activeAgent && (
            <motion.div key={activeAgent.id + activeStatus} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="flex max-w-[52%] items-center gap-2 truncate border-2 bg-ink-950/85 px-2.5 py-1 text-ink-200 shadow-[2px_2px_0_rgba(0,0,0,.55)]"
              style={{ borderColor: activeAgent.color }}>
              <span className={`h-2 w-2 shrink-0 ${activeStatus === 'speaking' ? 'animate-blink-step' : ''}`} style={{ background: activeAgent.color }} />
              <span className="truncate"><b style={{ color: activeAgent.color }}>{activeAgent.name}</b>{activeStatus === 'speaking' ? ' 正在发言' : ' 正在组织观点'}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ghost interjection */}
      <AnimatePresence>
        {recentGhost && (
          <motion.div key={recentGhost.ts} initial={{ opacity: 0, y: 20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30 }} className={`absolute top-14 left-1/2 z-[860] -translate-x-1/2 ${compact ? 'max-w-[86%]' : 'max-w-[46%]'}`}>
            <div className="animate-float relative border-2 border-ghost-400 bg-ink-950/92 px-4 py-2 text-sm text-ghost-300 shadow-[3px_3px_0_rgba(0,0,0,.6),0_0_32px_rgba(165,139,255,.3)]"
              style={{ boxShadow: 'inset 0 0 0 2px #17120f, inset 0 0 0 3px rgba(165,139,255,.35), 3px 3px 0 rgba(0,0,0,.6), 0 0 32px rgba(165,139,255,.3)' }}>
              <span className="pixel-text absolute -top-3 left-3 border-2 border-ghost-400 bg-ink-800 px-1.5 text-[11px] leading-4 text-ghost-300 shadow-[2px_2px_0_rgba(0,0,0,.6)]">
                👻 {caseData?.decedent_name} 的幽灵
              </span>
              <span className="text-ink-100">{recentGhost.text}</span>
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
            {/* 法槌用同一张 16×16 像素图放大 10 倍落下，和顶栏 logo、大厅图腾是同一把 */}
            <motion.svg viewBox="0 0 200 200" className="h-[46%]" style={{ filter: 'drop-shadow(8px 8px 0 rgba(0,0,0,.55))' }}
              initial={{ rotate: -70, y: -60, scale: 0.6 }} animate={{ rotate: [-70, 10, 0], y: [-60, 10, 0], scale: [0.6, 1.05, 1] }}
              transition={{ duration: 0.55, times: [0, 0.7, 1], ease: (t) => Math.floor(t * 6) / 6 }}>
              <PixelGlyph icon={Gavel} x={20} y={20} cell={10} />
            </motion.svg>
            {/* 落槌冲击波：一圈方形像素粒子向外弹开 */}
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <motion.span key={deg} className="absolute left-1/2 top-1/2 h-3 w-3 bg-gold-300" aria-hidden
                initial={{ x: -6, y: -6, opacity: 0 }}
                animate={{
                  x: [-6, -6 + Math.cos((deg * Math.PI) / 180) * 140],
                  y: [-6, -6 + Math.sin((deg * Math.PI) / 180) * 90],
                  opacity: [0, 1, 0],
                }}
                transition={{ duration: 0.6, delay: 0.4, ease: (t) => Math.floor(t * 5) / 5 }} />
            ))}
            <motion.div className="pixel-text gold-text absolute bottom-[18%] text-[64px] tracking-widest"
              style={{ filter: 'drop-shadow(4px 4px 0 rgba(0,0,0,.75))' }}
              initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1.2, 1, 1] }}
              transition={{ duration: 2.2, delay: 0.4, ease: (t) => Math.floor(t * 8) / 8 }}>
              咚！
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {children}
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
  /** 这个人最近说的一句，头顶小气泡 */
  whisper?: string
  /** 窄舞台：名牌只留名字 */
  compact?: boolean
}

function Agent({ agent, pos, scale, size, status, reaction, petKind, showPlate, index, whisper, compact }: AgentProps) {
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
        {status === 'speaking' && (
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2" style={{ width: px * 0.8, height: px * 0.22 }}>
            <div className="animate-pulse-ring absolute inset-0 border-2" style={{ borderColor: agent.color }} />
            <div className="absolute inset-0 border-2" style={{ borderColor: agent.color, opacity: 0.6, boxShadow: `inset 0 0 0 2px #17120f` }} />
          </div>
        )}
        {status === 'thinking' && (
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 border-2 border-dashed"
            style={{ width: px * 0.68, height: px * 0.18, borderColor: `${agent.color}99` }}
            aria-hidden
          />
        )}
        <CharacterPortrait agent={agent} status={status} size={px} petKind={petKind} />
        <AnimatePresence>
          {whisper && !reaction && (
            <motion.div key={whisper} initial={{ opacity: 0, y: 6, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
              className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap"
              style={{ fontSize: Math.max(10, 11 * scale) }}>
              <span className="relative block border-2 bg-ink-950/90 px-2 py-0.5 text-ink-100 shadow-[2px_2px_0_rgba(0,0,0,.6)]" style={{ borderColor: `${agent.color}99` }}>
                {whisper.length > 16 ? `${whisper.slice(0, 16)}…` : whisper}
                <span className="absolute -bottom-[7px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-r-2 border-b-2 bg-ink-950/90" style={{ borderColor: `${agent.color}99` }} />
              </span>
            </motion.div>
          )}
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
          <span className="pixel-text border-2 px-1.5 py-0 leading-[1.5] text-ink-100 shadow-[2px_2px_0_rgba(0,0,0,.6)]" style={{ background: 'rgba(23,18,15,.92)', borderColor: agent.color }}>
            {agent.name}
          </span>
          {!compact && (
            <span className="pixel-text -mt-0.5 border-2 border-t-0 px-1 text-[0.85em] leading-[1.5]" style={{ color: agent.color, background: 'rgba(23,18,15,.85)', borderColor: `${agent.color}88` }}>
              {agent.personality_label}{agent.role}
              {agent.eligible ? ` · ${agent.legal_percent.toFixed(0)}%` : ''}
            </span>
          )}
        </div>
      )}
    </motion.div>
  )
}
