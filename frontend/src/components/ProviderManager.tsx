import { CheckCircle2, Download, KeyRound, Loader2, Plug, Plus, RefreshCw, Trash2, X, XCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { api, type ProviderTestResult } from '../api/client'
import type { Provider, ProviderPreset } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  providers: Provider[]
  presets: ProviderPreset[]
  onChanged: () => Promise<void> | void
}

interface Draft {
  id: string | null
  preset: string
  name: string
  base_url: string
  api_key: string
  models: string
}

const emptyDraft = (preset: ProviderPreset | undefined): Draft => ({
  id: null, preset: preset?.id ?? 'custom', name: preset?.name ?? '', base_url: preset?.base_url ?? '',
  api_key: '', models: (preset?.models ?? []).join(', '),
})

export default function ProviderManager({ open, onClose, providers, presets, onChanged }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div className="panel-wood flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden bg-ink-800"
            initial={{ y: 24, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 16, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
            {/* 表单状态放在只在打开时挂载的子组件里，关闭即自然重置 */}
            <ManagerBody onClose={onClose} providers={providers} presets={presets} onChanged={onChanged} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ManagerBody({ onClose, providers, presets, onChanged }: Omit<Props, 'open'>) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, ProviderTestResult | { error: string }>>({})
  const [error, setError] = useState<string | null>(null)
  const presetMap = useMemo(() => Object.fromEntries(presets.map((p) => [p.id, p])), [presets])

  const startNew = (presetId: string) => {
    setDraft(emptyDraft(presetMap[presetId] ?? presets.find((p) => p.id === 'custom')))
    setError(null)
  }
  const startEdit = (p: Provider) => {
    setDraft({ id: p.id, preset: p.preset, name: p.name, base_url: p.base_url, api_key: '', models: p.models.join(', ') })
    setError(null)
  }

  const save = async () => {
    if (!draft) return
    const body = {
      name: draft.name.trim(), base_url: draft.base_url.trim(), preset: draft.preset,
      api_key: draft.api_key.trim() || undefined,
      models: draft.models.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean),
    }
    if (!body.name || !body.base_url) {
      setError('名称和 Base URL 不能为空')
      return
    }
    setBusy('save')
    try {
      if (draft.id) await api.updateProvider(draft.id, body)
      else await api.createProvider(body)
      await onChanged()
      setDraft(null)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const remove = async (p: Provider) => {
    if (!confirm(`删除供应商「${p.name}」？已分配给角色的模型会回退到默认。`)) return
    setBusy(`del:${p.id}`)
    try {
      await api.deleteProvider(p.id)
      await onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const test = async (p: Provider) => {
    setBusy(`test:${p.id}`)
    try {
      const r = await api.testProvider(p.id)
      setResults((s) => ({ ...s, [p.id]: r }))
    } catch (e) {
      setResults((s) => ({ ...s, [p.id]: { error: (e as Error).message } }))
    } finally {
      setBusy(null)
    }
  }

  const pull = async (p: Provider) => {
    setBusy(`pull:${p.id}`)
    try {
      const r = await api.fetchModels(p.id)
      await onChanged()
      setResults((s) => ({ ...s, [p.id]: { ok: true, model: `已拉取 ${r.models.length} 个模型` } }))
    } catch (e) {
      setResults((s) => ({ ...s, [p.id]: { error: (e as Error).message } }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b-2 border-ink-700 px-5 py-3.5">
        <div className="flex h-9 w-9 items-center justify-center border-2 border-gold-600 bg-ink-950 text-gold-300 shadow-[2px_2px_0_rgba(0,0,0,.55)]"><Plug size={16} /></div>
        <div>
          <div className="pixel-text text-[16px] text-ink-100">模型供应商</div>
          <div className="text-[11px] text-ink-400">任何 OpenAI 兼容接口都能接入；Key 只保存在本机 backend/data/providers.json</div>
        </div>
        <button className="btn-ghost ml-auto h-8 px-2" onClick={onClose} aria-label="关闭"><X size={15} /></button>
      </div>

      <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-[1fr_380px]">
        {/* list */}
        <div className="min-h-0 overflow-y-auto p-4">
          {providers.length === 0 && !draft && (
            <div className="border-2 border-dashed border-ink-600 p-6 text-center text-sm text-ink-300">
              还没有接入任何供应商。从右侧选择一个预设（DeepSeek、通义、Kimi、OpenAI、Ollama……任何 OpenAI 兼容接口都行），填好 Base URL 和 API Key 即可。
            </div>
          )}
          <div className="space-y-2">
            {providers.map((p) => {
              const r = results[p.id]
              return (
                <div key={p.id} className="panel-inset p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`h-2 w-2 ${p.ready ? 'bg-jade-300 shadow-[0_0_8px_#7fd9ad]' : 'bg-gold-400'}`} />
                    <span className="pixel-text text-[14px] text-ink-100">{p.name}</span>
                    <span className="chip text-[10px] text-ink-300">{presetMap[p.preset]?.name ?? p.preset}</span>
                    {p.source === 'env' && <span className="chip text-[10px] text-ghost-300">来自 .env</span>}
                    <span className="ml-auto flex items-center gap-1 text-[11px] text-ink-400">
                      <KeyRound size={11} /> {p.api_key_set ? p.api_key_hint : p.ready ? '本地服务，无需 Key' : '未填 Key'}
                    </span>
                  </div>
                  <div className="mt-1 truncate font-mono text-[11px] text-ink-400">{p.base_url}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.models.length ? p.models.map((m) => <span key={m} className="chip text-[10px] text-ink-200">{m}</span>)
                      : <span className="text-[11px] text-ink-400">还没有模型，点“拉取模型”或编辑手动填写</span>}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <button className="btn-ghost px-2 py-1 text-[11px]" disabled={!!busy || !p.ready} onClick={() => test(p)}>
                      {busy === `test:${p.id}` ? <Loader2 size={12} className="animate-spin-step" /> : <Plug size={12} />} 测试连通
                    </button>
                    <button className="btn-ghost px-2 py-1 text-[11px]" disabled={!!busy || !p.ready} onClick={() => pull(p)}>
                      {busy === `pull:${p.id}` ? <Loader2 size={12} className="animate-spin-step" /> : <Download size={12} />} 拉取模型
                    </button>
                    <button className="btn-ghost px-2 py-1 text-[11px]" disabled={!!busy} onClick={() => startEdit(p)}>编辑</button>
                    {p.source !== 'env' && (
                      <button className="btn-ghost px-2 py-1 text-[11px] text-seal-400 hover:border-seal-700 hover:text-seal-400" disabled={!!busy} onClick={() => remove(p)}>
                        <Trash2 size={12} /> 删除
                      </button>
                    )}
                    {r && (
                      <span className={`ml-auto flex items-center gap-1 text-[11px] ${'error' in r && r.error ? 'text-seal-400' : (r as ProviderTestResult).ok ? 'text-jade-300' : 'text-seal-400'}`}>
                        {'error' in r && r.error ? <><XCircle size={12} /> {r.error}</>
                          : (r as ProviderTestResult).ok
                            ? <><CheckCircle2 size={12} /> {(r as ProviderTestResult).latency_ms != null ? `${(r as ProviderTestResult).latency_ms} ms · 回复 “${(r as ProviderTestResult).reply}”` : (r as ProviderTestResult).model}</>
                            : <><XCircle size={12} /> {(r as ProviderTestResult).error}</>}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* form */}
        <div className="min-h-0 overflow-y-auto border-t-2 border-ink-700 p-4 md:border-t-0 md:border-l-2">
          {!draft ? (
            <>
              <div className="eyebrow mb-2 text-[11px]">ADD PROVIDER · 添加供应商</div>
              <div className="grid gap-1.5">
                {presets.map((p) => (
                  <button key={p.id} onClick={() => startNew(p.id)}
                    className="flex items-center gap-2 panel-inset px-3 py-2 text-left text-xs transition hover:border-gold-600 hover:bg-ink-900">
                    <Plus size={12} className="shrink-0 text-gold-400" />
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink-100">{p.name}</span>
                      <span className="block truncate text-[10px] text-ink-400">{p.hint || p.base_url}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div className="eyebrow text-[11px]">{draft.id ? 'EDIT · 编辑供应商' : 'NEW · 新建供应商'}</div>
                <button className="text-ink-400 hover:text-ink-100" onClick={() => setDraft(null)}><X size={14} /></button>
              </div>
              <label className="block text-ink-300">名称
                <input className="input-base mt-1" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </label>
              <label className="block text-ink-300">Base URL <span className="text-ink-400">（以 /v1 结尾）</span>
                <input className="input-base mt-1 font-mono" value={draft.base_url} onChange={(e) => setDraft({ ...draft, base_url: e.target.value })} />
              </label>
              <label className="block text-ink-300">API Key
                <input className="input-base mt-1 font-mono" type="password" autoComplete="off" value={draft.api_key}
                  placeholder={draft.id ? '留空则保留原有 Key' : presetMap[draft.preset]?.needs_key === false ? '本地服务可留空' : 'sk-…'}
                  onChange={(e) => setDraft({ ...draft, api_key: e.target.value })} />
              </label>
              <label className="block text-ink-300">模型 <span className="text-ink-400">（逗号分隔；保存后也可“拉取模型”）</span>
                <textarea className="input-base mt-1 min-h-[72px] font-mono" value={draft.models} onChange={(e) => setDraft({ ...draft, models: e.target.value })} />
              </label>
              {presetMap[draft.preset]?.hint && <div className="border-2 border-gold-600/40 bg-gold-600/10 p-2 text-[11px] text-ink-300">{presetMap[draft.preset].hint}</div>}
              {error && <div className="text-seal-400">{error}</div>}
              <div className="flex gap-2">
                <button className="btn-gold flex-1 py-2 text-sm" disabled={busy === 'save'} onClick={save}>
                  {busy === 'save' ? <Loader2 size={14} className="animate-spin-step" /> : <RefreshCw size={14} />} 保存
                </button>
                <button className="btn-ghost" onClick={() => setDraft(null)}>取消</button>
              </div>
            </div>
          )}
          {error && !draft && <div className="mt-3 text-xs text-seal-400">{error}</div>}
        </div>
      </div>
    </>
  )
}
