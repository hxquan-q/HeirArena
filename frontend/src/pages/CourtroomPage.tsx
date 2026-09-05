import { ArrowLeft, Ghost, MessageSquareText, Network, Radio, Scale, Send, Sparkles, Trophy, Users, Wifi, WifiOff, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import FamilyGraph from '../components/panels/FamilyGraph'
import LegalPanel from '../components/panels/LegalPanel'
import TranscriptPanel from '../components/panels/TranscriptPanel'
import VerdictPanel from '../components/panels/VerdictPanel'
import CharacterPortrait from '../components/scene/CharacterPortrait'
import CourtroomScene from '../components/scene/CourtroomScene'
import { useCourt } from '../store/useCourt'

type Tab = 'graph' | 'legal' | 'transcript' | 'verdict'
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'transcript', label: '庭审记录', icon: MessageSquareText },
  { id: 'graph', label: '关系图', icon: Network },
  { id: 'legal', label: '法定份额', icon: Scale },
  { id: 'verdict', label: '裁决', icon: Trophy },
]

const STATUS_TEXT: Record<string, string> = { idle: '待命', thinking: '思考中', speaking: '发言中', angry: '生气', happy: '开心' }

export default function CourtroomPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const s = useCourt()
  const [tab, setTab] = useState<Tab>('transcript')
  const [ghostText, setGhostText] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    const close = s.connect(id)
    return close
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (s.verdict) setTab('verdict')
  }, [s.verdict])

  const sendGhost = async () => {
    const text = ghostText.trim()
    if (!text || sending) return
    setSending(true)
    try {
      await api.interject(id, text)
      setGhostText('')
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setSending(false)
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
  const activeAgent = s.agents.find((a) => ['thinking', 'speaking'].includes(s.statuses[a.id] ?? 'idle'))
  const currentLabel = currentStep >= 0 ? steps[currentStep] : '待命'

  return (
    <div className="court-shell flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-white/7 bg-ink-950/84 shadow-[0_14px_50px_-34px_rgba(0,0,0,.9)] backdrop-blur-2xl">
        <div className="mx-auto flex h-[72px] max-w-[1920px] items-center gap-3 px-3 sm:gap-4 sm:px-5">
          <Link to="/" className="btn-ghost h-9 shrink-0 px-2.5 sm:px-3">
            <ArrowLeft size={15} /> <span className="hidden sm:inline">新案件</span>
          </Link>
          <div className="h-7 w-px bg-white/8" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="font-serif text-base font-black tracking-[0.12em] text-ink-100 sm:text-lg">HeirArena</div>
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
              <Sparkles size={11} /> {s.mode === 'llm' ? s.model : '剧本演示'}
            </span>
            <span className={`chip px-2.5 py-1 ${s.connected ? 'border-emerald-400/20 bg-emerald-400/5 text-emerald-300' : 'text-ink-400'}`}>
              {s.connected ? <Wifi size={12} /> : <WifiOff size={12} />}
              <span className="hidden sm:inline">{s.done ? '已闭庭' : s.connected ? '直播中' : '连接中'}</span>
              <span className={`h-1.5 w-1.5 rounded-full ${s.done ? 'bg-ink-400' : s.connected ? 'animate-pulse bg-emerald-400' : 'bg-amber-400'}`} />
            </span>
          </div>
        </div>
        <div className="no-scrollbar overflow-x-auto border-t border-white/5 px-3 py-2 xl:hidden">
          <PhaseRail steps={steps} current={currentStep} compact />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1920px] flex-1 items-start gap-4 p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_450px]">
        <section className="flex min-w-0 flex-col gap-3">
          <div className="panel-elevated overflow-hidden p-2 sm:p-3">
            <div className="mb-2 flex min-h-8 items-center gap-3 px-1 sm:px-2">
              <span className="flex items-center gap-2 rounded-full border border-red-400/20 bg-red-400/6 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-red-200">
                <Radio size={11} className="animate-pulse" /> LIVE
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold tracking-[0.14em] text-ink-400">HEARING STAGE</div>
                <div className="truncate text-xs text-ink-200">
                  当前阶段：<b className="text-gold-300">{currentLabel}</b>
                  {activeAgent && <> · <span style={{ color: activeAgent.color }}>{activeAgent.name}</span> {s.statuses[activeAgent.id] === 'speaking' ? '正在发言' : '正在组织观点'}</>}
                </div>
              </div>
              <div className="ml-auto hidden items-center gap-3 text-[10px] text-ink-400 md:flex">
                <span>{debaters.length} 位出席者</span>
                <span className="h-3 w-px bg-white/8" />
                <span>{s.turns.length} 条庭审记录</span>
              </div>
            </div>
            <CourtroomScene />
          </div>

          {/* roster */}
          <div className="panel-elevated p-2.5 sm:p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Users size={13} className="text-gold-400" />
                <span className="text-xs font-semibold text-ink-200">出席席位</span>
              </div>
              <span className="text-[10px] text-ink-400">角色状态会随庭审实时变化</span>
            </div>
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
              {debaters.map((a) => {
                const st = s.statuses[a.id] ?? 'idle'
                const active = st !== 'idle'
                return (
                  <div key={a.id} className={`relative flex min-w-[164px] items-center gap-2.5 overflow-hidden rounded-xl border px-2.5 py-1.5 transition ${active ? 'bg-white/[.045]' : 'border-white/6 bg-black/18'}`}
                    style={active ? { borderColor: `${a.color}55`, boxShadow: `inset 0 0 24px ${a.color}0d` } : undefined}>
                    <div className="flex h-11 w-10 shrink-0 items-end justify-center overflow-hidden rounded-lg border border-white/7 bg-black/20">
                      <CharacterPortrait agent={a} status={st} size={34} petKind={/狗|犬|汪/.test(a.name) ? 'dog' : 'cat'} animated={false} />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold" style={{ color: a.color }}>{a.name}</div>
                      <div className="truncate text-[10px] text-ink-400">{a.personality_label} · {a.role}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-ink-300">
                        <span className={`h-1.5 w-1.5 rounded-full ${st === 'speaking' ? 'animate-pulse' : ''}`}
                          style={{ background: st === 'idle' ? '#6d7588' : st === 'angry' ? '#f87171' : st === 'happy' ? '#34d399' : a.color, boxShadow: active ? `0 0 7px ${a.color}` : undefined }} />
                        {STATUS_TEXT[st]}
                      </div>
                    </div>
                    {st === 'speaking' && <div className="absolute inset-x-3 bottom-0 h-px" style={{ background: a.color }} />}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ghost interjection */}
          <div className="panel-elevated flex flex-col gap-2.5 p-2.5 sm:flex-row sm:items-center sm:p-3">
            <div className="flex shrink-0 items-center gap-2 px-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-400/8 text-violet-300 shadow-[0_0_24px_rgba(167,139,250,.08)]">
                <Ghost size={17} />
              </div>
              <div className="hidden lg:block">
                <div className="text-[10px] font-semibold tracking-widest text-violet-300">GHOST LINE</div>
                <div className="text-[10px] text-ink-400">以逝者身份影响下一位发言人</div>
              </div>
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/7 bg-black/30 p-1 pl-3 transition focus-within:border-violet-400/30 focus-within:shadow-[0_0_0_3px_rgba(167,139,250,.06)]">
              <input className="min-w-0 flex-1 bg-transparent text-sm text-ink-100 outline-none placeholder:text-ink-400"
                placeholder={s.done ? '听证会已结束，幽灵也该安息了。' : `以 ${s.caseData?.decedent_name ?? '逝者'} 的幽灵身份插一句话…`}
                value={ghostText} disabled={!!s.done} onChange={(e) => setGhostText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendGhost()} maxLength={200} />
              <span className="hidden font-mono text-[9px] text-ink-400 sm:inline">{ghostText.length}/200</span>
              <button className="btn-gold shrink-0 px-3 py-2 text-xs" disabled={!ghostText.trim() || sending || !!s.done} onClick={sendGhost}>
                <Send size={13} /> {sending ? '传递中' : '显灵'}
              </button>
            </div>
          </div>
        </section>

        <aside className="panel-elevated flex min-h-[540px] flex-col overflow-hidden xl:sticky xl:top-[88px] xl:h-[calc(100vh-104px)]">
          <div className="flex border-b border-white/7 bg-black/10 px-1 pt-1">
            {TABS.map((t) => {
              const Icon = t.icon
              return (
                <button key={t.id} onClick={() => setTab(t.id)} aria-selected={tab === t.id}
                  className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-t-lg px-1 py-2.5 text-[10px] font-semibold transition sm:flex-row sm:text-xs ${tab === t.id ? 'bg-white/[.025] text-gold-300' : 'text-ink-400 hover:bg-white/[.018] hover:text-ink-200'}`}>
                  <Icon size={13} />
                  <span className="truncate">{t.label}</span>
                  {t.id === 'verdict' && s.verdict && tab !== 'verdict' && <span className="absolute top-2 right-[18%] h-1.5 w-1.5 rounded-full bg-gold-400 shadow-[0_0_8px_#e9be6f]" />}
                  {tab === t.id && <motion.span layoutId="tab" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-gold-400 shadow-[0_0_10px_rgba(233,190,111,.55)]" />}
                </button>
              )
            })}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            {!s.caseData || !s.legal ? (
              <div className="flex h-full min-h-80 flex-col items-center justify-center text-center">
                <div className="relative mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-gold-500/20 bg-gold-500/8 text-gold-300">
                  <Scale size={22} />
                  <span className="absolute inset-0 animate-ping rounded-2xl border border-gold-400/15" />
                </div>
                <div className="text-sm font-semibold text-ink-200">正在传唤各位继承人</div>
                <div className="mt-1 text-xs text-ink-400">执行官正在核对卷宗与法定份额…</div>
              </div>
            ) : tab === 'graph' ? (
              <FamilyGraph caseData={s.caseData} legal={s.legal} agents={s.agents} />
            ) : tab === 'legal' ? (
              <LegalPanel legal={s.legal} agents={s.agents} articleShort={s.articleShort} />
            ) : tab === 'transcript' ? (
              <TranscriptPanel turns={s.turns} agents={s.agents} ghosts={s.ghosts} decedent={s.caseData.decedent_name} />
            ) : (
              <VerdictPanel verdict={s.verdict} caseData={s.caseData} agents={s.agents} articleShort={s.articleShort} done={s.done}
                sessionId={id} onRestart={() => nav('/')} />
            )}
          </div>
        </aside>
      </main>

      {/* notices */}
      <div className="pointer-events-none fixed right-3 bottom-3 z-[1000] flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-2 sm:right-5 sm:bottom-5">
        <AnimatePresence>
          {s.notices.filter((n) => Date.now() - n.ts < 8000).map((n) => (
            <motion.div key={n.ts} initial={{ opacity: 0, x: 40, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 20 }}
              className="rounded-xl border border-amber-400/25 bg-amber-950/88 px-3 py-2.5 text-xs text-amber-100 shadow-xl backdrop-blur-xl">
              <span className="mr-1.5 text-amber-300">◆</span>{n.text}
            </motion.div>
          ))}
          {s.error && (
            <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-red-400/30 bg-red-950/88 px-3 py-2.5 text-xs text-red-100 shadow-xl backdrop-blur-xl">
              {s.error}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
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
              className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold transition sm:px-2.5 sm:text-[11px] ${active
                ? 'bg-gold-500 text-ink-950 shadow-[0_0_18px_rgba(214,162,78,.34)]'
                : done ? 'text-ink-200' : 'text-ink-400'}`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded-full border font-mono text-[8px] ${active
                ? 'border-ink-950/20 bg-ink-950/10'
                : done ? 'border-gold-500/30 bg-gold-500/10 text-gold-300' : 'border-white/8'}`}>
                {i + 1}
              </span>
              {label}
            </div>
            {i < steps.length - 1 && (
              <span className={`mx-0.5 h-px w-3 sm:mx-1 sm:w-5 ${done ? 'bg-gold-500/50' : 'bg-white/8'}`} />
            )}
          </li>
        )
      })}
    </ol>
  )
}
