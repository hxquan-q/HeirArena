import { PxlKitIcon } from '@pxlkit/core'
import { CheckCircle, Sparkles, WarningTriangle } from '@pxlkit/feedback'
import { Scroll, SpellBook } from '@pxlkit/gamification'
import { UserGroup } from '@pxlkit/social'
import { Package, Robot, Upload } from '@pxlkit/ui'
import { PixelAlert, PixelChip, PixelChipGroup, PixelProgress, PixelSegmented, PixelStepper, PixelTypewriter } from '@pxlkit/ui-kit'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, BookOpen, ClipboardPaste, FileText, RotateCcw, Target, Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type CaseParseResult, type ServerConfig } from '../api/client'
import ModelSelect from '../components/ModelSelect'
import ProviderManager from '../components/ProviderManager'
import SafeVoxelStage from '../components/scene3d/SafeVoxelStage'
import { ShareBar } from '../components/ui/CourtRecord'
import TopBar from '../components/ui/TopBar'
import { ASSET_EMOJI, PERSONALITY_MAP, RELATION_LABEL } from '../data/presets'
import { describeRef, useProviders } from '../hooks/useProviders'
import { isSeatable, useCaseDraft } from '../store/useCaseDraft'
import type { Member, ModelRef } from '../types'

const MAX_FILE_BYTES = 300 * 1024
const MAX_CONTENT_CHARS = 100_000
const MIN_CONTENT_CHARS = 10
const ALLOWED_EXTENSIONS = ['.md', '.markdown', '.txt']

/* 空状态不该只是一句提示：给一份能直接解析的样例，一键装入 */
const SAMPLE_CASE = `# 老周的身后事

老周，68 岁，退休中学教师，上个月心梗离世，没有留下遗嘱。

## 家庭
- 妻子 赵阿姨，62 岁，与老周结婚三十年，一直同住，退休金不高。
- 长子 周明，40 岁，在深圳做生意，近八年只回过两次家，父亲住院期间没有露面。
- 女儿 周晓，36 岁，辞去工作照顾父亲最后两年，垫付了大部分医疗费。
- 孙子 小周（周明之子），15 岁，寒暑假都在爷爷家。
- 保姆 王姐，照顾老周五年，工资多年未涨。
- 一只叫「煤球」的黑猫，老周每天遛它。

## 财产
- 学区房一套，市值约 520 万，登记在老周与赵阿姨名下（婚后购买）。
- 银行存款 86 万。
- 一辆开了六年的本田，约 6 万。
- 老周父亲留下的紫砂壶一把，估值 3 万，周晓从小就喜欢。
- 黑猫煤球。

## 争议
周明主张房子应当卖掉平分；周晓认为自己尽了主要赡养义务应当多分；赵阿姨只想继续住在房子里；保姆王姐希望能拿到一笔补偿。
`

const FLAG_LABEL: Partial<Record<keyof Member, string>> = {
  main_support: '主要扶养',
  cohabit: '共同生活',
  hardship: '生活困难',
  neglect: '未尽扶养',
  dependency: '有扶养关系',
  deceased: '已故',
  disqualified: '丧失继承权',
}

type ImportMode = 'file' | 'paste'

interface LoadedSource {
  name: string
  content: string
  bytes: number
}

export default function ImportPage() {
  const nav = useNavigate()
  const [config, setConfig] = useState<ServerConfig | null>(null)
  const [showProviders, setShowProviders] = useState(false)
  const { providers, presets, refresh } = useProviders()
  const draft = useCaseDraft((s) => s.c)
  const applyParsed = useCaseDraft((s) => s.applyParsed)
  const enterSeat = useCaseDraft((s) => s.enterSeat)
  const [seatPick, setSeatPick] = useState<string | null>(null)

  const [mode, setMode] = useState<ImportMode>('file')
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<LoadedSource | null>(null)
  const [draftText, setDraftText] = useState('')
  const [modelOverride, setModelOverride] = useState<ModelRef | null>(null)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CaseParseResult | null>(null)

  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(null))
  }, [])

  const onProvidersChanged = async () => {
    await refresh()
    api.config().then(setConfig).catch(() => {})
  }

  const suggested = draft.executor_model ?? draft.default_model ?? config?.default_model ?? null
  const inheritedModel = suggested?.provider_id === 'mock' ? null : suggested
  const effectiveModel = modelOverride ?? inheritedModel
  const hasReadyModel = !!effectiveModel || providers.some((p) => p.ready && p.models.length > 0)
  const modelLabel = describeRef(effectiveModel, providers, '自动选择首个可用模型')

  const trimmed = draftText.trim()
  const activeSource: LoadedSource | null = mode === 'file'
    ? file
    : trimmed.length >= MIN_CONTENT_CHARS
      ? { name: 'pasted-case.md', content: trimmed, bytes: new TextEncoder().encode(trimmed).length }
      : null

  const stepIndex = result ? 2 : activeSource ? 1 : 0

  const resetResult = () => { setResult(null); setError(null); setSeatPick(null) }

  const loadFile = async (candidate?: File) => {
    resetResult()
    if (!candidate) return
    const reject = (message: string) => { setFile(null); setError(message) }
    const lower = candidate.name.toLowerCase()
    if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) return reject('只支持 UTF-8 编码的 .md、.markdown 或 .txt 文件')
    if (candidate.size > MAX_FILE_BYTES) return reject('文件过大，请控制在 300 KB 以内')
    try {
      const content = await candidate.text()
      if (content.trim().length < MIN_CONTENT_CHARS) return reject(`案情内容太短，至少需要 ${MIN_CONTENT_CHARS} 个字符`)
      if (content.length > MAX_CONTENT_CHARS) return reject('案情正文过长，请控制在 10 万字符以内')
      setFile({ name: candidate.name, content, bytes: candidate.size })
    } catch {
      reject('读取文件失败，请确认文件是 UTF-8 文本')
    }
  }

  const loadSample = () => {
    setMode('paste')
    setDraftText(SAMPLE_CASE)
    resetResult()
  }

  const parse = async () => {
    if (!activeSource || !hasReadyModel || parsing) return
    setParsing(true)
    setError(null)
    setResult(null)
    try {
      setSeatPick(null)
      setResult(await api.parseCase(activeSource.content, activeSource.name, effectiveModel))
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setParsing(false)
    }
  }

  const commit = () => {
    if (!result) return
    applyParsed(result)
    nav('/setup')
  }

  const commitSeat = () => {
    if (!result || !seatPick) return
    applyParsed(result)
    enterSeat(seatPick)
    nav('/setup?chapter=seat')
  }

  return (
    <div className="import-shell min-h-full pb-16">
      <TopBar
        config={config}
        providers={providers}
        onManageProviders={() => setShowProviders(true)}
        leading={
          <Link to="/" className="btn-ghost h-9 shrink-0 px-2.5" title="回大厅">
            <ArrowLeft size={13} /> <span className="hidden sm:inline">大厅</span>
          </Link>
        }
        center={<span className="chip ml-3 text-ink-300"><PxlKitIcon icon={SpellBook} size={12} /> AI 读案建卷</span>}
      />

      <main className="mx-auto w-full max-w-[1400px] px-3 pt-6 sm:px-5 lg:pt-8">
        {/* 页头：法典 + 标题 + 三步流程 */}
        <section className="grid items-center gap-5 lg:grid-cols-[168px_minmax(0,1fr)]">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
            className="panel-elevated relative mx-auto flex h-[168px] w-[168px] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_55%,rgba(165,139,255,.2),transparent_62%)]">
            <div className="scanlines pointer-events-none absolute inset-0 z-10 opacity-60" />
            <div className="pixel-text absolute top-2 left-2.5 text-[12px] tracking-[0.12em] text-ghost-300">CODEX</div>
            <SafeVoxelStage
              icon={SpellBook}
              size={128}
              spin={0.5}
              bob={0.06}
              glow="rgba(165,139,255,.32)"
              fallbackLabel="案情法典图腾"
            />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }} className="min-w-0">
            <div className="eyebrow"><PxlKitIcon icon={Robot} size={12} appearance="solid" color="#e2b25a" /> AI CASE READER</div>
            <h1 className="pixel-text mt-3 text-[28px] leading-[1.15] text-ink-100 sm:text-[34px]">
              把案情丢给执行官，<span className="gold-text">先读一遍</span>再开庭
            </h1>
            <p className="mt-3 max-w-[640px] text-[14px] leading-7 text-ink-300">
              上传 Markdown 或直接粘贴案情，模型负责抽取人物、关系、资产与公开事实；金额、枚举和法律字段会再经后端规则校验。
              解析结果先在这里预览，你确认后才写进卷宗。
            </p>
            <div className="mt-5 max-w-[720px]">
              <PixelStepper active={stepIndex} size="sm" ariaLabel="读案流程">
                <PixelStepper.Step label="放入案情" description={activeSource ? `${activeSource.name} · ${activeSource.content.length.toLocaleString()} 字` : '上传或粘贴'} completed={!!activeSource} />
                <PixelStepper.Step label="选择模型解析" description={parsing ? '执行官阅卷中' : result ? result.model_label : modelLabel} loading={parsing} completed={!!result} error={!!error && !result} />
                <PixelStepper.Step label="确认回填卷宗" description={result ? `${result.case.members.length} 角色 · ${result.case.assets.length} 资产` : '预览后进入卷宗'} />
              </PixelStepper>
            </div>
          </motion.div>
        </section>

        <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* 左：案情原文 */}
          <div className="min-w-0 space-y-5">
            <div className="panel-elevated relative p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-gold-600 bg-ink-950 text-gold-300 shadow-[2px_2px_0_rgba(0,0,0,.55)]">
                    <FileText size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="pixel-text text-[12px] text-gold-400">01</span>
                      <h2 className="pixel-text text-[16px] text-ink-100">案情原文</h2>
                    </div>
                    <p className="truncate text-[11px] text-ink-400">.md / .markdown / .txt · 最大 300 KB · 至少 {MIN_CONTENT_CHARS} 个字符</p>
                  </div>
                </div>
                <PixelSegmented
                  value={mode}
                  options={[
                    { value: 'file', label: '上传文件' },
                    { value: 'paste', label: '粘贴文本' },
                  ]}
                  onChange={(v) => { setMode(v as ImportMode); resetResult() }}
                  tone="gold"
                  aria-label="案情来源"
                />
              </div>

              {mode === 'file' ? (
                <label
                  onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => { event.preventDefault(); setDragging(false); void loadFile(event.dataTransfer.files[0]) }}
                  className={`relative flex min-h-[280px] cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed px-6 py-8 text-center transition ${
                    dragging ? 'border-gold-400 bg-gold-600/10' : file ? 'border-jade-500 bg-jade-700/10' : 'border-ink-600 bg-ink-950 hover:border-gold-600'
                  } ${parsing ? 'pointer-events-none opacity-60' : ''}`}>
                  <input
                    className="sr-only"
                    type="file"
                    accept=".md,.markdown,.txt,text/markdown,text/plain"
                    disabled={parsing}
                    onChange={(event) => { void loadFile(event.target.files?.[0]); event.target.value = '' }}
                  />
                  <span className={`flex h-16 w-16 items-center justify-center border-2 shadow-[3px_3px_0_rgba(0,0,0,.55)] ${file ? 'border-jade-700 bg-jade-700/20' : 'border-ink-600 bg-ink-900'}`}>
                    {file
                      ? <PxlKitIcon icon={CheckCircle} size={30} appearance="solid" color="#7fd9ad" aria-hidden />
                      : <span className={dragging ? 'animate-bob inline-flex' : 'animate-float inline-flex'}><PxlKitIcon icon={Upload} size={30} appearance="solid" color="#e2b25a" aria-hidden /></span>}
                  </span>
                  {file ? (
                    <>
                      <span className="pixel-text max-w-full truncate text-[16px] text-ink-100">{file.name}</span>
                      <span className="text-[12px] text-jade-300">{(file.bytes / 1024).toFixed(1)} KB · {file.content.length.toLocaleString()} 字符 · 已读入</span>
                      <span className="text-[11px] text-ink-400">再拖一个进来可以替换</span>
                    </>
                  ) : (
                    <>
                      <span className="pixel-text text-[16px] text-ink-100">{dragging ? '松手，把案情投进卷宗' : '把案情文件拖到这里，或点击选择'}</span>
                      <span className="text-[12px] text-ink-400">支持 Markdown 与纯文本 · UTF-8 编码 · 最大 300 KB</span>
                    </>
                  )}
                </label>
              ) : (
                <label className="block">
                  <span className="mb-2 flex items-center justify-between gap-2 text-xs text-ink-300">
                    <span className="flex items-center gap-1.5"><ClipboardPaste size={14} className="text-ghost-300" /> 直接粘贴 Markdown / 纯文本案情</span>
                    <span className="pixel-text text-[12px] text-ink-400">{trimmed.length.toLocaleString()} 字</span>
                  </span>
                  <textarea
                    className="input-base min-h-[320px] resize-y font-mono text-[13px] leading-6"
                    value={draftText}
                    disabled={parsing}
                    placeholder={'# 案件标题\n\n谁走了、留下了什么、家里有哪些人、谁照顾过谁、谁在争什么……\n\n写得越具体，角色的性格与法律事实就越准。'}
                    onChange={(event) => { setDraftText(event.target.value); resetResult() }}
                  />
                </label>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-400">
                <span>{activeSource ? `将按 ${activeSource.name} 解析` : '还没有案情。没有现成材料？'}</span>
                <button type="button" className="btn-ghost h-8 px-2.5" onClick={loadSample} disabled={parsing}>
                  <Wand2 size={12} /> 装入示例案情
                </button>
              </div>

              {/* 阅卷中的遮罩 */}
              <AnimatePresence>
                {parsing && (
                  <motion.div key="parsing" className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-ink-950/85 p-6 text-center"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <span className="animate-float inline-flex"><PxlKitIcon icon={Scroll} size={40} appearance="palette" aria-hidden /></span>
                    <PixelTypewriter text="执行官正在翻阅卷宗，抽取人物、关系、资产与公开事实……" speed={28} cursor tone="gold" className="pixel-text max-w-[420px] text-[14px] text-gold-300" />
                    <div className="w-full max-w-[320px]">
                      <PixelProgress value={0} indeterminate tone="gold" label="解析进度" />
                    </div>
                    <span className="text-[11px] text-ink-400">用的是 {modelLabel}，通常十几秒。</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {error && (
              <PixelAlert tone="red" title="没读进去" message={error} icon={<PxlKitIcon icon={WarningTriangle} size={16} />} live="assertive" />
            )}

            {/* 抽取预览：角色 + 资产 */}
            <AnimatePresence>
              {result && (
                <motion.div key="preview" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.3 }}
                  className="panel-elevated p-4 sm:p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-jade-700 bg-ink-950 text-jade-300 shadow-[2px_2px_0_rgba(0,0,0,.55)]">
                      <PxlKitIcon icon={CheckCircle} size={16} appearance="solid" color="#7fd9ad" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="pixel-text text-[12px] text-jade-300">02</span>
                        <h2 className="pixel-text text-[16px] text-ink-100">执行官读到了这些</h2>
                      </div>
                      <p className="truncate text-[11px] text-ink-400">
                        逝者 <b className="text-ink-200">{result.case.decedent_name || '未命名'}</b> · 由 {result.model_label} 抽取 · 回填后仍可逐项修改
                      </p>
                    </div>
                  </div>

                  {result.case.story && (
                    <blockquote className="panel-inset mb-4 p-3 text-[12px] leading-relaxed text-ink-300">
                      <span className="pixel-text mr-1.5 text-[12px] text-gold-400">公开事实</span>{result.case.story}
                    </blockquote>
                  )}

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <div className="pixel-text mb-2 flex items-center gap-1.5 text-[12px] text-ink-300">
                        <PxlKitIcon icon={UserGroup} size={12} /> 出场角色 · {result.case.members.length}
                      </div>
                      <p className="mb-2 text-[11px] leading-relaxed text-ink-400">
                        想从某个人的视角推演？选一位，再点右侧「以此视角入局」
                      </p>
                      <PixelChipGroup
                        multiple={false}
                        value={seatPick ? [seatPick] : []}
                        onChange={(ids) => setSeatPick(ids[0] ?? null)}
                        aria-label="选择入局视角"
                      >
                        <ul className="space-y-1.5">
                          {result.case.members.map((m) => {
                            const p = PERSONALITY_MAP[m.personality]
                            const flags = (Object.keys(FLAG_LABEL) as (keyof Member)[]).filter((k) => Boolean(m[k]))
                            const mine = seatPick === m.id
                            const canSit = isSeatable(m)
                            return (
                              <li
                                key={m.id}
                                className={`panel-inset flex flex-wrap items-center gap-1.5 px-2.5 py-2 text-xs ${mine ? 'border-gold-400 bg-gold-600/10' : ''}`}
                                style={{ borderLeft: `4px solid ${p?.color ?? '#a08d78'}` }}
                              >
                                <span className="font-bold text-ink-100">{m.name}</span>
                                <span className="text-ink-400">{RELATION_LABEL[m.relation] ?? m.relation}</span>
                                {p && <span className="chip border-ink-950 text-ink-950" style={{ background: p.color }}>{p.emoji} {p.label}</span>}
                                {flags.map((k) => <span key={k} className="chip text-ink-300">{FLAG_LABEL[k]}</span>)}
                                {canSit && (
                                  <PixelChip label="这是我" value={m.id} tone={mine ? 'gold' : 'neutral'} size="sm" />
                                )}
                                {m.wish && <span className="ml-auto truncate text-[11px] text-ink-400" title={m.wish}>想要：{m.wish}</span>}
                              </li>
                            )
                          })}
                        </ul>
                      </PixelChipGroup>
                    </div>
                    <div>
                      <div className="pixel-text mb-2 flex items-center gap-1.5 text-[12px] text-ink-300">
                        <PxlKitIcon icon={Package} size={12} /> 遗产清单 · {result.case.assets.length}
                      </div>
                      <ul className="space-y-1.5">
                        {result.case.assets.map((a) => (
                          <li key={a.id} className="panel-inset flex items-center gap-2 px-2.5 py-2 text-xs">
                            <span className="text-base leading-none" aria-hidden>{ASSET_EMOJI[a.type]}</span>
                            <span className="min-w-0 flex-1 truncate font-bold text-ink-100">{a.name}</span>
                            {a.joint && <span className="chip text-[11px] text-sky-300">夫妻共同</span>}
                            {a.sentimental && <span className="chip text-[11px] text-pink-300">纪念</span>}
                            <span className="pixel-text shrink-0 text-[12px] text-gold-300">{a.value} 万</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3">
                        <div className="pixel-text mb-1.5 flex items-center justify-between text-[12px] text-ink-400">
                          <span>法定参考份额</span>
                          <span>净额 {result.legal.estate_total} 万</span>
                        </div>
                        <ShareBar preview={result.legal} previewErr={null} members={result.case.members} />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 右：解析设置 + 结果操作 */}
          <aside className="min-w-0">
            <div className="space-y-4 xl:sticky xl:top-4">
              <div className="panel-elevated p-4">
                <div className="mb-3 flex items-center gap-2">
                  <PxlKitIcon icon={Robot} size={14} appearance="solid" color="#e2b25a" />
                  <h2 className="pixel-text text-[14px] text-ink-100">解析模型</h2>
                </div>
                <ModelSelect
                  value={modelOverride}
                  onChange={(ref) => { setModelOverride(ref); resetResult() }}
                  providers={providers}
                  inheritLabel={`跟随执行官（${describeRef(inheritedModel, providers, '自动选择首个可用模型')}）`}
                  allowMock={false}
                  disabled={parsing}
                />
                <button className="btn-gold mt-3 w-full justify-center" disabled={!activeSource || !hasReadyModel || parsing} onClick={() => void parse()}>
                  <PxlKitIcon icon={Sparkles} size={14} appearance="solid" color="#1b1205" />
                  {parsing ? '阅卷中…' : result ? '重新解析' : '开始解析'}
                </button>
                {!hasReadyModel ? (
                  <button className="pixel-text mt-2 w-full text-center text-[12px] text-gold-300 hover:underline" onClick={() => setShowProviders(true)}>
                    还没有可用模型 · 先接入一个供应商
                  </button>
                ) : (
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
                    {activeSource ? '模型只做抽取，不会替你判案；结果会再经规则引擎校验。' : '先在左侧放入案情。'}
                  </p>
                )}
              </div>

              <AnimatePresence mode="wait">
                {result ? (
                  <motion.div key="commit" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="panel-elevated p-4">
                    <div className="pixel-text mb-2 text-[12px] text-jade-300">解析完成</div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <Stat label="资产" value={String(result.case.assets.length)} />
                      <Stat label="角色" value={String(result.case.members.length)} />
                      <Stat label="待确认" value={String(result.warnings.length)} warn={result.warnings.length > 0} />
                    </div>
                    {result.warnings.length > 0 ? (
                      <details className="mt-3 text-xs">
                        <summary className="cursor-pointer text-gold-300">{result.warnings.length} 项需要人工确认</summary>
                        <ul className="mt-1.5 space-y-1 pl-4 text-ink-300">
                          {result.warnings.map((w) => <li key={w} className="list-disc leading-relaxed">{w}</li>)}
                        </ul>
                      </details>
                    ) : (
                      <p className="mt-3 text-[11px] text-ink-400">未发现结构缺失；开庭前仍建议核对金额、关系与法律事实标签。</p>
                    )}
                    <button className="btn-gold mt-3 w-full justify-center" onClick={commit}>
                      <BookOpen size={15} /> 回填卷宗，去核对 <ArrowRight size={14} />
                    </button>
                    <button className="btn-gold mt-2 w-full justify-center" disabled={!seatPick} onClick={commitSeat}>
                      <Target size={15} /> 以此视角入局 <ArrowRight size={14} />
                    </button>
                    <button className="btn-ghost mt-2 w-full justify-center" onClick={resetResult}>
                      <RotateCcw size={13} /> 放弃这次结果
                    </button>
                  </motion.div>
                ) : (
                  <motion.div key="howto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="panel-inset p-4 text-[12px] leading-relaxed text-ink-300">
                    <div className="pixel-text mb-2 flex items-center gap-1.5 text-[12px] text-ink-200"><PxlKitIcon icon={Upload} size={12} /> 写什么最有用</div>
                    <ul className="space-y-1">
                      <li>· 逝者是谁、有没有遗嘱</li>
                      <li>· 每位家人的关系与谁照顾过谁</li>
                      <li>· 财产名称、估值、是否婚后共同财产</li>
                      <li>· 谁在争什么——这决定角色的性格</li>
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </aside>
        </section>
      </main>

      <ProviderManager open={showProviders} onClose={() => setShowProviders(false)} providers={providers} presets={presets} onChanged={onProvidersChanged} />
    </div>
  )
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="panel-inset px-2 py-2">
      <div className={`pixel-text text-[20px] leading-none ${warn ? 'text-gold-300' : 'text-ink-100'}`}>{value}</div>
      <div className="mt-1 text-[10px] text-ink-400">{label}</div>
    </div>
  )
}
