import { AnimatedPxlKitIcon, PxlKitIcon, type PxlKitData } from '@pxlkit/core'
import { Megaphone, MessageSquare, WarningTriangle } from '@pxlkit/feedback'
import { LootChest, Scroll, Star, Trophy } from '@pxlkit/gamification'
import { SparkBurst } from '@pxlkit/effects'
import { UserGroup } from '@pxlkit/social'
import { Robot } from '@pxlkit/ui'
import { PixelBadge, PixelButton, PixelSegmented, useMediaQuery, useToast } from '@pxlkit/ui-kit'
import { ArrowLeft, Check } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import ActiveTestimony from '../components/courtroom/ActiveTestimony'
import AgentRoster from '../components/courtroom/AgentRoster'
import CourtDrawer from '../components/courtroom/CourtDrawer'
import { selectStageTurn } from '../components/courtroom/viewModel'
import AllianceGraph from '../components/panels/AllianceGraph'
import CaseTimeline from '../components/panels/CaseTimeline'
import EvidenceDrawer from '../components/panels/EvidenceDrawer'
import EvidenceRail from '../components/panels/EvidenceRail'
import FamilyGraph from '../components/panels/FamilyGraph'
import LegalPanel from '../components/panels/LegalPanel'
import PredictionCard from '../components/panels/PredictionCard'
import TranscriptPanel from '../components/panels/TranscriptPanel'
import SeatBriefPanel from '../components/seat/SeatBriefPanel'
import SeatDock from '../components/seat/SeatDock'
import SeatToggle from '../components/seat/SeatToggle'
import { SpeechCardChips } from '../components/seat/SpeechCards'
import { applyCardToDraft, emptySeatDraft } from '../components/seat/draft'
import VerdictPanel from '../components/panels/VerdictPanel'
import CoinRain from '../components/scene/CoinRain'
import CourtroomScene from '../components/scene/CourtroomScene'
import SafeVoxelStage from '../components/scene3d/SafeVoxelStage'
import ActionBar from '../components/ui/ActionBar'
import CourtHud from '../components/ui/CourtHud'
import TopBar from '../components/ui/TopBar'
import { buildEvidence, type EvidenceCard } from '../lib/evidence'
import { SKILLS } from '../lib/skills'
import { sfx } from '../lib/sfx'
import { selectSave, useArena } from '../store/useArena'
import { useCourt } from '../store/useCourt'

type Tab = 'graph' | 'legal' | 'transcript' | 'verdict' | 'seat'
type CourtPanel = 'docket' | 'insights'
const TABS: { id: Tab; label: string; icon: PxlKitData }[] = [
  { id: 'transcript', label: '庭审记录', icon: MessageSquare },
  { id: 'graph', label: '关系图', icon: UserGroup },
  { id: 'legal', label: '法定份额', icon: Scroll },
  { id: 'verdict', label: '裁决', icon: Trophy },
]

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
/* 阶段配色沿用卷宗页四卷的口径：黄铜 / 玉绿 / 火漆 / 幽灵紫 */
const phaseAccent = (label: string) => {
  if (label.startsWith('辩论')) return '#ea6a5b'
  if (label === '陈述') return '#3fb27f'
  if (label === '协商') return '#a58bff'
  return '#e2b25a'
}

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
  const [draft, setDraft] = useState(emptySeatDraft)
  const [courtPanel, setCourtPanel] = useState<CourtPanel | null>(null)
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

  const jumpedDebrief = useRef(false)
  const jumpedAwait = useRef<string | null>(null)
  useEffect(() => {
    jumpedDebrief.current = false
    jumpedAwait.current = null
    setDraft(emptySeatDraft())
  }, [id])
  useEffect(() => {
    if (!s.seat || !s.debrief || jumpedDebrief.current) return
    jumpedDebrief.current = true
    setTab('seat')
  }, [s.debrief, s.seat])
  useEffect(() => {
    if (!s.seat || !s.awaiting) return
    if (jumpedAwait.current === s.awaiting.turn_key) return
    jumpedAwait.current = s.awaiting.turn_key
    setDraft(emptySeatDraft())
    setTab('seat')
  }, [s.awaiting, s.seat])

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
  const evidence = useMemo(
    () => (s.caseData ? buildEvidence(s.caseData, s.turns, s.agents, s.submittedEvidence) : []),
    [s.caseData, s.turns, s.agents, s.submittedEvidence],
  )
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
    setCourtPanel(null)
    setDrawer({ open: true, focusId, pick: false })
    markSeen(evidence.filter((c) => c.unlocked).map((c) => c.id))
  }
  const jumpToTurn = (tid: string) => {
    setHighlightTurnId(tid)
    setTab('transcript')
    setCourtPanel('insights')
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

  const tabs = useMemo((): { id: Tab; label: string; icon: PxlKitData }[] => {
    if (!s.seat) return TABS
    return [
      TABS[0],
      { id: 'seat', label: '入局', icon: Star },
      ...TABS.slice(1),
    ]
  }, [s.seat])
  const deceasedIds = useMemo(() => new Set(s.caseData?.members.filter((m) => m.deceased).map((m) => m.id) ?? []), [s.caseData])
  const debaters = s.agents.filter((a) => a.kind !== 'judge' && !deceasedIds.has(a.id))

  // 头部计时：庭审已进行
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const elapsed = s.startedAt ? mmss((s.done ? (s.verdictAt ?? now) : now) - s.startedAt) : '--:--'
  const stageTurn = selectStageTurn(s.turns, s.activeTurnId, now)
  const stageAgent = stageTurn ? s.agents.find((agent) => agent.id === stageTurn.agent_id) : undefined
  const stageStatus = stageAgent
    ? s.statuses[stageAgent.id] ?? (stageTurn && !stageTurn.done ? 'speaking' : 'idle')
    : 'idle'
  const stageTarget = stageTurn?.meta?.target
    ? s.agents.find((agent) => agent.id === stageTurn.meta?.target)?.name
    : undefined
  const openTranscript = () => {
    sfx('open')
    setTab('transcript')
    setCourtPanel('insights')
  }

  // 宽屏（与 xl 断点一致）：发言卡与出席名单移到舞台右侧，舞台按剩余高度铺满，不再两侧留白
  const wide = useMediaQuery('(min-width: 80rem)', true)

  const celebrating = !!s.verdict && !!s.done
  const [rainOn, setRainOn] = useState(false)
  useEffect(() => {
    if (!celebrating) return
    setRainOn(true)
    const t = setTimeout(() => setRainOn(false), 6000)
    return () => clearTimeout(t)
  }, [celebrating])

  const phaseIndex = Math.max(0, currentStep)
  const phaseLabel = steps[phaseIndex] ?? '开庭'
  const phaseTitle = s.phase?.label ?? (currentStep < 0 ? '等待开庭' : phaseLabel)
  const accent = phaseAccent(phaseLabel)
  const liveState = s.done ? 'done' : s.awaiting ? 'await' : s.paused ? 'paused' : s.connected ? 'live' : 'connecting'
  const liveChip: Record<typeof liveState, { cls: string; dot: string; text: string }> = {
    live: { cls: 'border-jade-700 bg-jade-700/20 text-jade-300', dot: 'bg-jade-300 shadow-[0_0_6px_#7fd9ad] animate-blink-step', text: '直播中' },
    await: { cls: 'border-gold-600 bg-gold-600/15 text-gold-300', dot: 'bg-gold-400 shadow-[0_0_6px_#e2b25a] animate-blink-step', text: '等你发言' },
    paused: { cls: 'border-gold-600 bg-gold-600/15 text-gold-300', dot: 'bg-gold-400', text: '休庭中' },
    done: { cls: 'text-ink-300', dot: 'bg-ink-400', text: '已闭庭' },
    connecting: { cls: 'text-ink-400', dot: 'bg-ink-300 animate-blink-step', text: '连接中' },
  }
  const live = liveChip[liveState]

  return (
    <div className="court-shell flex min-h-screen flex-col xl:h-screen xl:min-h-0 xl:overflow-hidden">
      {/* 顶栏与卷宗页同款：护墙板 + 法槌 logo；右侧换成庭审专属的计时 / 模式 / 直播状态 */}
      <TopBar
        className="sticky top-0 z-40 xl:static"
        leading={
          <Link to="/" className="btn-ghost h-9 shrink-0 px-2.5" title="回大厅换一个剧本">
            <ArrowLeft size={13} /> <span className="hidden sm:inline">大厅</span>
          </Link>
        }
        center={
          <span className="chip ml-3 max-w-[38vw] truncate text-ink-300">
            <span className="text-gold-400">庭审</span>
            {s.caseData
              ? <>{s.caseData.decedent_name}的遗产</>
              : <span className="text-ink-400">正在连接听证庭…</span>}
          </span>
        }
        trailing={
          <>
            <CourtHud
              className="hidden md:flex"
              elapsed={elapsed}
              estate={s.legal?.estate_total}
              roman={currentStep < 0 ? '·' : ROMAN[phaseIndex] ?? String(phaseIndex + 1)}
              phase={phaseTitle}
              accent={accent}
            />
            {s.caseData && (
              <span className={`chip hidden lg:inline-flex ${s.mode === 'llm' ? 'border-jade-700 bg-jade-700/20 text-jade-300' : 'border-gold-600 bg-gold-600/15 text-gold-300'}`} title={s.mode === 'llm' ? '角色由模型驱动' : '角色使用内置剧本发言'}>
                <PxlKitIcon icon={Robot} size={12} appearance="solid" color={s.mode === 'llm' ? '#7fd9ad' : '#f3d38a'} />
                <span className="max-w-[160px] truncate">{s.mode === 'llm' ? s.model : '剧本演示'}</span>
              </span>
            )}
            <span className={`chip ${live.cls}`} role="status">
              <span className={`h-2 w-2 ${live.dot}`} aria-hidden />
              <span className="hidden sm:inline">{live.text}</span>
            </span>
          </>
        }
      />

      {/* phase rail：与卷宗页的章节条同构——左侧当前幕，右侧步骤格与庭审操作 */}
      <nav className="shrink-0 border-b-2 border-ink-700 bg-ink-900/80" aria-label="庭审进程">
        <div className="mx-auto flex max-w-[1600px] min-[1920px]:max-w-[1900px] min-[2400px]:max-w-[2300px] items-center gap-3 px-3 py-2 sm:px-5">
          <div className="hidden min-w-0 items-center gap-3 sm:flex">
            <div className="pixel-text flex h-10 w-10 shrink-0 items-center justify-center border-2 text-[20px] shadow-[3px_3px_0_rgba(0,0,0,.55)]"
              style={{ borderColor: accent, background: `${accent}1f`, color: accent }}>
              {currentStep < 0 ? '·' : ROMAN[phaseIndex] ?? phaseIndex + 1}
            </div>
            <div className="min-w-0">
              <div className="eyebrow text-[11px]">
                <span className="h-2 w-2" style={{ background: accent }} aria-hidden />
                PHASE {currentStep < 0 ? '—' : `${phaseIndex + 1}/${steps.length}`}
                {s.phase?.round ? <span className="text-ink-400">· ROUND {s.phase.round}</span> : null}
              </div>
              <h2 className="pixel-text truncate text-[20px] leading-6 text-ink-100">{phaseTitle}</h2>
            </div>
          </div>

          <div className="no-scrollbar min-w-0 flex-1 overflow-x-auto sm:ml-auto sm:flex-none">
            <PhaseRail steps={steps} current={currentStep} />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className={`btn-ghost relative h-9 px-2.5 ${courtPanel === 'docket' ? 'border-gold-600 text-gold-300' : ''}`}
              onClick={() => { sfx('open'); setCourtPanel((panel) => panel === 'docket' ? null : 'docket') }}
              aria-haspopup="dialog"
              aria-expanded={courtPanel === 'docket'}
              aria-label={`案件卷宗${freshCount > 0 ? `，${freshCount} 条新证据` : ''}`}
              title="案件时间线与证据卷宗"
            >
              <PxlKitIcon icon={LootChest} size={14} /> <span className="hidden sm:inline">卷宗</span>
              {freshCount > 0 && (
                <span className="pixel-text absolute -top-2 -right-2 flex h-4 min-w-4 items-center justify-center border-2 border-ink-950 bg-seal-500 px-1 text-[10px] leading-3 text-white shadow-[1.5px_1.5px_0_rgba(0,0,0,.6)]">
                  {freshCount}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`btn-ghost relative h-9 px-2.5 ${courtPanel === 'insights' ? 'border-gold-600 text-gold-300' : ''}`}
              onClick={() => { sfx('open'); setCourtPanel((panel) => panel === 'insights' ? null : 'insights') }}
              aria-haspopup="dialog"
              aria-expanded={courtPanel === 'insights'}
              aria-label={s.awaiting ? '洞察，轮到你发言' : s.verdict ? '洞察，裁决已送达' : s.debrief ? '洞察，复盘已生成' : '洞察'}
              title="庭审记录、关系、份额与裁决"
            >
              <PxlKitIcon icon={Star} size={14} /> <span className="hidden sm:inline">洞察</span>
              {(s.awaiting || s.verdict || s.debrief) && (
                <span className="absolute -top-1 -right-1 h-2 w-2 border border-ink-950 bg-gold-400 shadow-[0_0_8px_#e2b25a]" aria-hidden />
              )}
            </button>
            {/* 暂停 / 续庭：后端 LangGraph interrupt 在下一节点生效，恢复后从 Checkpointer 继续 */}
            {s.seat && !s.done && <SeatToggle sessionId={id} />}
            {!s.done && s.connected && !s.awaiting && (
              <button
                type="button"
                className={`btn-ghost h-9 px-2.5 ${s.paused ? 'border-jade-700 bg-jade-700/20 text-jade-300 hover:border-jade-500' : ''}`}
                disabled={pausing}
                onClick={() => togglePause()}
                title={s.paused ? '从检查点继续庭审' : '在当前发言结束后暂停庭审'}>
                <span aria-hidden>{pausing ? '⋯' : s.paused ? '▶' : 'Ⅱ'}</span>
                <span className="hidden sm:inline">{s.paused ? '续庭' : '休庭'}</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="relative mx-auto flex min-h-0 w-full max-w-[1600px] min-[1920px]:max-w-[1900px] min-[2400px]:max-w-[2300px] flex-1 flex-col gap-3 px-3 py-3 sm:px-5">
        {/* 舞台优先：卷宗与洞察进入覆盖式抽屉，永远不再挤压表演区。
            窄屏纵向堆叠：舞台 → 发言 → 出席 → 操作条；
            宽屏两栏：左栏舞台 + 操作条，右栏发言卡 + 出席名单（与卷宗页"主内容 + 右侧栏"同构）。 */}
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,1fr)_340px] min-[1920px]:grid-cols-[minmax(0,1fr)_420px] min-[2400px]:grid-cols-[minmax(0,1fr)_480px] xl:grid-rows-[minmax(0,1fr)_auto]">
          {/* 闭庭撒币：覆盖舞台与横幅区，6 秒后自动收场 */}
          <AnimatePresence>
            {celebrating && rainOn && (
              <motion.div key="coin-rain" className="pointer-events-none absolute inset-0 z-30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.8 } }}>
                <CoinRain />
              </motion.div>
            )}
          </AnimatePresence>

          {/* stage：舞台自带木框，桌面端占满左栏剩余高度并按比例居中；宝箱与闭庭横幅挂在画框内。
              舞台绝对定位在这个格子里：格子的尺寸只由网格 / 视口决定，永远不会被舞台自身的内容尺寸反向撑大
              （否则矮屏下 1fr 行会被撑到溢出）。堆叠布局下格子按 1200:700 撑出高度。 */}
          <div className="relative aspect-[1200/700] min-h-0 min-w-0 xl:aspect-auto xl:col-start-1 xl:row-start-1">
            <div className="absolute inset-0">
            <CourtroomScene>
              {s.caseData && (
                <PixelButton type="button" variant="ghost" onClick={() => openChest()} title="证据宝箱 · 点开看全部证据卡牌"
                  className="group absolute bottom-3 left-3 z-[830] flex min-h-11 items-center gap-2 border-2 border-gold-600 bg-ink-950 px-2.5 py-1.5 shadow-[3px_3px_0_rgba(0,0,0,.6)] transition hover:-translate-x-px hover:-translate-y-px hover:border-gold-400 max-sm:top-11 max-sm:bottom-auto max-sm:min-h-9 max-sm:px-1.5 max-sm:py-1 sm:bottom-4 sm:left-4">
                  <span className={`block ${freshCount > 0 ? 'animate-bob' : ''}`}>
                    <PxlKitIcon icon={LootChest} size={26} aria-hidden />
                  </span>
                  <span className="text-left leading-tight max-sm:hidden">
                    <span className="pixel-text block text-[12px] text-gold-300">证据宝箱</span>
                    <span className="block font-mono text-[9px] text-ink-400">{evidence.filter((c) => c.unlocked).length}/{evidence.length} 已浮出</span>
                  </span>
                  {freshCount > 0 && (
                    <motion.span key={freshCount} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 16 }}
                      className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center border-2 border-ink-950 bg-seal-500 px-1 font-mono text-[10px] font-bold text-white shadow-[1.5px_1.5px_0_rgba(0,0,0,.6)]">
                      {freshCount}
                    </motion.span>
                  )}
                </PixelButton>
              )}
              <AnimatePresence>
                {celebrating && (
                  <motion.div
                    key="celebrate"
                    className="absolute right-3 bottom-3 z-[840] flex max-w-[calc(100%-6rem)] items-center gap-2 border-2 border-gold-600 bg-ink-950/92 px-2 py-1.5 shadow-[3px_3px_0_rgba(0,0,0,.65)] max-sm:top-11 max-sm:bottom-auto sm:right-4 sm:bottom-4 sm:max-w-[380px] sm:gap-3 sm:px-3 sm:py-2"
                    initial={{ opacity: 0, x: 12, scale: 0.96 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 12, scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 27 }}
                  >
                    <AnimatedPxlKitIcon icon={SparkBurst} size={24} appearance="palette" className="absolute -top-3 -left-3 opacity-60" aria-hidden />
                    <SafeVoxelStage
                      icon={Trophy}
                      size={58}
                      spin={0.6}
                      bob={0.08}
                      glow="rgba(233,190,111,.3)"
                      fallbackLabel="闭庭奖杯"
                    />
                    <div className="min-w-0 text-left">
                      <div className="gold-text pixel-text truncate text-[15px] tracking-[0.16em] sm:text-[17px]">COURT ADJOURNED</div>
                      <div className="mt-1 hidden text-[10px] leading-4 text-ink-400 sm:block">本庭已闭 · 最终裁决已送达洞察卷宗 · 显灵 {save.casts} 次</div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </CourtroomScene>
            </div>
          </div>

          {/* 右侧栏（宽屏）/ 舞台下方（窄屏）：当前发言 + 出席名单 */}
          <aside className="flex min-h-0 flex-col gap-3 xl:col-start-2 xl:row-span-2 xl:row-start-1">
            <ActiveTestimony
              turn={stageTurn}
              agent={stageAgent}
              status={stageStatus}
              phaseLabel={s.phase?.label}
              targetName={stageTarget}
              onOpenTranscript={openTranscript}
              layout={wide ? 'stacked' : 'wide'}
            />

            {/* roster：谁在发言谁亮；裁决前点卡片押"谁拿大头" */}
            <AgentRoster
              agents={debaters}
              statuses={s.statuses}
              turns={s.turns}
              betId={bet}
              bettingLocked={!!s.verdict}
              onBet={placeBet}
              orientation={wide ? 'vertical' : 'horizontal'}
            />
          </aside>

          {(s.seat || !s.done) && (
            <div className="xl:col-start-1 xl:row-start-2">
              {s.seat ? (
                <SeatDock
                  sessionId={id}
                  draft={draft}
                  onDraftChange={setDraft}
                  onOpenBrief={() => { setTab('seat'); setCourtPanel('insights') }}
                  cardsSlot={s.awaiting ? <SpeechCardChips cards={s.cards} onUse={(card) => setDraft((d) => applyCardToDraft(d, card))} /> : undefined}
                />
              ) : (
                <ActionBar sessionId={id} caseData={s.caseData} agents={s.agents} turns={s.turns} done={!!s.done}
                  onPickEvidence={() => { setCourtPanel(null); setDrawer({ open: true, pick: true }) }}
                  pickedEvidence={pickedEvidence} onPickedHandled={() => setPickedEvidence(null)} />
              )}
            </div>
          )}
        </section>
      </main>

      <CourtDrawer
        open={courtPanel === 'docket'}
        side="left"
        title="案件卷宗"
        badge={freshCount > 0 ? <PixelBadge tone="gold" size="sm" variant="solid">{freshCount} 条新证据</PixelBadge> : undefined}
        onClose={() => setCourtPanel(null)}
      >
        <div className="space-y-3">
          <section className="panel-elevated p-2.5">
            <RailTitle
              icon={<span aria-hidden>◷</span>}
              title="案件时间线"
              right={<span className="font-mono text-[10px] text-ink-400">{s.phaseHistory.length} 幕</span>}
            />
            <CaseTimeline
              phaseHistory={s.phaseHistory}
              relationLog={s.relationLog}
              ghosts={s.ghosts}
              notices={s.notices}
              evidence={s.submittedEvidence}
              gavelAt={s.gavelAt}
              verdictAt={s.verdictAt}
              agents={s.agents}
              decedent={s.caseData?.decedent_name ?? '逝者'}
            />
          </section>

          <section className="panel-elevated p-2.5">
            <RailTitle
              icon={<PxlKitIcon icon={LootChest} size={12} />}
              title="证据卡牌"
              right={<span className="font-mono text-[10px] text-ink-400">{evidence.filter((card) => card.unlocked).length}/{evidence.length}</span>}
            />
            {s.caseData ? (
              <>
                <EvidenceRail cards={evidence} seen={seen} onOpen={openChest} />
                <PixelButton type="button" tone="gold" fullWidth className="mt-3 min-h-11" onClick={() => openChest()}>
                  <PxlKitIcon icon={LootChest} size={15} /> 查看全部证据
                </PixelButton>
              </>
            ) : (
              <div className="py-8 text-center text-xs text-ink-400">卷宗送达后，证据会在这里归档。</div>
            )}
          </section>
        </div>
      </CourtDrawer>

      <CourtDrawer
        open={courtPanel === 'insights'}
        side="right"
        title="庭审洞察"
        badge={s.verdict ? <PixelBadge tone="gold" size="sm" variant="solid">裁决已送达</PixelBadge> : undefined}
        onClose={() => setCourtPanel(null)}
      >
        <div className="space-y-3">
          <div className={`chip w-fit border-ink-700 px-2.5 py-1 ${s.mode === 'llm' ? 'text-jade-300' : 'text-gold-300'}`}>
            <PxlKitIcon icon={Robot} size={12} appearance="solid" color={s.mode === 'llm' ? '#7fd9ad' : '#f3d38a'} />
            {s.mode === 'llm' ? s.model : '剧本演示'}
          </div>

          {s.caseData && s.legal && (
            <PredictionCard
              caseData={s.caseData}
              legal={s.legal}
              agents={s.agents}
              turns={s.turns}
              verdict={s.verdict}
              focusIssues={s.focusIssues}
              phase={s.phase}
            />
          )}

          <section className="panel-elevated overflow-hidden">
            <div className="flex border-b-2 border-ink-700 bg-ink-900 px-1 pt-1" role="tablist" aria-label="庭审洞察">
              {tabs.map((item) => {
                const on = tab === item.id
                return (
                  <PixelButton
                    key={item.id}
                    type="button"
                    variant="ghost"
                    role="tab"
                    onClick={() => setTab(item.id)}
                    aria-selected={on}
                    className={`relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 border-x border-t px-1 py-2 text-[10px] font-semibold transition sm:flex-row sm:text-xs ${on
                      ? 'border-ink-600 bg-ink-800 text-gold-300'
                      : 'border-transparent text-ink-400 hover:bg-ink-800/60 hover:text-ink-200'}`}
                  >
                    <PxlKitIcon icon={item.icon} size={14} appearance={on ? 'palette' : 'solid'} color="#a08d78" />
                    <span className="truncate">{item.label}</span>
                    {item.id === 'transcript' && s.turns.length > 0 && (
                      <span className="absolute top-0 right-0 border-b border-l border-ink-700 bg-ink-950 px-1 font-mono text-[8px] leading-4 text-ink-300">{s.turns.length}</span>
                    )}
                    {item.id === 'graph' && s.relationLog.length > 0 && !on && (
                      <span className="absolute top-0 right-0 border-b border-l border-ink-700 bg-ink-950 px-1 font-mono text-[8px] leading-4 text-ink-300">{s.relationLog.length}</span>
                    )}
                    {item.id === 'verdict' && s.verdict && !on && <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 bg-gold-400 shadow-[0_0_8px_#e9be6f]" />}
                    {item.id === 'seat' && s.debrief && !on && <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 bg-gold-400 shadow-[0_0_8px_#e9be6f]" />}
                    {on && <motion.span layoutId="insight-tab" className="absolute inset-x-1 bottom-0 h-0.5 bg-gold-400" />}
                  </PixelButton>
                )
              })}
            </div>

            <div className="p-3 sm:p-4">
              {!s.caseData || !s.legal ? (
                <div className="flex min-h-72 flex-col items-center justify-center text-center">
                  <div className="relative mb-4 flex h-12 w-12 items-center justify-center border-2 border-gold-600 bg-ink-950 shadow-[2px_2px_0_rgba(0,0,0,.55)]">
                    <PxlKitIcon icon={Scroll} size={22} />
                    <span className="absolute inset-0 animate-pulse-ring border-2 border-gold-400/40" />
                  </div>
                  <div className="pixel-text text-[14px] text-ink-200">正在传唤各位继承人</div>
                  <div className="mt-1 text-xs text-ink-400">执行官正在核对卷宗与法定份额…</div>
                </div>
              ) : (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={tab}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16 }}
                  >
                    {tab === 'graph' ? (
                      <div className="space-y-3">
                        <PixelSegmented
                          value={graphMode}
                          onChange={(value) => { setGraphMode(value as 'family' | 'camp'); sfx('move') }}
                          tone="gold"
                          aria-label="关系图模式"
                          options={[
                            { value: 'camp', label: `阵营网络 · ${s.relationLog.length} 次交锋` },
                            { value: 'family', label: '家谱 · 法定顺序' },
                          ]}
                        />
                        {graphMode === 'camp'
                          ? <AllianceGraph agents={s.agents} relationLog={s.relationLog} statuses={s.statuses} deceasedIds={deceasedIds} />
                          : <FamilyGraph caseData={s.caseData} legal={s.legal} agents={s.agents} />}
                      </div>
                    ) : tab === 'legal' ? (
                      <LegalPanel legal={s.legal} agents={s.agents} articleShort={s.articleShort} />
                    ) : tab === 'transcript' ? (
                      <TranscriptPanel
                        turns={s.turns}
                        agents={s.agents}
                        ghosts={s.ghosts}
                        decedent={s.caseData.decedent_name}
                        focusIssues={s.focusIssues}
                        highlightTurnId={highlightTurnId}
                      />
                    ) : tab === 'seat' ? (
                      <SeatBriefPanel onJumpToTurn={jumpToTurn} onUseCard={(card) => setDraft((current) => applyCardToDraft(current, card))} />
                    ) : (
                      <VerdictPanel
                        verdict={s.verdict}
                        caseData={s.caseData}
                        agents={s.agents}
                        articleShort={s.articleShort}
                        done={s.done}
                        sessionId={id}
                        onRestart={() => nav('/')}
                        turns={s.turns}
                        betId={bet}
                        onJumpToTurn={jumpToTurn}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
          </section>
        </div>
      </CourtDrawer>

      {s.caseData && (
        <EvidenceDrawer open={drawer.open} onOpenChange={(open) => setDrawer((d) => ({ ...d, open }))} cards={evidence} caseData={s.caseData}
          focusId={drawer.focusId} pickMode={s.seat ? false : drawer.pick} pickCost={SKILLS.find((k) => k.id === 'present')?.cost}
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

/* 庭审进程：与卷宗页章节按钮同款的方形步骤格；已过的幕打勾，当前幕亮底色并带下划线 */
function PhaseRail({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex min-w-max items-center gap-1.5 sm:gap-2" aria-label="庭审进程步骤">
      {steps.map((label, i) => {
        const active = i === current
        const done = i < current
        const accent = phaseAccent(label)
        return (
          <li key={label} className="flex items-center">
            <div
              aria-current={active ? 'step' : undefined}
              className={`relative flex shrink-0 items-center gap-2 border-2 px-2 py-1.5 transition ${active
                ? 'border-ink-400 bg-ink-800 shadow-[3px_3px_0_rgba(0,0,0,.55)]'
                : 'border-ink-700 bg-ink-950'}`}
            >
              <span
                className="pixel-text flex h-6 w-6 shrink-0 items-center justify-center border-2 text-[12px]"
                style={{
                  borderColor: active || done ? accent : 'var(--color-ink-600)',
                  background: active ? `${accent}26` : done ? `${accent}18` : 'transparent',
                  color: active || done ? accent : 'var(--color-ink-400)',
                }}
              >
                {done ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              <span
                className="pixel-text hidden text-[12px] leading-4 lg:block"
                style={{ color: active ? 'var(--color-ink-100)' : done ? 'var(--color-ink-200)' : 'var(--color-ink-400)' }}
              >
                {label}
              </span>
              {active && (
                <motion.span
                  layoutId="phase-underline"
                  className="absolute inset-x-2 -bottom-0.5 h-0.5"
                  style={{ background: accent }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
            </div>
            {i < steps.length - 1 && (
              <span className={`mx-0.5 h-0.5 w-2 sm:w-3 ${done ? 'bg-gold-600' : 'bg-ink-700'}`} aria-hidden />
            )}
          </li>
        )
      })}
    </ol>
  )
}
