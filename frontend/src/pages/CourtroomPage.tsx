import { AnimatedPxlKitIcon, ParallaxPxlKitIcon, PxlKitIcon, type PxlKitData } from '@pxlkit/core'
import { Megaphone, MessageSquare, Send, WarningTriangle } from '@pxlkit/feedback'
import { Scroll, Trophy } from '@pxlkit/gamification'
import { SparkBurst } from '@pxlkit/effects'
import { GhostFriend } from '@pxlkit/parallax'
import { UserGroup } from '@pxlkit/social'
import { ArrowRight, PulsingDot, Robot } from '@pxlkit/ui'
import { useToast } from '@pxlkit/ui-kit'
import { AnimatePresence, motion } from 'motion/react'
import { Pause, Play, Target } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import FamilyGraph from '../components/panels/FamilyGraph'
import LegalPanel from '../components/panels/LegalPanel'
import TranscriptPanel from '../components/panels/TranscriptPanel'
import VerdictPanel from '../components/panels/VerdictPanel'
import CharacterPortrait from '../components/scene/CharacterPortrait'
import CoinRain from '../components/scene/CoinRain'
import CourtroomScene from '../components/scene/CourtroomScene'
import DramaMeter from '../components/ui/DramaMeter'
import { sfx } from '../lib/sfx'
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

/* 幽灵快捷语录：一点就上膛的"显灵"台词 */
const GHOST_QUIPS = [
  '我尸骨未寒，你们就吵成这样？',
  '谁床前尽孝最多，谁就该多分。',
  '别忘了照顾好那只猫！',
  '都别争了，和和气气地平分吧。',
]

export default function CourtroomPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const s = useCourt()
  const [tab, setTab] = useState<Tab>('transcript')
  const [ghostText, setGhostText] = useState('')
  const [sending, setSending] = useState(false)
  const [pausing, setPausing] = useState(false)
  const [highlightTurnId, setHighlightTurnId] = useState<string | null>(null)
  const { toast } = useToast()

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

  const sendGhost = async () => {
    const text = ghostText.trim()
    if (!text || sending) return
    setSending(true)
    try {
      await api.interject(id, text)
      setGhostText('')
    } catch (e) {
      toast.error({ title: '幽灵没能显灵', message: (e as Error).message, icon: <PxlKitIcon icon={WarningTriangle} size={16} /> })
    } finally {
      setSending(false)
    }
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

  const debaters = s.agents.filter((a) => a.kind !== 'judge' && !s.caseData?.members.find((m) => m.id === a.id)?.deceased)

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

      <main className="mx-auto grid w-full max-w-[1920px] flex-1 gap-3 p-3 sm:p-4 xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
        <section className="relative flex min-w-0 flex-col gap-3 xl:min-h-0">
          {/* 闭庭撒币：覆盖舞台与横幅区，6 秒后自动收场 */}
          <AnimatePresence>
            {celebrating && rainOn && (
              <motion.div key="coin-rain" className="pointer-events-none absolute inset-0 z-30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.8 } }}>
                <CoinRain />
              </motion.div>
            )}
          </AnimatePresence>

          {/* stage：桌面端占满剩余高度，舞台按高度自适应 */}
          <div className="panel-elevated flex min-h-0 flex-1 p-2 sm:p-2.5">
            <CourtroomScene />
          </div>

          {/* 裁决庆祝：终局后出现闭庭横幅，SparkBurst 撒金 */}
          <AnimatePresence>
            {celebrating && (
              <motion.div key="celebrate" className="panel-elevated relative flex h-44 shrink-0 items-center justify-center overflow-hidden"
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 14 }}
                transition={{ type: 'spring', stiffness: 220, damping: 26 }}>
                <div className="pointer-events-none absolute inset-0"
                  style={{ background: 'radial-gradient(60% 120% at 50% 50%, rgba(233,190,111,.14), transparent 70%)' }} />
                {/* 背景撒金点缀 */}
                <AnimatedPxlKitIcon icon={SparkBurst} size={40} appearance="palette" className="absolute top-1/2 left-8 -translate-y-1/2 opacity-40" aria-hidden />
                <AnimatedPxlKitIcon icon={SparkBurst} size={40} appearance="palette" className="absolute top-1/2 right-8 -translate-y-1/2 opacity-40" aria-hidden />
                <div className="relative flex items-center gap-4">
                  <Suspense fallback={<div className="h-28 w-28 animate-pulse rounded-2xl border border-gold-500/15 bg-gold-500/5" />}>
                    <VoxelStage icon={Trophy} size={112} spin={0.6} bob={0.08} glow="rgba(233,190,111,.3)" />
                  </Suspense>
                  <div className="text-left">
                    <div className="gold-text font-serif text-2xl font-black tracking-[0.28em]">COURT ADJOURNED</div>
                    <div className="mt-1.5 text-xs text-ink-400">本庭已闭 · 体素奖杯已铸成 · 最终裁决送达右侧卷宗</div>
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

          {/* ghost line */}
          <div className="panel-elevated flex shrink-0 flex-col gap-1.5 p-2 sm:p-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-400/8 shadow-[0_0_24px_rgba(167,139,250,.08)]">
                <ParallaxPxlKitIcon icon={GhostFriend} size={24} strength={12} interactive appearance="palette" aria-label="逝者的幽灵" />
              </div>
              <div className="hidden shrink-0 pr-1 lg:block">
                <div className="text-[10px] font-semibold tracking-widest text-violet-300">GHOST LINE</div>
                <div className="text-[10px] text-ink-400">以逝者身份影响下一位发言人</div>
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/7 bg-black/30 p-1 pl-3 transition focus-within:border-violet-400/30 focus-within:shadow-[0_0_0_3px_rgba(167,139,250,.06)]">
                <input className="min-w-0 flex-1 bg-transparent text-sm text-ink-100 outline-none placeholder:text-ink-400"
                  placeholder={s.done ? '听证会已结束，幽灵也该安息了。' : `以 ${s.caseData?.decedent_name ?? '逝者'} 的幽灵身份插一句话…`}
                  value={ghostText} disabled={!!s.done} onChange={(e) => setGhostText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendGhost()} maxLength={200} />
                <span className="hidden font-mono text-[9px] text-ink-400 sm:inline">{ghostText.length}/200</span>
                <button className="btn-gold shrink-0 px-3 py-1.5 text-xs" disabled={!ghostText.trim() || sending || !!s.done} onClick={sendGhost}>
                  <PxlKitIcon icon={Send} size={13} appearance="solid" color="#1b1205" /> {sending ? '传递中' : '显灵'}
                </button>
              </div>
            </div>
            {/* 快捷语录：懒得打字时一键显灵 */}
            {!s.done && (
              <div className="no-scrollbar hidden items-center gap-1.5 overflow-x-auto pl-11 lg:flex">
                {GHOST_QUIPS.map((q) => (
                  <button key={q} type="button" onClick={() => { setGhostText(q); sfx('move') }}
                    className="shrink-0 rounded-full border border-violet-400/15 bg-violet-400/5 px-2 py-0.5 text-[10px] text-violet-200/80 transition hover:border-violet-400/35 hover:text-violet-100">
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="panel-elevated flex min-h-[540px] flex-col overflow-hidden xl:min-h-0 xl:h-full">
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
                    <FamilyGraph caseData={s.caseData} legal={s.legal} agents={s.agents} />
                  ) : tab === 'legal' ? (
                    <LegalPanel legal={s.legal} agents={s.agents} articleShort={s.articleShort} />
                  ) : tab === 'transcript' ? (
                    <TranscriptPanel turns={s.turns} agents={s.agents} ghosts={s.ghosts} decedent={s.caseData.decedent_name}
                      focusIssues={s.focusIssues} highlightTurnId={highlightTurnId} />
                  ) : (
                    <VerdictPanel verdict={s.verdict} caseData={s.caseData} agents={s.agents} articleShort={s.articleShort} done={s.done}
                      sessionId={id} onRestart={() => nav('/')} turns={s.turns} betId={bet}
                      onJumpToTurn={(tid) => { setHighlightTurnId(tid); setTab('transcript'); setTimeout(() => setHighlightTurnId(null), 4000) }} />
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </aside>
      </main>
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
