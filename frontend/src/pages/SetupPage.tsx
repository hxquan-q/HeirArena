import { AnimatePresence, motion } from 'motion/react'
import { PxlKitIcon } from '@pxlkit/core'
import { PixelAlertDialog, PixelEmptyState, PixelSegmented, PixelSwitch, PixelTooltip, useMediaQuery } from '@pxlkit/ui-kit'
import { ArrowLeft, ArrowRight, Check, Cpu, Gavel, Landmark, Plus, Scale, Target, Trash2, Users, Wallet } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, type ServerConfig } from '../api/client'
import ModelSelect from '../components/ModelSelect'
import ProviderManager from '../components/ProviderManager'
import SeatChapter from '../components/seat/SeatChapter'
import CharacterPortrait from '../components/scene/CharacterPortrait'
import CourtRecord, { ShareBar } from '../components/ui/CourtRecord'
import TopBar from '../components/ui/TopBar'
import { Gavel as PixelGavel } from '../components/icons/pixel'
import { ASSET_TYPES, PERSONALITIES, PRESETS, RELATIONS, RELATION_LABEL } from '../data/presets'
import { describeRef, useProviders } from '../hooks/useProviders'
import { sfx } from '../lib/sfx'
import { memberAgent, petKindOf } from '../lib/agentSpec'
import { cleanDraft, isDraftValid, useCaseDraft, useLegalPreview } from '../store/useCaseDraft'
import type { AgentSpec, Asset, Member } from '../types'

const FLAGS: { key: keyof Member; label: string; hint: string }[] = [
  { key: 'main_support', label: '尽了主要扶养义务', hint: '第1130条 可以多分；儿媳/女婿据此成为第一顺序' },
  { key: 'cohabit', label: '与逝者共同生活', hint: '第1130条 可以多分' },
  { key: 'hardship', label: '生活困难且缺乏劳动能力', hint: '第1130条 应当照顾' },
  { key: 'neglect', label: '有能力却不尽扶养义务', hint: '第1130条 应当不分或少分' },
  { key: 'dependency', label: '继子女：有扶养关系', hint: '第1127条 视同子女' },
  { key: 'deceased', label: '先于逝者去世', hint: '第1128条 由其子女代位继承' },
  { key: 'disqualified', label: '丧失继承权', hint: '第1125条（虐待、伪造遗嘱等）' },
]
type StepId = 'file' | 'assets' | 'roster' | 'seat'
interface Chapter {
  id: StepId
  roman: string
  label: string
  title: string
  desc: string
  accent: string
  icon: ReactNode
}
/* 选剧本已由大厅承担；卷宗页四卷：立案 → 清点 → 传唤 → 入局 */
const CHAPTERS: Chapter[] = [
  { id: 'file', roman: 'I', label: '立案', title: '登记案件背景', desc: '逝者 · 故事 · 规则', accent: '#e2b25a', icon: <Landmark size={15} /> },
  { id: 'assets', roman: 'II', label: '清点遗产', title: '清点遗产清单', desc: '资产 · 共同财产', accent: '#3fb27f', icon: <Wallet size={15} /> },
  { id: 'roster', roman: 'III', label: '传唤角色', title: '传唤出场角色', desc: '家人 · 关系人', accent: '#f07aa8', icon: <Users size={15} /> },
  { id: 'seat', roman: 'IV', label: '入局', title: '选择席位与诉求', desc: '我是谁 · 诉求 · 策略', accent: '#a58bff', icon: <Target size={15} /> },
]

function initialChapterStep(chapter: string | null): number {
  if (chapter !== 'seat') return 0
  const index = CHAPTERS.findIndex((item) => item.id === 'seat')
  return index >= 0 ? index : 0
}

export default function SetupPage() {
  const nav = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [config, setConfig] = useState<ServerConfig | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitErr, setSubmitErr] = useState<string | null>(null)
  const [selectedMember, setSelectedMember] = useState<string | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null)
  const [showProviders, setShowProviders] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [step, setStep] = useState(() => initialChapterStep(searchParams.get('chapter')))
  const tall = useMediaQuery('(min-height: 880px)', true)
  const { providers, presets, refresh: refreshProviders } = useProviders()

  const c = useCaseDraft((s) => s.c)
  const activePreset = useCaseDraft((s) => s.activePreset)
  const preview = useCaseDraft((s) => s.preview)
  const previewErr = useCaseDraft((s) => s.previewErr)
  const upd = useCaseDraft((s) => s.upd)
  const updAsset = useCaseDraft((s) => s.updAsset)
  const updMember = useCaseDraft((s) => s.updMember)
  const addAsset = useCaseDraft((s) => s.addAsset)
  const addMember = useCaseDraft((s) => s.addMember)
  const removeAsset = useCaseDraft((s) => s.removeAsset)
  const removeMember = useCaseDraft((s) => s.removeMember)
  const advisorModel = useCaseDraft((s) => s.advisorModel)
  const setAdvisorModel = useCaseDraft((s) => s.setAdvisorModel)
  useLegalPreview()

  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(null))
  }, [])

  useEffect(() => {
    if (searchParams.get('chapter') !== 'seat') return
    const next = new URLSearchParams(searchParams)
    next.delete('chapter')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const onProvidersChanged = async () => {
    await refreshProviders()
    api.config().then(setConfig).catch(() => {})
  }

  const valid = isDraftValid(c)
  const overriddenCount = c.members.filter((m) => !!m.model).length
  const presetTitle = PRESETS.find((p) => p.id === activePreset)?.title

  const start = async () => {
    sfx('stamp')
    setSubmitting(true)
    setSubmitErr(null)
    try {
      const res = await api.createSession(cleanDraft(c))
      nav(`/court/${res.session_id}`)
    } catch (e) {
      sfx('error')
      setSubmitErr((e as Error).message)
      setSubmitting(false)
    }
  }

  const requestStart = () => {
    if (c.seat && c.seat.strategy == null) {
      setConfirmOpen(true)
      return
    }
    void start()
  }

  const goStep = (next: number) => {
    const clamped = Math.max(0, Math.min(CHAPTERS.length - 1, next))
    if (clamped === step) return
    sfx(clamped > step ? 'confirm' : 'back')
    setStep(clamped)
  }

  const children = c.members.filter((m) => ['son', 'daughter', 'stepchild'].includes(m.relation))
  const total = c.assets.reduce((s, a) => s + (Number(a.value) || 0), 0)
  const isLast = step === CHAPTERS.length - 1
  const inheritLabel = `跟随默认（${describeRef(c.default_model, providers, config?.default_model ? describeRef(config.default_model, providers) : '剧本模式')}）`
  const advisorInherit = `跟随执行官（${describeRef(c.executor_model ?? c.default_model, providers, inheritLabel)}）`

  /* ── chapter bodies ─────────────────────────────────────────── */

  const renderFile = () => (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="panel-elevated p-4">
        <PanelHeading icon={<Landmark size={16} />} step="01" title="案件背景" subtitle="逝者开口——这段话就是庭上的「公开事实」" />

        {/* NPC 对话：左边幽灵化的逝者立绘，右边 RPG 对话框，名牌可直接改名 */}
        <div className="mt-4 grid gap-4 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-end">
          <div className="relative mx-auto flex h-[156px] w-[120px] items-end justify-center overflow-hidden border-2 border-ghost-700 bg-[radial-gradient(circle_at_50%_78%,rgba(165,139,255,.28),transparent_68%),linear-gradient(180deg,#1e1712,#17120f)] shadow-[3px_3px_0_rgba(0,0,0,.55)]">
            <div className="animate-float" style={{ filter: 'sepia(.25) hue-rotate(215deg) saturate(.8) brightness(1.08) drop-shadow(0 0 10px rgba(165,139,255,.45))' }}>
              <CharacterPortrait agent={decedentAgent(c.decedent_name)} status="idle" size={100} animated={false} />
            </div>
            <span className="pixel-text absolute top-1.5 left-1.5 text-[11px] text-ghost-300">逝者 · 灵</span>
          </div>

          <div className="relative border-2 border-ink-200 bg-ink-950 px-4 pt-5 pb-6" style={{ boxShadow: 'inset 0 0 0 2px #17120f, inset 0 0 0 3px rgba(224,211,185,.35), 4px 4px 0 rgba(0,0,0,.6)' }}>
            <label className="absolute -top-4 left-3 flex items-center gap-1.5 border-2 border-ink-200 bg-ink-800 px-2 py-0.5 shadow-[2px_2px_0_rgba(0,0,0,.6)]">
              <span className="pixel-text text-[11px] text-gold-400">NAME</span>
              <input className="pixel-text w-[120px] bg-transparent text-[14px] text-ink-100 outline-none placeholder:text-ink-400" value={c.decedent_name}
                onChange={(e) => upd({ decedent_name: e.target.value })} placeholder="例如：老王" aria-label="逝者姓名 / 称呼" maxLength={12} />
            </label>
            <textarea className="min-h-[120px] w-full resize-y bg-transparent text-[14px] leading-7 text-ink-100 outline-none placeholder:text-ink-400"
              value={c.story} onChange={(e) => upd({ story: e.target.value })} aria-label="剧情设定（公开事实）"
              placeholder="儿子五年没回家，只在借钱时打电话；女儿辞职照顾我三年；我最爱那只猫……" />
            <span className="pixel-text absolute right-3 bottom-1.5 animate-blink-step text-[12px] text-gold-300" aria-hidden>▼</span>
            <span className="pixel-text absolute bottom-1.5 left-3 text-[11px] text-ink-400">{c.story.length} 字</span>
          </div>
        </div>

        <div className="panel-inset mt-4 p-3 text-xs leading-relaxed text-ink-300">
          <div className="pixel-text mb-1 flex items-center gap-2 text-[12px] text-gold-300"><Scale size={13} /> 法律提示</div>
          点名牌可以改称呼。规则引擎会先析出夫妻共同财产，再按继承顺序、扶养义务与特殊情形计算参考份额；对话里写明的照顾、失联、争执会影响角色发言。
        </div>
      </div>

      <div className="panel-elevated space-y-3 p-4">
        <PanelHeading icon={<Gavel size={16} />} step="02" title="庭审规则" subtitle="节奏、酌情与模型分配" />
        <div className="space-y-2 text-xs font-medium text-ink-300">
          <div className="flex items-center justify-between">
            <span>辩论轮数</span>
            <span className="pixel-text text-[12px] text-gold-300">{c.rounds} ROUNDS</span>
          </div>
          <PixelSegmented
            value={String(c.rounds)}
            options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))}
            onChange={(v) => upd({ rounds: Number(v) })}
            tone="gold"
            aria-label="辩论轮数"
          />
        </div>
        <div className="space-y-2 text-xs font-medium text-ink-300">
          <div className="flex items-center justify-between">
            <PixelTooltip content="执行官相对法定份额的最大酌情偏移：0 = 严格法定，15 = 戏剧优先">
              <span className="flex items-center gap-1">酌情幅度</span>
            </PixelTooltip>
            <span className="pixel-text text-[12px] text-gold-300">±{c.discretion ?? 5} pt</span>
          </div>
          <PixelSegmented
            value={String(c.discretion ?? 5)}
            options={[
              { value: '0', label: '0 严格' },
              { value: '5', label: '5 参考' },
              { value: '10', label: '10' },
              { value: '15', label: '15 戏剧' },
            ]}
            onChange={(v) => upd({ discretion: Number(v) })}
            tone="gold"
            aria-label="酌情幅度"
          />
          <div className="text-[11px] leading-snug text-ink-400">
            只有当庭成立的法律事实（自认未扶养 / 放弃 / 多人确认的赡养）才会在此范围内调整份额；0 表示严格按法定份额落槌。
          </div>
        </div>
        <div className="space-y-2 text-xs font-medium text-ink-300">
          <div className="flex items-center justify-between">
            <span>播放语速</span>
            <span className="pixel-text text-[12px] text-gold-300">{c.speed}× SPEED</span>
          </div>
          <PixelSegmented
            value={String(c.speed)}
            options={[0.5, 1, 2, 4].map((n) => ({ value: String(n), label: `${n}×` }))}
            onChange={(v) => upd({ speed: Number(v) })}
            tone="gold"
            aria-label="播放语速"
          />
        </div>
        <div className="panel-inset space-y-1.5 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="pixel-text flex items-center gap-1.5 text-[12px] text-ink-200"><Cpu size={13} className="text-gold-400" /> 模型分配</span>
            <button className="pixel-text text-[12px] text-gold-300 hover:underline" onClick={() => setShowProviders(true)}>管理供应商</button>
          </div>
          <label className="block text-ink-300">
            所有角色默认
            <ModelSelect className="mt-1" value={c.default_model} onChange={(ref) => upd({ default_model: ref })} providers={providers} />
          </label>
          <label className="block text-ink-300">
            遗嘱执行官（裁决）
            <ModelSelect className="mt-1" value={c.executor_model} onChange={(ref) => upd({ executor_model: ref })} providers={providers} inheritLabel={inheritLabel} />
          </label>
          <label className="block text-ink-300">
            军师（入局模式）
            <ModelSelect className="mt-1" value={advisorModel} onChange={setAdvisorModel} providers={providers} inheritLabel={advisorInherit} allowMock={false} />
          </label>
          {!c.seat && <div className="text-[11px] text-ink-400">仅入局推演使用</div>}
          <div className="text-[11px] leading-relaxed text-ink-400">
            {overriddenCount > 0 ? `${overriddenCount} 位角色单独指定了模型；` : '在“传唤角色”卷可单独指定某人模型；'}
            未接入模型的角色会用内置剧本发言，模型出错也会自动回退。
          </div>
        </div>
      </div>
    </div>
  )

  /* 背包式物品栏：格子里放遗产，点一格在下方编辑 */
  const renderAssets = () => {
    const sel = c.assets.find((a) => a.id === selectedAsset) ?? c.assets[0] ?? null
    const jointCount = c.assets.filter((a) => a.joint).length
    return (
      <div className="panel-elevated p-4 sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <PanelHeading icon={<Wallet size={16} />} step="03" title="背包 · 遗产清单" subtitle={`${c.assets.length} 件 · 估值 ${total.toFixed(total >= 100 ? 0 : 1)} 万${jointCount ? ` · ${jointCount} 件夫妻共同` : ''}`} />
          <span className="chip hidden text-ink-400 sm:inline-flex">点格子编辑 · 空格新增</span>
        </div>

        <div className="panel-inset p-3">
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2.5" role="listbox" aria-label="遗产格子">
            {c.assets.map((a) => {
              const on = sel?.id === a.id
              const t = ASSET_TYPES.find((x) => x.value === a.type)
              return (
                <li key={a.id} role="option" aria-selected={on}>
                  <button type="button" onClick={() => { if (!on) sfx('move'); setSelectedAsset(a.id) }}
                    className={`relative flex aspect-square w-full flex-col items-center justify-center gap-1 border-2 p-2 text-center transition ${on
                      ? 'border-gold-400 bg-gold-600/15 shadow-[3px_3px_0_rgba(0,0,0,.6)]'
                      : 'border-ink-600 bg-ink-900 hover:border-ink-400 hover:bg-ink-850'}`}>
                    <span className="text-[30px] leading-none drop-shadow-[2px_2px_0_rgba(0,0,0,.6)]" aria-hidden>{t?.emoji ?? '📦'}</span>
                    <span className="pixel-text w-full truncate text-[12px] leading-4 text-ink-100">{a.name || '未命名'}</span>
                    <span className="pixel-text absolute top-1 right-1 border-2 border-ink-950 bg-gold-400 px-1 text-[11px] leading-4 text-ink-950">{Number(a.value) || 0}万</span>
                    <span className="absolute bottom-1 left-1 flex gap-1" aria-hidden>
                      {a.joint && <span className="h-2 w-2 border border-ink-950 bg-sky-300" title="夫妻共同" />}
                      {a.sentimental && <span className="h-2 w-2 border border-ink-950 bg-pink-300" title="纪念意义" />}
                    </span>
                    {on && <span className="pixel-text absolute -top-2.5 -left-1 animate-blink-step text-[14px] text-gold-300" aria-hidden>▶</span>}
                  </button>
                </li>
              )
            })}
            <li>
              <button type="button" onClick={() => { sfx('coin'); const a = addAsset(); setSelectedAsset(a.id) }} aria-label="添加资产"
                className="flex aspect-square w-full flex-col items-center justify-center gap-1 border-2 border-dashed border-ink-600 bg-ink-950/60 text-ink-400 transition hover:border-gold-600 hover:text-gold-300">
                <Plus size={22} />
                <span className="pixel-text text-[12px]">新增</span>
              </button>
            </li>
          </ul>
        </div>

        {sel ? (
          <div className="mt-4 border-2 border-ink-700 bg-ink-900/70 p-4">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center border-2 border-gold-600 bg-ink-950 text-[24px] shadow-[2px_2px_0_rgba(0,0,0,.55)]" aria-hidden>{ASSET_TYPES.find((x) => x.value === sel.type)?.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="pixel-text text-[12px] text-gold-400">ITEM · 物品详情</div>
                <div className="pixel-text truncate text-[16px] text-ink-100">{sel.name || '未命名资产'}</div>
              </div>
              <button aria-label={`删除${sel.name || '资产'}`} className="btn-ghost h-8 px-2.5 text-[11px] hover:border-seal-700 hover:text-seal-400" onClick={() => { removeAsset(sel.id); setSelectedAsset(null) }}>
                <Trash2 size={13} /> 丢弃
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)_130px]">
              <label className="block text-xs text-ink-300">
                类型
                <select aria-label="资产类型" className="input-base mt-1 truncate px-2 py-2 text-xs" value={sel.type} onChange={(e) => updAsset(sel.id, { type: e.target.value as Asset['type'] })}>
                  {ASSET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
                </select>
              </label>
              <label className="block text-xs text-ink-300">
                名称
                <input aria-label="资产名称" className="input-base mt-1 min-w-0 py-2 text-xs" value={sel.name} onChange={(e) => updAsset(sel.id, { name: e.target.value })} placeholder="例如：学区房、比特币 2.3 枚" autoFocus={!sel.name} />
              </label>
              <label className="block text-xs text-ink-300">
                估值
                <span className="relative mt-1 block">
                  <input aria-label="资产估值" className="input-base py-2 pr-7 text-right font-mono text-xs" type="number" min={0} value={sel.value}
                    onChange={(e) => updAsset(sel.id, { value: Number(e.target.value) })} />
                  <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-ink-400">万</span>
                </span>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-300">
              <PixelTooltip content="第1153条：先析出一半归配偶">
                <span>
                  <PixelSwitch label="夫妻共同" checked={sel.joint} onChange={(v) => updAsset(sel.id, { joint: v })} tone="gold" />
                </span>
              </PixelTooltip>
              <PixelSwitch label="纪念意义" checked={sel.sentimental} onChange={(v) => updAsset(sel.id, { sentimental: v })} tone="pink" />
              <input aria-label="资产备注" className="input-base ml-auto min-w-[160px] flex-1 py-1.5 text-xs sm:max-w-[280px]" value={sel.note} onChange={(e) => updAsset(sel.id, { note: e.target.value })} placeholder="补充备注（可选）：来历、争议、谁在惦记" />
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <PixelEmptyState
              title="背包还是空的"
              description="至少放进一件遗产才能开庭"
              icon={<PxlKitIcon icon={PixelGavel} size={36} colorful />}
              action={<button className="btn-gold px-4 py-2 text-xs" onClick={() => { sfx('coin'); const a = addAsset(); setSelectedAsset(a.id) }}><Plus size={13} /> 放进第一件</button>}
            />
          </div>
        )}
      </div>
    )
  }

  /* 角色选择画面：一排角色卡（大立绘 · 职业徽章 · 法定份额 HP 条），点一张在下方编辑 */
  const renderRoster = () => {
    const sel = c.members.find((m) => m.id === selectedMember) ?? c.members[0] ?? null
    const selP = sel ? PERSONALITIES.find((x) => x.value === sel.personality) : undefined
    const selShare = sel ? preview?.shares.find((s) => s.member_id === sel.id) : undefined
    return (
      <div className="panel-elevated p-3">
        <div className="mb-2.5 flex items-start justify-between gap-3">
          <PanelHeading icon={<Users size={16} />} step="04" title="角色选择 · 出席者" subtitle={`${c.members.length} 位家人与关系人 · 点卡片编辑 · 多了左右滑`} />
          <button className="btn-ghost shrink-0" onClick={() => { sfx('coin'); const m = addMember(); setSelectedMember(m.id) }}><Plus size={14} /> 新角色</button>
        </div>

        <div className="panel-inset p-2">
          {/* 横向选人条：像格斗游戏的角色一排，多了就左右滑 */}
          <ul className="no-scrollbar flex snap-x items-stretch gap-2.5 overflow-x-auto" role="listbox" aria-label="出席角色">
            {c.members.map((m) => {
              const on = sel?.id === m.id
              const share = preview?.shares.find((s) => s.member_id === m.id)
              const p = PERSONALITIES.find((x) => x.value === m.personality)
              const color = p?.color ?? '#a08d78'
              const pct = share?.eligible && share.percent > 0 ? share.percent : 0
              const flagCount = FLAGS.filter((f) => Boolean(m[f.key])).length
              return (
                <li key={m.id} role="option" aria-selected={on} className="w-[140px] shrink-0 snap-start">
                  <button type="button" onClick={() => { if (!on) sfx('move'); setSelectedMember(m.id) }}
                    className={`relative flex h-full w-full flex-col border-2 text-left transition ${on
                      ? 'border-gold-400 bg-gold-600/10 shadow-[3px_3px_0_rgba(0,0,0,.6)]'
                      : 'border-ink-600 bg-ink-900 hover:border-ink-400'} ${m.deceased ? 'opacity-70' : ''}`}>
                    <div className="relative flex h-[92px] w-full items-end justify-center overflow-hidden border-b-2 border-ink-700"
                      style={{ background: `radial-gradient(circle at 50% 88%, ${color}55, transparent 68%), linear-gradient(180deg, #1e1712, #17120f)` }}>
                      <CharacterPortrait agent={memberAgent(m)} status={on ? 'happy' : 'idle'} size={66} petKind={petKindOf(m.name)} animated={on} />
                      <span className="pixel-text absolute top-1 left-1 border-2 border-ink-950 px-1 text-[10px] leading-4 text-ink-950 shadow-[2px_2px_0_rgba(0,0,0,.55)]" style={{ background: color }}>
                        {p?.emoji} {p?.label}
                      </span>
                      {m.deceased && <span className="pixel-text absolute top-1 right-1 border-2 border-ink-600 bg-ink-950 px-1 text-[10px] leading-4 text-ink-300">✝</span>}
                      {m.model && (
                        <span className="absolute right-1 bottom-1 flex h-4.5 w-4.5 items-center justify-center border-2 border-ghost-700 bg-ink-950 text-ghost-300" title={`模型：${describeRef(m.model, providers)}`}>
                          <Cpu size={9} />
                        </span>
                      )}
                      {flagCount > 0 && (
                        <span className="pixel-text absolute bottom-1 left-1 border-2 border-ink-950 bg-gold-400 px-1 text-[10px] leading-4 text-ink-950" title={`${flagCount} 项法律事实`}>
                          ★{flagCount}
                        </span>
                      )}
                    </div>
                    <div className="w-full px-2 py-1.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="pixel-text min-w-0 truncate text-[14px] leading-5 text-ink-100">{m.name || '未命名'}</span>
                        <span className="shrink-0 truncate text-[10px] text-ink-400">{RELATION_LABEL[m.relation] ?? m.relation}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <div className="hp-track h-2.5 min-w-0 flex-1 overflow-hidden">
                          <div className="h-full transition-[width] duration-300" style={{ width: `${Math.min(100, pct)}%`, background: color, boxShadow: 'inset 0 -2px 0 rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.3)' }} />
                        </div>
                        <span className={`pixel-text w-8 shrink-0 text-right text-[10px] ${pct ? 'text-gold-300' : 'text-ink-400'}`} title="法定参考份额">
                          {pct ? `${pct.toFixed(0)}%` : share ? '—' : '…'}
                        </span>
                      </div>
                    </div>
                    {on && <span className="pixel-text absolute -top-2.5 -left-1 animate-blink-step text-[14px] text-gold-300" aria-hidden>▶</span>}
                  </button>
                </li>
              )
            })}
            <li className="w-[140px] shrink-0 snap-start">
              <button type="button" onClick={() => { sfx('coin'); const m = addMember(); setSelectedMember(m.id) }} aria-label="添加角色"
                className="flex h-full min-h-[150px] w-full flex-col items-center justify-center gap-2 border-2 border-dashed border-ink-600 bg-ink-950/60 text-ink-400 transition hover:border-gold-600 hover:text-gold-300">
                <span className="flex h-10 w-10 items-center justify-center border-2 border-current"><Plus size={20} /></span>
                <span className="pixel-text text-[12px]">传唤新角色</span>
              </button>
            </li>
          </ul>
        </div>

        {sel && (
          <div className="mt-2.5 border-2 border-ink-700 bg-ink-900/70 p-3">
            <div className="mb-2 flex items-center gap-3">
              <span className="pixel-text flex h-10 w-10 shrink-0 items-center justify-center border-2 border-ink-950 text-[20px] shadow-[2px_2px_0_rgba(0,0,0,.55)]" style={{ background: selP?.color }} aria-hidden>{selP?.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="pixel-text text-[11px] text-gold-400">CHARACTER · 角色设定</div>
                <div className="truncate">
                  <span className="pixel-text text-[15px] text-ink-100">{sel.name || '未命名角色'}</span>
                  <span className="ml-2 text-[12px] text-ink-400">{RELATION_LABEL[sel.relation]} · {selP?.label}：{selP?.desc}</span>
                </div>
              </div>
              {selShare && (
                <span className={`chip hidden shrink-0 sm:inline-flex ${selShare.eligible && selShare.percent > 0 ? 'border-gold-600 bg-gold-600/15 text-gold-300' : 'text-ink-400'}`} title={selShare.notes.join('；')}>
                  {selShare.eligible && selShare.percent > 0 ? `法定 ${selShare.percent.toFixed(1)}%` : selShare.notes[0]?.slice(0, 18) || '不参与分配'}
                </span>
              )}
              <button aria-label={`删除${sel.name || '角色'}`} className="btn-ghost h-8 shrink-0 px-2.5 text-[11px] hover:border-seal-700 hover:text-seal-400" onClick={() => { sfx('back'); removeMember(sel.id); setSelectedMember(null) }}>
                <Trash2 size={13} /> 请离场
              </button>
            </div>

            {/* 身份：一行四栏 */}
            <div className={`grid gap-2 sm:grid-cols-2 ${sel.relation === 'grandchild' ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
              <label className="block text-xs text-ink-300">
                姓名 / 昵称
                <input aria-label="角色姓名" className="input-base mt-1 py-1.5 text-xs" value={sel.name} onChange={(e) => updMember(sel.id, { name: e.target.value })} placeholder="例如：王大宝" autoFocus={!sel.name} />
              </label>
              <label className="block text-xs text-ink-300">
                与逝者关系
                <select aria-label="角色关系" className="input-base mt-1 px-2 py-1.5 text-xs" value={sel.relation} onChange={(e) => updMember(sel.id, { relation: e.target.value as Member['relation'] })}>
                  {RELATIONS.map((r) => <option key={r.value} value={r.value}>{r.label} · {r.hint}</option>)}
                </select>
              </label>
              {sel.relation === 'grandchild' && (
                <label className="block text-xs text-ink-300">
                  TA 的父 / 母是
                  <select className="input-base mt-1 py-1.5 text-xs" value={sel.parent_id ?? ''} onChange={(e) => updMember(sel.id, { parent_id: e.target.value || null })}>
                    <option value="">（未指定）</option>
                    {children.filter((ch) => ch.id !== sel.id).map((ch) => <option key={ch.id} value={ch.id}>{ch.name || '(未命名)'}</option>)}
                  </select>
                </label>
              )}
              <label className="block text-xs text-ink-300">
                TA 最想要
                <input className="input-base mt-1 py-1.5 text-xs" value={sel.wish} onChange={(e) => updMember(sel.id, { wish: e.target.value })} placeholder="房子、老相册或那张沙发" />
              </label>
              <label className="block text-xs text-ink-300">
                <span className="flex items-center gap-1.5"><Cpu size={12} className="text-gold-400" /> 发言模型</span>
                <ModelSelect className="mt-1" value={sel.model} onChange={(ref) => updMember(sel.id, { model: ref })} providers={providers} inheritLabel={inheritLabel} />
              </label>
            </div>

            {/* 职业：一行八格 */}
            <div className="mt-2.5">
              <div className="pixel-text mb-1 text-[11px] text-ink-300">职业 · 性格决定 TA 在庭上怎么说话</div>
              <div className="grid grid-cols-4 gap-1.5 xl:grid-cols-8">
                {PERSONALITIES.map((pp) => {
                  const on = sel.personality === pp.value
                  return (
                    <button key={pp.value} type="button" title={pp.desc} onClick={() => { if (!on) sfx('move'); updMember(sel.id, { personality: pp.value }) }}
                      className={`flex items-center justify-center gap-1.5 border-2 px-1.5 py-1.5 transition ${on ? 'border-ink-950 text-ink-950 shadow-[2px_2px_0_rgba(0,0,0,.55)]' : 'border-ink-700 bg-ink-950 text-ink-300 hover:border-ink-500'}`}
                      style={on ? { background: pp.color } : undefined}>
                      <span className="text-[16px] leading-none" aria-hidden>{pp.emoji}</span>
                      <span className="pixel-text text-[12px] leading-4">{pp.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 法律事实：四栏两行 */}
            <div className="mt-2.5">
              <div className="pixel-text mb-1 text-[11px] text-ink-300">法律事实 · 会改变法定份额</div>
              <div className="grid grid-cols-2 gap-1 lg:grid-cols-3 xl:grid-cols-4">
                {FLAGS.map((f) => {
                  const on = Boolean(sel[f.key])
                  return (
                    <label key={f.key} title={f.hint} className={`flex cursor-pointer items-center gap-1.5 border-2 px-1.5 py-1 text-[11px] transition ${on ? 'border-gold-600 bg-gold-600/12 text-ink-100' : 'border-ink-700 bg-ink-950 text-ink-300 hover:border-ink-500'}`}>
                      <input type="checkbox" className="accent-gold-500" checked={on} onChange={(e) => { sfx(e.target.checked ? 'confirm' : 'back'); updMember(sel.id, { [f.key]: e.target.checked } as Partial<Member>) }} />
                      <span className="min-w-0 flex-1 truncate">{f.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const chapterBody: Record<StepId, () => ReactNode> = {
    file: renderFile,
    assets: renderAssets,
    roster: renderRoster,
    seat: () => <SeatChapter onManageProviders={() => setShowProviders(true)} onGoFile={() => goStep(0)} />,
  }
  const ch = CHAPTERS[step]

  return (
    <div className="setup-shell flex h-screen min-h-[560px] flex-col overflow-hidden">
      <TopBar
        config={config}
        providers={providers}
        onManageProviders={() => setShowProviders(true)}
        leading={
          <Link to="/" className="btn-ghost h-9 shrink-0 px-2.5" title="回大厅换一个剧本">
            <ArrowLeft size={13} /> <span className="hidden sm:inline">大厅</span>
          </Link>
        }
        center={
          <span className="chip ml-3 max-w-[38vw] truncate text-ink-300">
            <span className="text-gold-400">卷宗</span> {c.decedent_name || '未命名'}的遗产
            {presetTitle && <span className="text-ink-400"> · {presetTitle}</span>}
          </span>
        }
      />

      {/* chapter rail：四卷进度 + 当前卷标题，合成一条，像 RPG 的章节选择 */}
      <nav className="shrink-0 border-b-2 border-ink-700 bg-ink-900/80" aria-label="案卷进度">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-2 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="pixel-text flex h-10 w-10 shrink-0 items-center justify-center border-2 text-[20px] shadow-[3px_3px_0_rgba(0,0,0,.55)]"
              style={{ borderColor: ch.accent, background: `${ch.accent}1f`, color: ch.accent }}>
              {ch.roman}
            </div>
            <div className="min-w-0">
              <div className="eyebrow text-[11px]">
                <span style={{ color: ch.accent }}>{ch.icon}</span>
                CHAPTER {ch.roman} · {step + 1}/{CHAPTERS.length}
              </div>
              <h2 className="pixel-text truncate text-[20px] leading-6 text-ink-100">{ch.title}</h2>
            </div>
          </div>
          <div className="no-scrollbar ml-auto flex gap-2 overflow-x-auto">
            {CHAPTERS.map((chapter, i) => {
              const on = i === step
              const done = i < step
              return (
                <button key={chapter.id} onClick={() => goStep(i)} aria-current={on ? 'step' : undefined}
                  className={`group relative flex shrink-0 items-center gap-2 border-2 px-2.5 py-1.5 text-left transition ${on
                    ? 'border-ink-400 bg-ink-800 shadow-[3px_3px_0_rgba(0,0,0,.55)]'
                    : 'border-ink-700 bg-ink-950 hover:border-ink-500'}`}>
                  <span className="pixel-text flex h-7 w-7 shrink-0 items-center justify-center border-2 text-[13px]"
                    style={{
                      borderColor: on || done ? chapter.accent : 'var(--color-ink-600)',
                      background: on ? `${chapter.accent}26` : done ? `${chapter.accent}18` : 'transparent',
                      color: on || done ? chapter.accent : 'var(--color-ink-400)',
                    }}>
                    {done ? <Check size={13} strokeWidth={3} /> : chapter.roman}
                  </span>
                  <span className="pixel-text hidden text-[13px] sm:block" style={{ color: on ? 'var(--color-ink-100)' : done ? 'var(--color-ink-200)' : 'var(--color-ink-300)' }}>
                    {chapter.label}
                  </span>
                  {on && <motion.span layoutId="chapter-underline" className="absolute inset-x-2 -bottom-0.5 h-0.5" style={{ background: chapter.accent }} />}
                </button>
              )
            })}
          </div>
        </div>
      </nav>

      {/* 游戏窗口主体：整页不滚，内容面板放不下时只在自己内部滚 */}
      <main className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 gap-4 px-3 py-3 sm:px-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto pr-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={ch.id}
              initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}>
              {chapterBody[ch.id]()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 羊皮纸法庭记录：卷宗速览 + 法定份额 + 火漆 + 开庭；矮屏隐藏 3D 印章以求一屏放下 */}
        <aside className="hidden min-h-0 overflow-y-auto xl:block">
          <CourtRecord c={c} preview={preview} previewErr={previewErr} valid={valid} submitting={submitting} submitErr={submitErr} onStart={isLast ? requestStart : undefined} sigil={tall} />
        </aside>
      </main>

      {/* chapter navigation bar：窗口底部的操作条 */}
      <div className="glass shrink-0 border-x-0 border-b-0 shadow-none">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-2.5 sm:px-5">
          <button className="btn-ghost h-10 shrink-0 px-3" disabled={step === 0} onClick={() => goStep(step - 1)}>
            <ArrowLeft size={15} /> <span className="hidden sm:inline">上一卷</span>
          </button>

          <div className="min-w-0 flex-1 xl:hidden">
            <ShareBar preview={preview} previewErr={previewErr} members={c.members} compact />
          </div>
          <div className="hidden min-w-0 flex-1 items-center gap-2 xl:flex">
            <span className="pixel-text text-[12px] text-ink-400">{ch.roman}/{CHAPTERS.length}</span>
            <span className="hp-track h-3 flex-1 overflow-hidden">
              <span className="block h-full bg-gold-400 transition-all duration-300" style={{ width: `${((step + 1) / CHAPTERS.length) * 100}%`, boxShadow: 'inset 0 -2px 0 rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.3)' }} />
            </span>
            <span className="truncate text-xs text-ink-400">{isLast ? '已是最后一卷 · 右侧法庭记录即可开庭 →' : `下一卷：${CHAPTERS[step + 1]?.title ?? '开庭'}`}</span>
          </div>

          {isLast ? (
            <button className="btn-gold h-10 min-w-[150px] shrink-0 px-6 xl:hidden" disabled={!valid || submitting} onClick={requestStart}>
              <Gavel size={16} /> {submitting ? '传唤…' : '开庭'}
            </button>
          ) : (
            <button className="btn-gold h-10 shrink-0 px-5" onClick={() => goStep(step + 1)}>
              <span className="hidden sm:inline">下一卷</span><span className="sm:hidden">下一步</span> <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>

      <ProviderManager open={showProviders} onClose={() => setShowProviders(false)} providers={providers} presets={presets} onChanged={onProvidersChanged} />
      <PixelAlertDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="还没有推演策略"
        description="AI 代理将只按人设与心愿发言，确定开庭？"
        actionLabel="仍然开庭"
        cancelLabel="回去推演"
        onAction={() => { void start() }}
      />
    </div>
  )
}

function PanelHeading({ icon, step, title, subtitle }: { icon: ReactNode; step: string; title: string; subtitle: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-gold-600 bg-ink-950 text-gold-300 shadow-[2px_2px_0_rgba(0,0,0,.55)]">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="pixel-text text-[12px] text-gold-400">{step}</span>
          <h2 className="pixel-text text-[16px] text-ink-100">{title}</h2>
        </div>
        <p className="truncate text-[11px] text-ink-400">{subtitle}</p>
      </div>
    </div>
  )
}

/* 逝者没有独立立绘，按称呼猜性别借用父/母的像素立绘，再在对话框里做幽灵化处理 */
function decedentAgent(name: string): AgentSpec {
  const female = /奶|婆|妈|母|姨|娘|婶|姑|女|妹|姐|太|阿姨|夫人/.test(name)
  return {
    id: '__decedent', name: name || '逝者', role: '逝者', relation: female ? 'mother' : 'father',
    personality: 'chill', personality_label: '', title: '', color: '#a58bff', kind: 'human',
    legal_percent: 0, eligible: false, wish: '', llm: false, model_label: '',
  }
}

