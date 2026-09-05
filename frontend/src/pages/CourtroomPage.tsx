import { AnimatedPxlKitIcon, PxlKitIcon, type PxlKitData } from '@pxlkit/core'
import { Megaphone, MessageSquare, WarningTriangle } from '@pxlkit/feedback'
import { LootChest, Scroll, Star, Trophy } from '@pxlkit/gamification'
import { SparkBurst } from '@pxlkit/effects'
import { UserGroup } from '@pxlkit/social'
import { ArrowRight, PulsingDot, Robot } from '@pxlkit/ui'
import { PixelBadge, PixelSegmented, useToast } from '@pxlkit/ui-kit'
import { AnimatePresence, motion } from 'motion/react'
import { BookOpen, Clock3, Pause, Play, Target } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import AllianceGraph from '../components/panels/AllianceGraph'
import CaseTimeline from '../components/panels/CaseTimeline'
import EvidenceDrawer from '../components/panels/EvidenceDrawer'
import EvidenceRail from '../components/panels/EvidenceRail'
import FamilyGraph from '../components/panels/FamilyGraph'
import LegalPanel from '../components/panels/LegalPanel'
import PredictionCard from '../components/panels/PredictionCard'
import TranscriptPanel from '../components/panels/TranscriptPanel'
import VerdictPanel from '../components/panels/VerdictPanel'
import CharacterPortrait from '../components/scene/CharacterPortrait'
import CoinRain from '../components/scene/CoinRain'
import CourtroomScene from '../components/scene/CourtroomScene'
import ActionBar from '../components/ui/ActionBar'
import DramaMeter from '../components/ui/DramaMeter'
import { buildEvidence, type EvidenceCard } from '../lib/evidence'
import { SKILLS } from '../lib/skills'
import { sfx } from '../lib/sfx'
import { selectSave, useArena } from '../store/useArena'
import { useCourt } from '../store/useCourt'

const VoxelStage = lazy(() => import('../components/scene3d/VoxelStage'))

type Tab = 'graph' | 'legal' | 'transcript' | 'verdict'
const TABS: { id: Tab; label: string; icon: PxlKitData }[] = [
  { id: 'transcript', label: '庭审记录', icon: MessageSquare },
  { id: 'graph', label: '关系图', icon: UserGroup },
  { id: 'legal', label: '法定份额', icon: Scroll },
  { id: 'verdict', label: '裁决', icon: Trophy },
]

const STATUS_TEXT: Record<string, string> = { idle: '待命', thinking: '思考中', speaking: '发言中', angry: '生气', happy: '开心' }
const STATUS_DOT: Record<string, string> = { idle: '#6d7588', angry: '#f87171', happy: '#34d399' }

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function CourtroomPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const s = useCourt()
  const [tab, setTab] = useState<Tab>('transcript')
  const [graphMode, setGraphMode] = useState<'family' | 'camp'>('camp')
  const [pausing, setPausing] = useState(false)
  const [highlightTurnId, setHighlightTurnId] = useState<string | null>(null)
  const { toast } = useToast()

  /* 幽灵玩家的存档：显灵能量 / 看过的证据 */
  const bindArena = useArena((st) => st.bind)
  const regen = useArena((st) => st.regen)
  const markSeen = useArena((st) => st.markSeen)
  const save = useArena(selectSave)
  useEffect(() => { bindArena(id) }, [id, bindArena])
  useEffect(() => {
    if (s.phase) regen(`${s.phase.phase}-${s.phase.round}`)
  }, [s.phase, regen])

  /* 竞猜：裁决前押"谁拿大头"，按场次存 localStorage，闭庭后揭晓 */
  const betKey = `heirarena-bet-${id}`
  const [bet, setBet] = useState<string | null>(() => {
    try { return localStorage.getItem(betKey) } catch { return null }
  })
  const placeBet = (agentId: string) => {
    if (s.verdict) return
    const next = bet === agentId ? null : agentId
    setBet(next)
    sfx(next ? 'coin' : 'back')
    try {
      if (next) localStorage.setItem(betKey, next)
      else localStorage.removeItem(betKey)
    } catch { /* 隐私模式就算了 */ }
  }

  useEffect(() => {
    const close = s.connect(id)
    return close
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (!s.verdict) return
    setTab('verdict')
    if (bet) {
      const heirs = Object.keys(s.verdict.targets)
      const top = heirs.reduce((b, x) => ((s.verdict!.value_shares[x] ?? 0) > (s.verdict!.value_shares[b] ?? 0) ? x : b), heirs[0])
      const name = (x: string) => s.agents.find((a) => a.id === x)?.name ?? x
      if (top && bet === top) {
        toast({ title: '神机妙算', message: `你押的 ${name(bet)} 真的拿了大头！`, tone: 'gold', icon: <PxlKitIcon icon={Trophy} size={16} />, duration: 8000 })
      } else if (top) {
        toast({ title: '竞猜揭晓', message: `你押了 ${name(bet)}，拿大头的是 ${name(top)}`, tone: 'neutral', duration: 8000 })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.verdict])

  // 服务端推送的庭审公告 → 像素 toast；只推送尚未展示过的
  const shownNotice = useRef(0)
  useEffect(() => {
    const fresh = s.notices.slice(shownNotice.current)
    shownNotice.current = s.notices.length
    for (const n of fresh) {
      toast({ title: '法庭公告', message: n.text, tone: 'gold', icon: <PxlKitIcon icon={Megaphone} size={16} />, duration: 6000 })
    }
  }, [s.notices, toast])

  useEffect(() => {
    if (s.error) toast.error({ title: '连接中断', message: s.error, icon: <PxlKitIcon icon={WarningTriangle} size={16} />, duration: 0 })
  }, [s.error, toast])

  /* 证据卡牌：从卷宗 + 发言推导；新证言出现时提示 */
  const evidence = useMemo(() => (s.caseData ? buildEvidence(s.caseData, s.turns, s.agents) : []), [s.caseData, s.turns, s.agents])
  const seen = useMemo(() => new Set(save.seenEvidence), [save.seenEvidence])
  const freshCount = evidence.filter((c) => c.unlocked && c.kind !== 'fact' && !seen.has(c.id)).length
  const knownTestimony = useRef<Set<string> | null>(null)
  useEffect(() => {
    const ids = evidence.filter((c) => c.kind === 'testimony').map((c) => c.id)
    if (knownTestimony.current === null) {
      // 首次（含刷新重连）不弹，避免回放时刷屏
      if (s.turns.some((t) => t.done)) knownTestimony.current = new Set(ids)
      return
    }
    for (const c of evidence) {
      if (c.kind !== 'testimony' || knownTestimony.current.has(c.id)) continue
      knownTestimony.current.add(c.id)
      sfx('coin')
      toast({ title: '发现新证据', message: c.title, tone: 'green', icon: <PxlKitIcon icon={Star} size={16} />, duration: 6000 })
    }
  }, [evidence, s.turns, toast])

  const [drawer, setDrawer] = useState<{ open: boolean; focusId?: string; pick: boolean }>({ open: false, pick: false })
  const [pickedEvidence, setPickedEvidence] = useState<EvidenceCard | null>(null)
  const openChest = (focusId?: string) => {
    sfx('open')
    setDrawer({ open: true, focusId, pick: false })
    markSeen(evidence.filter((c) => c.unlocked).map((c) => c.id))
  }
  const jumpToTurn = (tid: string) => {
    setHighlightTurnId(tid)
    setTab('transcript')
    setTimeout(() => setHighlightTurnId(null), 4000)
  }

  const togglePause = async () => {
    if (pausing) return
    setPausing(true)
    try {
      if (s.paused) {
        await api.resume(id)
        s.setPaused(false)
        toast({ title: '继续开庭', message: '已从检查点恢复庭审', tone: 'gold' })
      } else {
        await api.pause(id)
        s.setPaused(true)
        toast({ title: '宣布休庭', message: '当前发言结束后暂停，可随时回来续庭', tone: 'gold' })
      }
    } catch (e) {
      toast.error({ title: s.paused ? '续庭失败' : '休庭失败', message: (e as Error).message, icon: <PxlKitIcon icon={WarningTriangle} size={16} /> })
    } finally {
      setPausing(false)
    }
  }

  const rounds = s.caseData?.rounds ?? 2
  const steps = ['开庭', '陈述', ...Array.from({ length: rounds }, (_, i) => `辩论 ${i + 1}`), '协商', '裁决']
  const currentStep = (() => {
    const p = s.phase
    if (!p) return -1
    if (p.phase === 'opening') return 0
    if (p.phase === 'statements') return 1
    if (p.phase === 'debate') return 1 + p.round
    if (p.phase === 'negotiation') return 2 + rounds
    return 3 + rounds
  })()

  const deceasedIds = useMemo(() => new Set(s.caseData?.members.filter((m) => m.deceased).map((m) => m.id) ?? []), [s.caseData])
  const debaters = s.agents.filter((a) => a.kind !== 'judge' && !deceasedIds.has(a.id))

  // 头部计时：庭审已进行
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (s.done) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [s.done])
  const elapsed = s.startedAt ? mmss((s.done ? (s.verdictAt ?? now) : now) - s.startedAt) : '--:--'

  const celebrating = !!s.verdict && !!s.done
  const [rainOn, setRainOn] = useState(false)
  useEffect(() => {
    if (!celebrating) return
    setRainOn(true)
    const t = setTimeout(() => setRainOn(false), 6000)
    return () => clearTimeout(t)
  }, [celebrating])

  return (
    <div className="court-shell flex min-h-screen flex-col xl:h-screen xl:min-h-0 xl:overflow-hidden">
      <header className="sticky top-0 z-50 shrink-0 border-b border-white/7 bg-ink-950/84 shadow-[0_14px_50px_-34px_rgba(0,0,0,.9)] backdrop-blur-2xl xl:static">
        <div className="mx-auto flex h-16 max-w-[1920px] items-center gap-3 px-3 sm:gap-4 sm:px-5">
          <Link to="/" className="btn-ghost h-9 shrink-0 px-2.5 sm:px-3">
            <PxlKitIcon icon={ArrowRight} size={14} appearance="solid" color="#ced3dd" style={{ transform: 'scaleX(-1)' }} aria-label="返回" />
            <span className="hidden sm:inline">新案件</span>
          </Link>
          <div className="h-7 w-px bg-white/8" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="pixel-text text-[14px] tracking-[0.12em] text-gold-300 sm:text-[16px]">HEIR ARENA</div>
              <span className="hidden rounded-full border border-gold-500/20 bg-gold-500/8 px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-widest text-gold-400 sm:inline">LIVE COURT</span>
            </div>
            <div className="max-w-[36vw] truncate text-[11px] text-ink-400 sm:max-w-md">
              {s.caseData ? `${s.caseData.decedent_name}的遗产听证会 · 净额 ${s.legal?.estate_total ?? '—'} 万元` : '正在连接听证庭…'}
            </div>
          </div>

          <div className="mx-auto hidden min-w-0 flex-1 justify-center xl:flex">
            <PhaseRail steps={steps} current={currentStep} />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2 text-xs">
            <span className="chip hidden px-2.5 py-1 font-mono text-ink-300 md:inline-flex" title="庭审已进行">
              <Clock3 size={12} className="text-gold-400" /> {elapsed}
            </span>
            <button type="button" className="chip px-2.5 py-1 text-ink-300 transition hover:border-gold-600 hover:text-gold-300" onClick={() => openChest()} title="卷宗 · 证据宝箱">
              <BookOpen size={12} /> <span className="hidden sm:inline">卷宗</span>
            </button>
            <span className={`chip hidden border-white/8 px-2.5 py-1 lg:inline-flex ${s.mode === 'llm' ? 'text-emerald-300' : 'text-gold-300'}`}>
              <PxlKitIcon icon={Robot} size={12} appearance="solid" color={s.mode === 'llm' ? '#6ee7b7' : '#f8dda4'} />
              {s.mode === 'llm' ? s.model : '剧本演示'}
            </span>
            {/* 暂停 / 续庭：后端 LangGraph interrupt 在下一节点生效，恢复后从 Checkpointer 继续 */}
            {!s.done && s.connected && (
              <button
                className={`chip px-2.5 py-1 transition ${s.paused ? 'border-emerald-400/25 bg-emerald-400/8 text-emerald-300 hover:bg-emerald-400/14' : 'text-ink-300 hover:border-white/15 hover:text-ink-100'}`}
                disabled={pausing}
                onClick={() => togglePause()}
                title={s.paused ? '从检查点继续庭审' : '在当前发言结束后暂停庭审'}>
                {pausing ? '⋯' : s.paused ? <Play size={12} /> : <Pause size={12} />}
                <span className="hidden sm:inline">{s.paused ? '续庭' : '休庭'}</span>
              </button>
            )}
            {s.paused && !s.done && (
              <span className="chip border-amber-400/25 bg-amber-400/8 px-2 py-1 text-amber-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" /> 休庭中
              </span>
            )}
            <span className={`chip px-2.5 py-1 ${s.connected ? 'border-emerald-400/20 bg-emerald-400/5 text-emerald-300' : 'text-ink-400'}`}>
              {s.connected && !s.done
                ? <AnimatedPxlKitIcon icon={PulsingDot} size={12} appearance="tinted" color="#34d399" aria-label="直播中" />
                : <span className={`h-1.5 w-1.5 rounded-full ${s.done ? 'bg-ink-400' : 'bg-amber-400'}`} />}
              <span className="hidden sm:inline">{s.done ? '已闭庭' : s.paused ? '休庭' : s.connected ? '直播中' : '连接中'}</span>
            </span>
          </div>
        </div>
        <div className="no-scrollbar overflow-x-auto border-t border-white/5 px-3 py-2 xl:hidden">
          <PhaseRail steps={steps} current={currentStep} compact />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1920px] flex-1 gap-3 p-3 sm:p-4 xl:min-h-0 xl:grid-cols-[236px_minmax(0,1fr)_400px] 2xl:grid-cols-[264px_minmax(0,1fr)_440px]">
        {/* 左栏：案件时间线 + 证据卡牌 */}
        <aside className="order-3 flex min-h-[460px] flex-col gap-3 xl:order-none xl:min-h-0">
          <div className="panel-elevated flex max-h-[44%] min-h-[150px] flex-col p-2.5">
            <RailTitle icon={<Clock3 size={12} />} title="案件时间线" right={<span className="font-mono text-[10px] text-ink-400">{s.phaseHistory.length} 幕</span>} />
            <CaseTimeline phaseHistory={s.phaseHistory} relationLog={s.relationLog} ghosts={s.ghosts} notices={s.notices}
              gavelAt={s.gavelAt} verdictAt={s.verdictAt} agents={s.agents} decedent={s.caseData?.decedent_name ?? '逝者'} />
          </div>
          <div className="panel-elevated flex min-h-0 flex-1 flex-col p-2.5">
            <RailTitle icon={<PxlKitIcon icon={LootChest} size={12} />} title="证据卡牌"
              right={freshCount > 0 ? <PixelBadge tone="gold" size="sm" variant="solid">{freshCount} 新</PixelBadge> : undefined} />
            {s.caseData ? (
              <EvidenceRail cards={evidence} seen={seen} onOpen={openChest} />
            ) : (
              <div className="py-6 text-center text-[11px] text-ink-400">等卷宗送达…</div>
            )}
          </div>
        </aside>

        {/* 中栏：舞台 + 名单 + 显灵行动栏 */}
        <section className="relative order-1 flex min-w-0 flex-col gap-3 xl:order-none xl:min-h-0">
          {/* 闭庭撒币：覆盖舞台与横幅区，6 秒后自动收场 */}
          <AnimatePresence>
            {celebrating && rainOn && (
              <motion.div key="coin-rain" className="pointer-events-none absolute inset-0 z-30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.8 } }}>
                <CoinRain />
              </motion.div>
            )}
          </AnimatePresence>

          {/* stage：桌面端占满剩余高度，舞台按高度自适应；左下角是证据宝箱 */}
          <div className="panel-elevated relative flex min-h-0 flex-1 p-2 sm:p-2.5">
            <CourtroomScene />
            {s.caseData && (
              <button type="button" onClick={() => openChest()} title="证据宝箱 · 点开看全部证据卡牌"
                className="group absolute bottom-4 left-4 z-10 flex items-center gap-2 border-2 border-gold-600 bg-ink-950/85 px-2.5 py-1.5 shadow-[3px_3px_0_rgba(0,0,0,.6)] backdrop-blur transition hover:-translate-x-px hover:-translate-y-px hover:border-gold-400">
                <span className={`block ${freshCount > 0 ? 'animate-bob' : ''}`}>
                  <PxlKitIcon icon={LootChest} size={26} aria-hidden />
                </span>
                <span className="text-left leading-tight">
                  <span className="pixel-text block text-[12px] text-gold-300">证据宝箱</span>
                  <span className="block font-mono text-[9px] text-ink-400">{evidence.filter((c) => c.unlocked).length}/{evidence.length} 已浮出</span>
                </span>
                {freshCount > 0 && (
                  <motion.span key={freshCount} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 16 }}
                    className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center border-2 border-ink-950 bg-seal-500 px-1 font-mono text-[10px] font-bold text-white shadow-[1.5px_1.5px_0_rgba(0,0,0,.6)]">
                    {freshCount}
                  </motion.span>
                )}
              </button>
            )}
          </div>

          {/* 裁决庆祝：终局后出现闭庭横幅，SparkBurst 撒金 */}
          <AnimatePresence>
            {celebrating && (
              <motion.div key="celebrate" className="panel-elevated relative flex h-36 shrink-0 items-center justify-center overflow-hidden"
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 14 }}
                transition={{ type: 'spring', stiffness: 220, damping: 26 }}>
                <div className="pointer-events-none absolute inset-0"
                  style={{ background: 'radial-gradient(60% 120% at 50% 50%, rgba(233,190,111,.14), transparent 70%)' }} />
                <AnimatedPxlKitIcon icon={SparkBurst} size={40} appearance="palette" className="absolute top-1/2 left-8 -translate-y-1/2 opacity-40" aria-hidden />
                <AnimatedPxlKitIcon icon={SparkBurst} size={40} appearance="palette" className="absolute top-1/2 right-8 -translate-y-1/2 opacity-40" aria-hidden />
                <div className="relative flex items-center gap-4">
                  <Suspense fallback={<div className="h-24 w-24 animate-pulse border border-gold-500/15 bg-gold-500/5" />}>
                    <VoxelStage icon={Trophy} size={96} spin={0.6} bob={0.08} glow="rgba(233,190,111,.3)" />
                  </Suspense>
                  <div className="text-left">
                    <div className="gold-text font-serif text-2xl font-black tracking-[0.28em]">COURT ADJOURNED</div>
                    <div className="mt-1.5 text-xs text-ink-400">本庭已闭 · 体素奖杯已铸成 · 最终裁决送达右侧卷宗 · 显灵 {save.casts} 次</div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* roster：一条窄带，谁在发言谁亮；裁决前点卡片押"谁拿大头" */}
          <div className="panel-elevated shrink-0 px-2.5 py-2 sm:px-3">
            <div className="no-scrollbar flex items-stretch gap-2 overflow-x-auto">
              <div className="flex shrink-0 flex-col justify-center pr-2 text-[10px] leading-tight text-ink-400">
                <span className="flex items-center gap-1.5 font-semibold text-ink-200"><PxlKitIcon icon={UserGroup} size={12} /> 出席</span>
                <span className="font-mono">{debaters.length} 席</span>
                {!s.verdict && (
                  <span className={`mt-0.5 flex items-center gap-1 ${bet ? 'text-gold-300' : ''}`}>
                    <Target size={9} /> {bet ? `已押 ${s.agents.find((a) => a.id === bet)?.name ?? ''}` : '点卡片押注'}
                  </span>
                )}
              </div>
              {debaters.map((a) => {
                const st = s.statuses[a.id] ?? 'idle'
                const active = st !== 'idle'
                const betOn = bet === a.id
                return (
                  <motion.div key={a.id} layout
                    role="button" tabIndex={0}
                    onClick={() => placeBet(a.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); placeBet(a.id) } }}
                    className={`relative flex min-w-[152px] cursor-pointer items-center gap-2 overflow-hidden rounded-xl border px-2 py-1.5 ${active ? 'bg-white/[.045]' : 'border-white/6 bg-black/18'}`}
                    animate={{
                      borderColor: betOn ? '#e2b25a' : active ? `${a.color}66` : 'rgba(255,255,255,0.06)',
                      boxShadow: betOn ? 'inset 0 0 24px rgba(226,178,90,.14)' : active ? `inset 0 0 24px ${a.color}12` : 'inset 0 0 0 rgba(0,0,0,0)',
                    }}
                    transition={{ duration: 0.25 }}
                    title={s.verdict ? (a.llm ? `模型：${a.model_label}` : '剧本模式') : `押 ${a.name} 拿大头（再点取消）`}>
                    <div className="flex h-9 w-8 shrink-0 items-end justify-center overflow-hidden rounded-lg border border-white/7 bg-black/20">
                      <CharacterPortrait agent={a} status={st} size={28} petKind={/狗|犬|汪/.test(a.name) ? 'dog' : 'cat'} animated={false} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-bold" style={{ color: a.color }}>{a.name}</span>
                        {a.llm && <PxlKitIcon icon={Robot} size={10} appearance="solid" color="#7dd3fc" aria-label="模型驱动" />}
                      </div>
                      <div className="truncate text-[10px] text-ink-400">{a.personality_label} · {a.role}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-ink-300">
                        <span className={`h-1.5 w-1.5 rounded-full ${st === 'speaking' ? 'animate-pulse' : ''}`}
                          style={{ background: STATUS_DOT[st] ?? a.color, boxShadow: active ? `0 0 7px ${a.color}` : undefined }} />
                        {STATUS_TEXT[st]}
                      </div>
                    </div>
                    {betOn && (
                      <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 16 }}
                        className="pixel-text absolute top-1 right-1 flex items-center gap-0.5 border border-gold-600 bg-gold-500/90 px-1 text-[9px] leading-3.5 text-ink-950 shadow-[1.5px_1.5px_0_rgba(0,0,0,.6)]">
                        <Target size={8} strokeWidth={3} /> 押
                      </motion.span>
                    )}
                    {st === 'speaking' && <motion.div layoutId="speaking-bar" className="absolute inset-x-3 bottom-0 h-px" style={{ background: a.color }} />}
                  </motion.div>
                )
              })}
              <DramaMeter turns={s.turns} />
            </div>
          </div>

          {/* 显灵行动栏：玩家是逝者的幽灵 */}
          <ActionBar sessionId={id} caseData={s.caseData} agents={s.agents} turns={s.turns} done={!!s.done}
            onPickEvidence={() => setDrawer({ open: true, pick: true })}
            pickedEvidence={pickedEvidence} onPickedHandled={() => setPickedEvidence(null)} />
        </section>

        {/* 右栏：终局预测 + 卷宗页签 */}
        <aside className="panel-elevated order-2 flex min-h-[560px] flex-col overflow-hidden xl:order-none xl:min-h-0 xl:h-full">
          {s.caseData && s.legal && (
            <PredictionCard caseData={s.caseData} legal={s.legal} agents={s.agents} turns={s.turns} verdict={s.verdict}
              focusIssues={s.focusIssues} phase={s.phase} />
          )}
          <div className="flex border-b border-white/7 bg-black/10 px-1 pt-1">
            {TABS.map((t) => {
              const on = tab === t.id
              return (
                <button key={t.id} onClick={() => setTab(t.id)} aria-selected={on}
                  className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-t-lg px-1 py-2.5 text-[10px] font-semibold transition sm:flex-row sm:text-xs ${on ? 'bg-white/[.025] text-gold-300' : 'text-ink-400 hover:bg-white/[.018] hover:text-ink-200'}`}>
                  <PxlKitIcon icon={t.icon} size={14} appearance={on ? 'palette' : 'solid'} color="#6d7588" />
                  <span className="truncate">{t.label}</span>
                  {t.id === 'transcript' && s.turns.length > 0 && (
                    <span className="absolute top-1 right-1.5 rounded-full bg-white/8 px-1 font-mono text-[8px] leading-4 text-ink-300">{s.turns.length}</span>
                  )}
                  {t.id === 'graph' && s.relationLog.length > 0 && !on && (
                    <span className="absolute top-1 right-1.5 rounded-full bg-white/8 px-1 font-mono text-[8px] leading-4 text-ink-300">{s.relationLog.length}</span>
                  )}
                  {t.id === 'verdict' && s.verdict && !on && <span className="absolute top-2 right-[18%] h-1.5 w-1.5 rounded-full bg-gold-400 shadow-[0_0_8px_#e9be6f]" />}
                  {on && <motion.span layoutId="tab" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-gold-400 shadow-[0_0_10px_rgba(233,190,111,.55)]" />}
                </button>
              )
            })}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            {!s.caseData || !s.legal ? (
              <div className="flex h-full min-h-80 flex-col items-center justify-center text-center">
                <div className="relative mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-gold-500/20 bg-gold-500/8">
                  <PxlKitIcon icon={Scroll} size={22} />
                  <span className="absolute inset-0 animate-ping rounded-2xl border border-gold-400/15" />
                </div>
                <div className="text-sm font-semibold text-ink-200">正在传唤各位继承人</div>
                <div className="mt-1 text-xs text-ink-400">执行官正在核对卷宗与法定份额…</div>
              </div>
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={tab} className="h-full" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16 }}>
                  {tab === 'graph' ? (
                    <div className="space-y-3">
                      <PixelSegmented value={graphMode} onChange={(v) => { setGraphMode(v as 'family' | 'camp'); sfx('move') }} tone="gold" aria-label="关系图模式"
                        options={[{ value: 'camp', label: `阵营网络 · ${s.relationLog.length} 次交锋` }, { value: 'family', label: '家谱 · 法定顺序' }]} />
                      {graphMode === 'camp'
                        ? <AllianceGraph agents={s.agents} relationLog={s.relationLog} statuses={s.statuses} deceasedIds={deceasedIds} />
                        : <FamilyGraph caseData={s.caseData} legal={s.legal} agents={s.agents} />}
                    </div>
                  ) : tab === 'legal' ? (
                    <LegalPanel legal={s.legal} agents={s.agents} articleShort={s.articleShort} />
                  ) : tab === 'transcript' ? (
                    <TranscriptPanel turns={s.turns} agents={s.agents} ghosts={s.ghosts} decedent={s.caseData.decedent_name}
                      focusIssues={s.focusIssues} highlightTurnId={highlightTurnId} />
                  ) : (
                    <VerdictPanel verdict={s.verdict} caseData={s.caseData} agents={s.agents} articleShort={s.articleShort} done={s.done}
                      sessionId={id} onRestart={() => nav('/')} turns={s.turns} betId={bet} onJumpToTurn={jumpToTurn} />
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </aside>
      </main>

      {s.caseData && (
        <EvidenceDrawer open={drawer.open} onOpenChange={(open) => setDrawer((d) => ({ ...d, open }))} cards={evidence} caseData={s.caseData}
          focusId={drawer.focusId} pickMode={drawer.pick} pickCost={SKILLS.find((k) => k.id === 'present')?.cost}
          onPick={(card) => { setDrawer({ open: false, pick: false }); setPickedEvidence(card) }} onJumpToTurn={jumpToTurn} />
      )}
    </div>
  )
}

function RailTitle({ icon, title, right }: { icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex shrink-0 items-center justify-between border-b-2 border-ink-700 pb-1.5">
      <span className="pixel-text flex items-center gap-1.5 text-[12px] text-gold-300">{icon} {title}</span>
      {right}
    </div>
  )
}

function PhaseRail({ steps, current, compact = false }: { steps: string[]; current: number; compact?: boolean }) {
  return (
    <ol className={`flex items-center ${compact ? 'min-w-max justify-center' : 'justify-center'}`}>
      {steps.map((label, i) => {
        const active = i === current
        const done = i < current
        return (
          <li key={label} className="flex items-center">
            <div aria-current={active ? 'step' : undefined}
              className={`relative flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold transition-colors sm:px-2.5 sm:text-[11px] ${active
                ? 'text-ink-950'
                : done ? 'text-ink-200' : 'text-ink-400'}`}>
              {active && (
                <motion.span layoutId={compact ? 'phase-pill-compact' : 'phase-pill'} className="absolute inset-0 -z-10 rounded-full bg-gold-500 shadow-[0_0_18px_rgba(214,162,78,.34)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
              )}
              <span className={`flex h-4 w-4 items-center justify-center rounded-full border font-mono text-[8px] ${active
                ? 'border-ink-950/20 bg-ink-950/10'
                : done ? 'border-gold-500/30 bg-gold-500/10 text-gold-300' : 'border-white/8'}`}>
                {i + 1}
              </span>
              {label}
            </div>
            {i < steps.length - 1 && (
              <span className={`mx-0.5 h-px w-3 transition-colors sm:mx-1 sm:w-5 ${done ? 'bg-gold-500/50' : 'bg-white/8'}`} />
            )}
          </li>
        )
      })}
    </ol>
  )
}
