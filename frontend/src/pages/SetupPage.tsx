import { ArrowRight, Check, ChevronDown, FileText, Gavel, Landmark, Plus, Scale, Sparkles, Trash2, Users, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type ServerConfig } from '../api/client'
import CharacterPortrait from '../components/scene/CharacterPortrait'
import { ASSET_TYPES, PERSONALITIES, PRESETS, RELATIONS, newAsset, newMember } from '../data/presets'
import type { AgentSpec, Asset, CaseInput, LegalResult, Member } from '../types'

const FLAGS: { key: keyof Member; label: string; hint: string }[] = [
  { key: 'main_support', label: '尽了主要扶养义务', hint: '第1130条 可以多分；儿媳/女婿据此成为第一顺序' },
  { key: 'cohabit', label: '与逝者共同生活', hint: '第1130条 可以多分' },
  { key: 'hardship', label: '生活困难且缺乏劳动能力', hint: '第1130条 应当照顾' },
  { key: 'neglect', label: '有能力却不尽扶养义务', hint: '第1130条 应当不分或少分' },
  { key: 'dependency', label: '继子女：有扶养关系', hint: '第1127条 视同子女' },
  { key: 'deceased', label: '先于逝者去世', hint: '第1128条 由其子女代位继承' },
  { key: 'disqualified', label: '丧失继承权', hint: '第1125条（虐待、伪造遗嘱等）' },
]

export default function SetupPage() {
  const nav = useNavigate()
  const [config, setConfig] = useState<ServerConfig | null>(null)
  const [c, setC] = useState<CaseInput>(() => PRESETS[0].build())
  const [preview, setPreview] = useState<LegalResult | null>(null)
  const [previewErr, setPreviewErr] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitErr, setSubmitErr] = useState<string | null>(null)
  const [openMember, setOpenMember] = useState<string | null>(null)
  const [activePreset, setActivePreset] = useState(PRESETS[0].id)

  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(null))
  }, [])

  const valid = useMemo(
    () => c.assets.some((a) => a.name.trim()) && c.members.some((m) => m.name.trim()) && c.decedent_name.trim().length > 0,
    [c],
  )

  useEffect(() => {
    if (!valid) return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      api.legalPreview(clean(c), ctrl.signal).then((r) => { setPreview(r); setPreviewErr(null) }).catch((e: Error) => {
        if (e.name !== 'AbortError') setPreviewErr(e.message)
      })
    }, 350)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [c, valid])

  const upd = (patch: Partial<CaseInput>) => setC((s) => ({ ...s, ...patch }))
  const updAsset = (id: string, patch: Partial<Asset>) => upd({ assets: c.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) })
  const updMember = (id: string, patch: Partial<Member>) => upd({ members: c.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) })

  const start = async () => {
    setSubmitting(true)
    setSubmitErr(null)
    try {
      const res = await api.createSession(clean(c))
      nav(`/court/${res.session_id}`)
    } catch (e) {
      setSubmitErr((e as Error).message)
      setSubmitting(false)
    }
  }

  const children = c.members.filter((m) => ['son', 'daughter', 'stepchild'].includes(m.relation))
  const total = c.assets.reduce((s, a) => s + (Number(a.value) || 0), 0)
  const eligibleCount = preview?.shares.filter((s) => s.eligible && s.percent > 0).length ?? 0

  return (
    <div className="setup-shell min-h-full pb-40">
      <header className="relative z-20 border-b border-white/6 bg-ink-950/68 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1580px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[15px] border border-gold-400/35 bg-gold-500/10 shadow-[0_0_28px_rgba(214,162,78,.14)]">
              <Gavel className="relative z-10 text-gold-300" size={21} />
              <div className="absolute inset-x-1 top-0 h-px bg-gradient-to-r from-transparent via-gold-300/70 to-transparent" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-serif text-lg font-black tracking-[0.12em] text-ink-100 sm:text-xl">
                HeirArena <span className="text-gold-400">·</span> 遗产竞技场
              </h1>
              <p className="hidden text-[10px] font-semibold tracking-[0.16em] text-ink-400 sm:block">MULTI-AGENT ESTATE HEARING</p>
            </div>
          </div>

          <div className="mx-auto hidden items-center gap-3 xl:flex">
            {[
              ['01', '建立卷宗'],
              ['02', '多方辩论'],
              ['03', '依法裁决'],
            ].map(([n, label], i) => (
              <div key={n} className="flex items-center gap-3">
                <div className={`flex items-center gap-2 text-xs ${i === 0 ? 'text-gold-300' : 'text-ink-400'}`}>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full border font-mono text-[10px] ${i === 0 ? 'border-gold-500/50 bg-gold-500/12' : 'border-white/8'}`}>{n}</span>
                  {label}
                </div>
                {i < 2 && <div className="h-px w-8 bg-gradient-to-r from-white/12 to-white/4" />}
              </div>
            ))}
          </div>

          <div className="ml-auto shrink-0">
            <ModeBadge config={config} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1580px] px-4 pb-12 pt-5 sm:px-6 lg:px-8 lg:pt-7">
        <section className="relative overflow-hidden rounded-[1.6rem] border border-white/8 bg-[linear-gradient(135deg,rgba(31,28,25,.96),rgba(15,16,23,.97)_48%,rgba(17,14,23,.98))] p-6 shadow-[0_30px_100px_-55px_rgba(214,162,78,.45)] sm:p-8 lg:px-10 lg:py-9">
          <div className="pointer-events-none absolute -top-28 right-[12%] h-72 w-72 rounded-full bg-gold-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -right-24 -bottom-32 h-80 w-80 rounded-full bg-violet-500/8 blur-3xl" />
          <div className="pointer-events-none absolute inset-y-0 right-[34%] hidden w-px bg-gradient-to-b from-transparent via-white/8 to-transparent lg:block" />
          <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <div className="eyebrow"><Sparkles size={13} /> AI 家族博弈模拟器</div>
              <h2 className="mt-3 max-w-4xl font-serif text-3xl font-black leading-[1.2] tracking-tight text-ink-100 sm:text-4xl lg:text-[2.8rem]">
                写下身后事，见证一场
                <span className="gold-text"> 有法可依的家庭风暴</span>
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-300">
                配置人物、关系与遗产，AI 继承人会在虚拟听证庭中陈述、交锋和结盟；遗嘱执行官将依据《民法典》给出可追溯的裁决。
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {['多角色实时辩论', '民法典规则引擎', '可视化资产裁决'].map((text, i) => (
                  <span key={text} className="chip border-white/10 bg-black/20 px-2.5 py-1 text-ink-200">
                    <Check size={11} className={i === 1 ? 'text-emerald-300' : 'text-gold-300'} /> {text}
                  </span>
                ))}
              </div>
            </div>

            <div className="panel-inset rounded-2xl p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-semibold tracking-[0.18em] text-ink-400">CURRENT DOSSIER</div>
                  <div className="mt-1 text-sm font-semibold text-ink-100">{c.decedent_name || '未命名案件'}的遗产卷宗</div>
                </div>
                <FileText size={20} className="text-gold-400" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <HeroStat label="资产估值" value={`${total.toFixed(total >= 100 ? 0 : 1)} 万`} />
                <HeroStat label="出席角色" value={`${c.members.length} 位`} />
                <HeroStat label="辩论强度" value={`${c.rounds} 轮`} />
                <HeroStat label="法定继承人" value={preview ? `${eligibleCount} 位` : '计算中'} gold />
              </div>
              <div className="mt-4 flex items-center gap-2 text-[11px] text-ink-400">
                <span className={`h-1.5 w-1.5 rounded-full ${valid ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-amber-400'}`} />
                {valid ? '卷宗信息完整，可以开庭' : '请至少填写一项资产与一位出席者'}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <div className="eyebrow"><Sparkles size={13} /> 一键载入剧本</div>
              <h2 className="mt-1.5 font-serif text-xl font-bold text-ink-100">选择案件原型</h2>
            </div>
            <span className="hidden text-xs text-ink-400 sm:block">选择后仍可自由修改全部细节</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {PRESETS.map((p, i) => {
              const active = p.id === activePreset
              return (
                <button key={p.id} onClick={() => { setC(p.build()); setOpenMember(null); setActivePreset(p.id) }}
                  className={`group relative min-h-[142px] overflow-hidden rounded-2xl border p-4 text-left transition duration-200 hover:-translate-y-1 ${active
                    ? 'border-gold-500/60 bg-[linear-gradient(145deg,rgba(214,162,78,.14),rgba(18,19,26,.96)_62%)] shadow-[0_18px_45px_-24px_rgba(214,162,78,.7)]'
                    : 'border-white/7 bg-ink-850/80 hover:border-white/15 hover:bg-ink-800/80'}`}>
                  <div className="absolute top-3 right-3 font-mono text-[10px] tracking-widest text-ink-400">CASE {String(i + 1).padStart(2, '0')}</div>
                  <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl border text-xl transition group-hover:scale-105 ${active ? 'border-gold-400/35 bg-gold-500/12' : 'border-white/8 bg-white/[.025]'}`}>{p.emoji}</div>
                  <div className="flex items-center gap-2 font-semibold text-ink-100">
                    {p.title}
                    {active && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gold-400 text-ink-950"><Check size={10} strokeWidth={3} /></span>}
                  </div>
                  <div className="mt-1.5 text-xs leading-relaxed text-ink-300">{p.tagline}</div>
                  <div className={`absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent ${active ? 'via-gold-400/70' : 'via-white/10'} to-transparent`} />
                </button>
              )
            })}
          </div>
        </section>

        <section className="mt-6 grid items-start gap-5 2xl:grid-cols-[320px_minmax(0,1fr)_minmax(0,1.04fr)]">
          {/* basics */}
          <div className="panel-elevated space-y-5 p-5 2xl:sticky 2xl:top-4">
            <PanelHeading icon={<Landmark size={16} />} step="01" title="案件背景" subtitle="定义逝者与故事基础" />
            <label className="block text-xs font-medium text-ink-300">
              姓名 / 称呼
              <input className="input-base mt-1.5" value={c.decedent_name} onChange={(e) => upd({ decedent_name: e.target.value })} placeholder="例如：老王" />
            </label>
            <label className="block text-xs font-medium text-ink-300">
              剧情设定
              <span className="ml-1 font-normal text-ink-400">公开事实会成为辩论依据</span>
              <textarea className="input-base mt-1.5 min-h-[154px] resize-y leading-6" value={c.story} onChange={(e) => upd({ story: e.target.value })}
                placeholder="儿子五年没回家；女儿一直照顾我；我最爱那只猫……" />
            </label>
            <div className="space-y-2 text-xs font-medium text-ink-300">
              <div className="flex items-center justify-between">
                <span>辩论轮数</span>
                <span className="font-mono text-gold-300">{c.rounds} ROUNDS</span>
              </div>
              <div className="grid grid-cols-4 gap-1 rounded-xl border border-white/5 bg-black/25 p-1">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} onClick={() => upd({ rounds: n })}
                    className={`rounded-lg py-2 text-sm transition ${c.rounds === n ? 'bg-gold-500 font-bold text-ink-950 shadow-[0_4px_12px_rgba(214,162,78,.28)]' : 'text-ink-300 hover:bg-white/5 hover:text-ink-100'}`}>{n}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2 text-xs font-medium text-ink-300">
              <div className="flex items-center justify-between">
                <span>播放语速</span>
                <span className="font-mono text-gold-300">{c.speed}× SPEED</span>
              </div>
              <div className="grid grid-cols-4 gap-1 rounded-xl border border-white/5 bg-black/25 p-1">
                {[0.5, 1, 2, 4].map((n) => (
                  <button key={n} onClick={() => upd({ speed: n })}
                    className={`rounded-lg py-2 text-sm transition ${c.speed === n ? 'bg-gold-500 font-bold text-ink-950 shadow-[0_4px_12px_rgba(214,162,78,.28)]' : 'text-ink-300 hover:bg-white/5 hover:text-ink-100'}`}>{n}×</button>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-gold-500/15 bg-gold-500/[.045] p-3 text-xs leading-relaxed text-ink-300">
              <div className="mb-1 flex items-center gap-2 font-semibold text-gold-300"><Scale size={13} /> 法律提示</div>
              规则引擎会先析出夫妻共同财产，再按继承顺序、扶养义务与特殊情形计算参考份额。
            </div>
          </div>

          {/* assets */}
          <div className="panel-elevated p-4 sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <PanelHeading icon={<Wallet size={16} />} step="02" title="资产清单" subtitle={`${c.assets.length} 项资产 · 估值 ${total.toFixed(1)} 万`} />
              <button className="btn-ghost shrink-0" onClick={() => upd({ assets: [...c.assets, newAsset()] })}><Plus size={14} /> 添加资产</button>
            </div>
            <div className="space-y-2.5">
              {c.assets.map((a) => (
                <div key={a.id} className="group rounded-2xl border border-white/6 bg-black/20 p-3 transition hover:border-white/12 hover:bg-white/[.025]">
                  <div className="grid grid-cols-[86px_minmax(72px,1fr)_70px_26px] items-center gap-2 sm:grid-cols-[116px_minmax(100px,1fr)_92px_30px]">
                    <select aria-label="资产类型" className="input-base truncate px-2 py-2 text-xs" value={a.type} onChange={(e) => updAsset(a.id, { type: e.target.value as Asset['type'] })}>
                      {ASSET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
                    </select>
                    <input aria-label="资产名称" className="input-base min-w-0 py-2 text-xs" value={a.name} onChange={(e) => updAsset(a.id, { name: e.target.value })} placeholder="资产名称" />
                    <div className="relative">
                      <input aria-label="资产估值" className="input-base py-2 pr-6 text-right font-mono text-xs" type="number" min={0} value={a.value}
                        onChange={(e) => updAsset(a.id, { value: Number(e.target.value) })} />
                      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[9px] text-ink-400">万</span>
                    </div>
                    <button aria-label={`删除${a.name || '资产'}`} className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-400 transition hover:bg-red-400/10 hover:text-red-300" onClick={() => upd({ assets: c.assets.filter((x) => x.id !== a.id) })}><Trash2 size={14} /></button>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-300">
                    <Toggle checked={a.joint} onChange={(v) => updAsset(a.id, { joint: v })} label="夫妻共同" hint="第1153条：先析出一半归配偶" />
                    <Toggle checked={a.sentimental} onChange={(v) => updAsset(a.id, { sentimental: v })} label="纪念意义" />
                    <input aria-label="资产备注" className="input-base ml-auto min-w-[130px] flex-1 py-1.5 text-xs sm:max-w-[190px]" value={a.note} onChange={(e) => updAsset(a.id, { note: e.target.value })} placeholder="补充备注（可选）" />
                  </div>
                </div>
              ))}
              {c.assets.length === 0 && (
                <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 text-center">
                  <Wallet size={24} className="mb-2 text-ink-400" />
                  <div className="text-sm text-ink-300">资产清单还是空的</div>
                  <div className="mt-1 text-xs text-ink-400">添加至少一项资产才能开庭</div>
                </div>
              )}
            </div>
          </div>

          {/* members */}
          <div className="panel-elevated p-4 sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <PanelHeading icon={<Users size={16} />} step="03" title="出席角色" subtitle={`${c.members.length} 位家人与关系人`} />
              <button className="btn-ghost shrink-0" onClick={() => { const m = newMember(); upd({ members: [...c.members, m] }); setOpenMember(m.id) }}><Plus size={14} /> 添加角色</button>
            </div>
            <div className="space-y-2.5">
              {c.members.map((m) => {
                const share = preview?.shares.find((s) => s.member_id === m.id)
                const p = PERSONALITIES.find((x) => x.value === m.personality)
                const open = openMember === m.id
                const agent = memberAgent(m)
                return (
                  <div key={m.id} className="group rounded-2xl border border-white/6 bg-black/20 p-3 transition hover:border-white/12 hover:bg-white/[.025]" style={{ borderLeft: `3px solid ${p?.color ?? '#6d7588'}` }}>
                    <div className="flex gap-3">
                      <div className="relative hidden h-[66px] w-[56px] shrink-0 items-end justify-center overflow-hidden rounded-xl border border-white/8 bg-[radial-gradient(circle_at_50%_28%,rgba(255,255,255,.09),rgba(255,255,255,.015)_60%)] sm:flex">
                        <CharacterPortrait agent={agent} status="idle" size={48} petKind={/狗|犬|汪/.test(m.name) ? 'dog' : 'cat'} animated={false} />
                        <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: p?.color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="grid grid-cols-[minmax(70px,1fr)_92px_28px_28px] items-center gap-2 sm:grid-cols-[minmax(110px,1fr)_116px_30px_30px]">
                          <input aria-label="角色姓名" className="input-base min-w-0 py-2 text-xs" value={m.name} onChange={(e) => updMember(m.id, { name: e.target.value })} placeholder="姓名 / 昵称" />
                          <select aria-label="角色关系" className="input-base min-w-0 px-2 py-2 text-xs" value={m.relation} onChange={(e) => updMember(m.id, { relation: e.target.value as Member['relation'] })}>
                            {RELATIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                          <button aria-label={open ? '收起角色详情' : '展开角色详情'} className={`flex h-7 w-7 items-center justify-center rounded-lg text-ink-400 transition hover:bg-white/6 hover:text-ink-100 ${open ? 'rotate-180' : ''}`} onClick={() => setOpenMember(open ? null : m.id)}><ChevronDown size={16} /></button>
                          <button aria-label={`删除${m.name || '角色'}`} className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-400 transition hover:bg-red-400/10 hover:text-red-300" onClick={() => upd({ members: c.members.filter((x) => x.id !== m.id) })}><Trash2 size={14} /></button>
                        </div>
                        <div className="no-scrollbar mt-2 flex gap-1 overflow-x-auto pb-0.5">
                          {PERSONALITIES.map((pp) => (
                            <button key={pp.value} title={pp.desc} onClick={() => updMember(m.id, { personality: pp.value })}
                              className={`chip shrink-0 transition ${m.personality === pp.value ? 'border-transparent font-bold text-ink-950 shadow-sm' : 'text-ink-300 hover:border-white/20 hover:text-ink-100'}`}
                              style={m.personality === pp.value ? { background: pp.color } : undefined}>
                              {pp.emoji} {pp.label}
                            </button>
                          ))}
                        </div>
                        <div className="mt-2 flex min-w-0 items-center gap-2 text-[11px]">
                          <span className="truncate text-ink-400">{p?.desc}</span>
                          {share && (
                            <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 font-mono ${share.eligible && share.percent > 0 ? 'bg-gold-500/10 text-gold-300' : 'bg-white/[.035] text-ink-400'}`}>
                              {share.eligible && share.percent > 0 ? `法定 ${share.percent.toFixed(1)}%` : share.notes[0]?.slice(0, 16)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {open && (
                      <div className="mt-3 space-y-2.5 border-t border-white/7 pt-3">
                        <input className="input-base py-2 text-xs" value={m.wish} onChange={(e) => updMember(m.id, { wish: e.target.value })} placeholder="TA 最想要什么？例如：房子、老相册或那张沙发" />
                        {m.relation === 'grandchild' && (
                          <label className="block text-xs text-ink-300">
                            TA 的父 / 母是
                            <select className="input-base mt-1.5 py-2" value={m.parent_id ?? ''} onChange={(e) => updMember(m.id, { parent_id: e.target.value || null })}>
                              <option value="">（未指定）</option>
                              {children.map((ch) => <option key={ch.id} value={ch.id}>{ch.name || '(未命名)'}</option>)}
                            </select>
                          </label>
                        )}
                        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                          {FLAGS.map((f) => (
                            <label key={f.key} title={f.hint} className="flex cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-xs text-ink-300 transition hover:border-white/6 hover:bg-white/[.025]">
                              <input type="checkbox" className="accent-gold-500" checked={Boolean(m[f.key])} onChange={(e) => updMember(m.id, { [f.key]: e.target.checked } as Partial<Member>)} />
                              {f.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      </main>

      {/* sticky command bar */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/8 bg-ink-950/88 shadow-[0_-24px_80px_-48px_rgba(0,0,0,.95)] backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1580px] flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center lg:px-8">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold tracking-[0.14em] text-ink-400">
              <Scale size={12} className="text-gold-400" /> 法定参考份额 · 实时计算
              {previewErr && <span className="truncate font-normal tracking-normal text-red-300">{previewErr}</span>}
            </div>
            {preview ? (
              <div className="flex h-5 w-full max-w-[820px] overflow-hidden rounded-full border border-white/6 bg-ink-800 text-[10px] font-bold text-ink-950 shadow-inner">
                {preview.shares.filter((s) => s.percent > 0).map((s) => (
                  <div key={s.member_id} className="flex items-center justify-center overflow-hidden whitespace-nowrap border-r border-black/10 last:border-r-0"
                    style={{ width: `${s.percent}%`, background: PERSONALITIES.find((p) => p.value === c.members.find((m) => m.id === s.member_id)?.personality)?.color ?? '#9aa2b4' }}
                    title={`${s.name} ${s.percent}%`}>
                    {s.percent > 9 ? `${s.name} ${s.percent.toFixed(0)}%` : ''}
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-5 w-full max-w-[820px] animate-pulse rounded-full bg-ink-800" />
            )}
            {preview && (
              <div className="mt-1.5 truncate text-[11px] text-ink-400">
                遗产净额 <b className="text-ink-200">{preview.estate_total} 万</b>
                {preview.community_deduction > 0 && <> · 配偶先析产 {preview.community_deduction} 万</>}
                {' · '}适用第{preview.order_used === 1 ? '一' : preview.order_used === 2 ? '二' : '—'}顺序继承
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {submitErr && <span className="max-w-56 text-xs text-red-300">{submitErr}</span>}
            <button className="btn-gold min-w-[150px] flex-1 px-6 text-sm md:flex-none" disabled={!valid || submitting} onClick={start}>
              <Gavel size={17} /> {submitting ? '正在传唤…' : '进入听证庭'} {!submitting && <ArrowRight size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PanelHeading({ icon, step, title, subtitle }: { icon: ReactNode; step: string; title: string; subtitle: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold-500/20 bg-gold-500/8 text-gold-300">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] font-bold tracking-widest text-gold-400">{step}</span>
          <h2 className="font-serif text-base font-bold text-ink-100">{title}</h2>
        </div>
        <p className="truncate text-[11px] text-ink-400">{subtitle}</p>
      </div>
    </div>
  )
}

function HeroStat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-xl border border-white/6 bg-white/[.025] px-3 py-2.5">
      <div className="text-[10px] text-ink-400">{label}</div>
      <div className={`mt-0.5 font-mono text-sm font-bold ${gold ? 'text-gold-300' : 'text-ink-100'}`}>{value}</div>
    </div>
  )
}

function memberAgent(m: Member): AgentSpec {
  const personality = PERSONALITIES.find((p) => p.value === m.personality) ?? PERSONALITIES[0]
  const relation = RELATIONS.find((r) => r.value === m.relation)
  return {
    id: m.id,
    name: m.name,
    role: relation?.label ?? m.relation,
    relation: m.relation,
    personality: m.personality,
    personality_label: personality.label,
    title: personality.desc,
    color: personality.color,
    kind: m.relation === 'pet' ? 'pet' : m.relation === 'ai_twin' ? 'ai' : 'human',
    legal_percent: 0,
    eligible: true,
    wish: m.wish,
  }
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} title={hint} onClick={() => onChange(!checked)}
      className="flex items-center gap-1.5 rounded-md text-ink-300 outline-none transition hover:text-ink-100">
      <span className={`relative inline-block h-4 w-7 rounded-full transition ${checked ? 'bg-gold-500 shadow-[0_0_10px_rgba(214,162,78,.25)]' : 'bg-ink-600'}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all ${checked ? 'left-3.5' : 'left-0.5'}`} />
      </span>
      <span>{label}</span>
    </button>
  )
}

function ModeBadge({ config }: { config: ServerConfig | null }) {
  if (!config) return <span className="chip text-ink-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-300" /> 连接中</span>
  return config.mode === 'llm' ? (
    <span className="chip border-emerald-400/30 bg-emerald-400/5 px-2.5 py-1 text-emerald-300">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
      <span className="hidden sm:inline">大模型驱动 · {config.model}</span><span className="sm:hidden">AI 模式</span>
    </span>
  ) : (
    <span className="chip border-gold-500/30 bg-gold-500/5 px-2.5 py-1 text-gold-300" title="在 backend/.env 里配置 LLM_API_KEY 即可切换为真实大模型">
      <span className="h-1.5 w-1.5 rounded-full bg-gold-400 shadow-[0_0_8px_rgba(233,190,111,.7)]" />
      <span className="hidden sm:inline">剧本演示模式</span><span className="sm:hidden">演示</span>
    </span>
  )
}

function clean(c: CaseInput): CaseInput {
  return {
    ...c,
    assets: c.assets.filter((a) => a.name.trim()).map((a) => ({ ...a, value: Number(a.value) || 0 })),
    members: c.members.filter((m) => m.name.trim()),
  }
}
