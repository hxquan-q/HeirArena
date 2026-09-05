import { AlertTriangle, CheckCircle2, ClipboardPaste, FileText, LoaderCircle, Sparkles, Upload } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { api, type CaseParseResult } from '../api/client'
import { describeRef } from '../hooks/useProviders'
import type { ModelRef, Provider } from '../types'
import ModelSelect from './ModelSelect'

const MAX_FILE_BYTES = 300 * 1024
const MAX_CONTENT_CHARS = 100_000
const ALLOWED_EXTENSIONS = ['.md', '.markdown', '.txt']

interface Props {
  providers: Provider[]
  suggestedModel: ModelRef | null
  onParsed: (result: CaseParseResult) => void
  onManageProviders: () => void
}

interface LoadedSource {
  name: string
  content: string
  bytes: number
}

type ImportMode = 'file' | 'paste'

export default function CaseImport({ providers, suggestedModel, onParsed, onManageProviders }: Props) {
  const [mode, setMode] = useState<ImportMode>('file')
  const [file, setFile] = useState<LoadedSource | null>(null)
  const [draft, setDraft] = useState('')
  const [modelOverride, setModelOverride] = useState<ModelRef | null>(null)
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CaseParseResult | null>(null)

  const inheritedModel = suggestedModel?.provider_id === 'mock' ? null : suggestedModel
  const effectiveModel = modelOverride ?? inheritedModel
  const hasReadyModel = !!effectiveModel || providers.some((p) => p.ready && p.models.length > 0)
  const suggestedLabel = describeRef(inheritedModel, providers, '自动选择首个可用模型')

  const activeSource: LoadedSource | null = mode === 'file'
    ? file
    : draft.trim().length >= 10
      ? { name: 'pasted-case.md', content: draft.trim(), bytes: new TextEncoder().encode(draft.trim()).length }
      : null

  const loadFile = async (candidate?: File) => {
    if (!candidate) return
    setError(null)
    setResult(null)
    const lower = candidate.name.toLowerCase()
    if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      setFile(null)
      setError('只支持 UTF-8 编码的 .md、.markdown 或 .txt 文件')
      return
    }
    if (candidate.size > MAX_FILE_BYTES) {
      setFile(null)
      setError('文件过大，请控制在 300 KB 以内')
      return
    }
    try {
      const content = await candidate.text()
      if (content.trim().length < 10) {
        setFile(null)
        setError('案情内容太短，至少需要 10 个字符')
        return
      }
      if (content.length > MAX_CONTENT_CHARS) {
        setFile(null)
        setError('案情正文过长，请控制在 10 万字符以内')
        return
      }
      setFile({ name: candidate.name, content, bytes: candidate.size })
    } catch {
      setFile(null)
      setError('读取文件失败，请确认文件是 UTF-8 文本')
    }
  }

  const drop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setDragging(false)
    void loadFile(event.dataTransfer.files[0])
  }

  const parse = async () => {
    if (!activeSource || !hasReadyModel) return
    setParsing(true)
    setError(null)
    setResult(null)
    try {
      const parsed = await api.parseCase(activeSource.content, activeSource.name, effectiveModel)
      setResult(parsed)
      onParsed(parsed)
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setParsing(false)
    }
  }

  return (
    <section className="relative mt-6 overflow-hidden rounded-2xl border border-violet-400/18 bg-[linear-gradient(135deg,rgba(65,42,92,.15),rgba(17,18,26,.92)_55%)] p-4 sm:p-5">
      <div className="pointer-events-none absolute -top-16 right-10 h-32 w-32 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,.9fr)] lg:items-center">
        <div>
          <div className="eyebrow"><Sparkles size={13} /> AI 读取案情</div>
          <div className="mt-2 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-400/25 bg-violet-500/10 text-violet-200">
              <FileText size={19} />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-ink-100">上传 Markdown，自动建立卷宗和角色</h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-400">
                模型只负责抽取人物、关系、资产、公开事实与角色方向；枚举、金额和法律字段会再经过后端规则校验。
                解析结果只回填设置页，仍由你确认后开庭。
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {([
              ['file', '上传文件', Upload],
              ['paste', '粘贴文本', ClipboardPaste],
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  mode === value
                    ? 'border-violet-300/45 bg-violet-400/12 text-violet-100'
                    : 'border-white/10 bg-black/20 text-ink-400 hover:border-white/18 hover:text-ink-200'
                }`}
                onClick={() => {
                  setMode(value)
                  setError(null)
                  setResult(null)
                }}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(190px,.8fr)] lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(210px,.8fr)]">
          {mode === 'file' ? (
          <label
            onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
            className={`flex min-h-24 cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 transition ${
              dragging ? 'border-violet-300 bg-violet-400/10' : file ? 'border-emerald-400/35 bg-emerald-400/5' : 'border-white/14 bg-black/20 hover:border-violet-300/45'
            }`}
          >
            <input
              className="hidden"
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              onChange={(event) => {
                void loadFile(event.target.files?.[0])
                event.target.value = ''
              }}
            />
            {file ? <CheckCircle2 className="shrink-0 text-emerald-300" size={20} /> : <Upload className="shrink-0 text-violet-200" size={20} />}
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink-100">{file?.name ?? '点击选择或拖入案情文件'}</span>
              <span className="mt-0.5 block text-[11px] text-ink-400">
                {file ? `${(file.bytes / 1024).toFixed(1)} KB · ${file.content.length.toLocaleString()} 字符` : '.md / .markdown / .txt · 最大 300 KB'}
              </span>
            </span>
          </label>
          ) : (
          <label className="block min-h-24 rounded-xl border border-dashed border-white/14 bg-black/20 px-4 py-3">
            <span className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink-300">
              <ClipboardPaste className="text-violet-200" size={15} />
              直接粘贴 Markdown / 纯文本案情
            </span>
            <textarea
              className="input-base min-h-[92px] resize-y text-sm leading-6"
              value={draft}
              placeholder="粘贴案情摘要、人物关系、资产清单与争议焦点……至少 10 个字符"
              onChange={(event) => {
                setDraft(event.target.value)
                setError(null)
                setResult(null)
              }}
            />
            <span className="mt-1 block text-[11px] text-ink-400">
              {draft.trim().length > 0
                ? `${draft.trim().length.toLocaleString()} 字符 · 将按 pasted-case.md 解析`
                : '也可参考 demo/sample-case.md 示例'}
            </span>
          </label>
          )}

          <div className="rounded-xl border border-white/7 bg-black/20 p-3">
            <label className="block text-xs text-ink-300">
              解析模型
              <ModelSelect
                className="mt-1.5"
                value={modelOverride}
                onChange={setModelOverride}
                providers={providers}
                inheritLabel={`跟随执行官（${suggestedLabel}）`}
                allowMock={false}
                disabled={parsing}
              />
            </label>
            <button className="btn-gold mt-2.5 w-full justify-center text-xs" disabled={!activeSource || !hasReadyModel || parsing} onClick={() => void parse()}>
              {parsing ? <LoaderCircle className="animate-spin" size={14} /> : <Sparkles size={14} />}
              {parsing ? '正在读取案情…' : '解析并回填设置'}
            </button>
            {!hasReadyModel && (
              <button className="mt-2 w-full text-center text-[11px] text-gold-300 hover:underline" onClick={onManageProviders}>
                请先配置一个模型供应商
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="relative mt-3 flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-500/5 px-3 py-2 text-xs text-red-200">
          <AlertTriangle className="mt-0.5 shrink-0" size={13} /> {error}
        </div>
      )}

      {result && (
        <div className="relative mt-3 rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-3 py-2 text-xs text-ink-300">
          <div className="font-semibold text-emerald-300">
            已用 {result.model_label} 生成设置：{result.case.assets.length} 项资产、{result.case.members.length} 位角色
          </div>
          {result.warnings.length > 0 ? (
            <details className="mt-1.5">
              <summary className="cursor-pointer text-amber-200">有 {result.warnings.length} 项需要人工确认</summary>
              <ul className="mt-1.5 space-y-1 pl-4 text-ink-300">
                {result.warnings.map((warning) => <li key={warning} className="list-disc">{warning}</li>)}
              </ul>
            </details>
          ) : (
            <div className="mt-1 text-ink-400">未发现结构缺失；开庭前仍建议检查金额、关系和法律事实标签。</div>
          )}
        </div>
      )}
    </section>
  )
}
