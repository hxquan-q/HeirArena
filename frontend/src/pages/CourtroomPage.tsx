import { AnimatedPxlKitIcon, PxlKitIcon, type PxlKitData } from '@pxlkit/core'
import { Megaphone, MessageSquare, WarningTriangle } from '@pxlkit/feedback'
import { LootChest, Scroll, Star, Trophy } from '@pxlkit/gamification'
import { SparkBurst } from '@pxlkit/effects'
import { UserGroup } from '@pxlkit/social'
import { ArrowRight, PulsingDot, Robot } from '@pxlkit/ui'
import { PixelBadge, PixelButton, PixelSegmented, useToast } from '@pxlkit/ui-kit'
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
          <Link to="/" className="btn-ghost min-h-11 min-w-11 shrink-0 px-2.5 sm:px-3">
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
              <span className="text-gold-400" aria-hidden>◷</span> {elapsed}
            </span>
            <PixelButton
              type="button"
              variant="ghost"
              className={`chip relative min-h-11 min-w-11 px-2.5 py-1 transition hover:border-gold-600 hover:text-gold-300 ${courtPanel === 'docket' ? 'border-gold-600 text-gold-300' : 'text-ink-300'}`}
              onClick={() => { sfx('open'); setCourtPanel((panel) => panel === 'docket' ? null : 'docket') }}
              aria-haspopup="dialog"
              aria-expanded={courtPanel === 'docket'}
              aria-label={`案件卷宗${freshCount > 0 ? `，${freshCount} 条新证据` : ''}`}
              title="案件时间线与证据卷宗"
            >
              <PxlKitIcon icon={LootChest} size={13} /> <span className="hidden sm:inline">卷宗</span>
              {freshCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center border border-ink-950 bg-seal-500 px-0.5 font-mono text-[9px] text-white">
                  {freshCount}
                </span>
              )}
            </PixelButton>
            <PixelButton
              type="button"
              variant="ghost"
              className={`chip relative min-h-11 min-w-11 px-2.5 py-1 transition hover:border-gold-600 hover:text-gold-300 ${courtPanel === 'insights' ? 'border-gold-600 text-gold-300' : 'text-ink-300'}`}
              onClick={() => { sfx('open'); setCourtPanel((panel) => panel === 'insights' ? null : 'insights') }}
              aria-haspopup="dialog"
              aria-expanded={courtPanel === 'insights'}
              aria-label={s.awaiting ? '洞察，轮到你发言' : s.verdict ? '洞察，裁决已送达' : s.debrief ? '洞察，复盘已生成' : '洞察'}
              title="庭审记录、关系、份额与裁决"
            >
              <PxlKitIcon icon={Star} size={13} /> <span className="hidden sm:inline">洞察</span>
              {(s.awaiting || s.verdict || s.debrief) && (
                <span className="absolute top-1 right-1 h-1.5 w-1.5 bg-gold-300 shadow-[0_0_8px_#e2b25a]" aria-hidden />
              )}
            </PixelButton>
            {/* 暂停 / 续庭：后端 LangGraph interrupt 在下一节点生效，恢复后从 Checkpointer 继续 */}
            {s.seat && !s.done && <SeatToggle sessionId={id} />}
            {!s.done && s.connected && !s.awaiting && (
              <PixelButton
                type="button"
                variant="ghost"
                className={`chip min-h-11 min-w-11 px-2.5 py-1 transition ${s.paused ? 'border-emerald-400/25 bg-emerald-400/8 text-emerald-300 hover:bg-emerald-400/14' : 'text-ink-300 hover:border-white/15 hover:text-ink-100'}`}
                disabled={pausing}
                onClick={() => togglePause()}
                title={s.paused ? '从检查点继续庭审' : '在当前发言结束后暂停庭审'}>
                <span aria-hidden>{pausing ? '⋯' : s.paused ? '▶' : 'Ⅱ'}</span>
                <span className="hidden sm:inline">{s.paused ? '续庭' : '休庭'}</span>
              </PixelButton>
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
              <span className="hidden sm:inline">{s.done ? '已闭庭' : s.awaiting ? '等你发言' : s.paused ? '休庭' : s.connected ? '直播中' : '连接中'}</span>
            </span>
          </div>
        </div>
        <div className="no-scrollbar overflow-x-auto border-t border-white/5 px-3 py-2 xl:hidden">
          <PhaseRail steps={steps} current={currentStep} compact />
        </div>
      </header>

      <main className="relative mx-auto flex min-h-0 w-full max-w-[1680px] flex-1 flex-col gap-3 p-3 sm:p-4">
        {/* 舞台优先：卷宗与洞察进入覆盖式抽屉，永远不再挤压表演区。 */}
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {/* 闭庭撒币：覆盖舞台与横幅区，6 秒后自动收场 */}
          <AnimatePresence>
            {celebrating && rainOn && (
              <motion.div key="coin-rain" className="pointer-events-none absolute inset-0 z-30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.8 } }}>
                <CoinRain />
              </motion.div>
            )}
          </AnimatePresence>

          {/* stage：桌面端占满剩余高度，舞台按高度自适应；左下角是证据宝箱 */}
          <div className="panel-elevated relative flex flex-none p-2 sm:p-2.5 xl:min-h-0 xl:flex-1">
            <CourtroomScene />
            {s.caseData && (
              <PixelButton type="button" variant="ghost" onClick={() => openChest()} title="证据宝箱 · 点开看全部证据卡牌"
                className="group absolute bottom-4 left-4 z-10 flex min-h-11 items-center gap-2 border-2 border-gold-600 bg-ink-950/85 px-2.5 py-1.5 shadow-[3px_3px_0_rgba(0,0,0,.6)] backdrop-blur transition hover:-translate-x-px hover:-translate-y-px hover:border-gold-400">
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
              </PixelButton>
            )}
            <AnimatePresence>
              {celebrating && (
                <motion.div
                  key="celebrate"
                  className="absolute right-3 bottom-3 z-20 flex max-w-[calc(100%-6rem)] items-center gap-2 border-2 border-gold-600 bg-ink-950/92 px-2 py-1.5 shadow-[3px_3px_0_rgba(0,0,0,.65)] sm:right-4 sm:bottom-4 sm:max-w-[380px] sm:gap-3 sm:px-3 sm:py-2"
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
          </div>

          <ActiveTestimony
            turn={stageTurn}
            agent={stageAgent}
            status={stageStatus}
            phaseLabel={s.phase?.label}
            targetName={stageTarget}
            onOpenTranscript={openTranscript}
          />

          {/* roster：一条窄带，谁在发言谁亮；裁决前点卡片押"谁拿大头" */}
          <AgentRoster
            agents={debaters}
            statuses={s.statuses}
            turns={s.turns}
            betId={bet}
            bettingLocked={!!s.verdict}
            onBet={placeBet}
          />

          {s.seat ? (
            <SeatDock
              sessionId={id}
              draft={draft}
              onDraftChange={setDraft}
              onOpenBrief={() => { setTab('seat'); setCourtPanel('insights') }}
              cardsSlot={s.awaiting ? <SpeechCardChips cards={s.cards} onUse={(card) => setDraft((d) => applyCardToDraft(d, card))} /> : undefined}
            />
          ) : !s.done ? (
            <ActionBar sessionId={id} caseData={s.caseData} agents={s.agents} turns={s.turns} done={!!s.done}
              onPickEvidence={() => { setCourtPanel(null); setDrawer({ open: true, pick: true }) }}
              pickedEvidence={pickedEvidence} onPickedHandled={() => setPickedEvidence(null)} />
          ) : null}
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
                  <div className="relative mb-4 flex h-12 w-12 items-center justify-center border-2 border-gold-500/20 bg-gold-500/8">
                    <PxlKitIcon icon={Scroll} size={22} />
                    <span className="absolute inset-0 animate-ping border border-gold-400/15" />
                  </div>
                  <div className="text-sm font-semibold text-ink-200">正在传唤各位继承人</div>
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
