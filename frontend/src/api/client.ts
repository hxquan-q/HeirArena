import type { AgentSpec, CaseInput, LegalResult, ModelRef, Provider, ProviderPreset } from '../types'

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail ?? body)
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

export interface ServerConfig {
  mode: 'llm' | 'mock'
  model: string
  providers_ready: number
  default_model: ModelRef | null
}

export interface ProviderUpsert {
  name: string
  base_url: string
  api_key?: string
  models: string[]
  preset: string
}

export interface ProviderTestResult {
  ok: boolean
  latency_ms?: number
  reply?: string
  error?: string
  model: string
}

export interface CaseParseResult {
  case: CaseInput
  legal: LegalResult
  warnings: string[]
  model_label: string
  source_chars: number
}

const jsonInit = (method: string, body?: unknown): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
})

export const api = {
  config: () => fetch('/api/config').then((r) => json<ServerConfig>(r)),
  providers: () => fetch('/api/providers').then((r) => json<{ providers: Provider[]; presets: ProviderPreset[] }>(r)),
  createProvider: (body: ProviderUpsert) => fetch('/api/providers', jsonInit('POST', body)).then((r) => json<Provider>(r)),
  updateProvider: (id: string, body: ProviderUpsert) => fetch(`/api/providers/${id}`, jsonInit('PUT', body)).then((r) => json<Provider>(r)),
  deleteProvider: (id: string) => fetch(`/api/providers/${id}`, { method: 'DELETE' }).then((r) => json<{ ok: boolean }>(r)),
  testProvider: (id: string, model?: string) =>
    fetch(`/api/providers/${id}/test`, jsonInit('POST', { model: model || null })).then((r) => json<ProviderTestResult>(r)),
  fetchModels: (id: string) => fetch(`/api/providers/${id}/models`, { method: 'POST' }).then((r) => json<{ models: string[]; provider: Provider }>(r)),
  legalPreview: (c: CaseInput, signal?: AbortSignal) =>
    fetch('/api/legal/preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c), signal,
    }).then((r) => json<LegalResult>(r)),
  parseCase: (content: string, filename: string, model: ModelRef | null) =>
    fetch('/api/cases/parse', jsonInit('POST', { content, filename, model })).then((r) => json<CaseParseResult>(r)),
  createSession: (c: CaseInput) =>
    fetch('/api/sessions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c),
    }).then((r) => json<{ session_id: string; mode: string; agents: AgentSpec[]; legal: LegalResult }>(r)),
  interject: (sessionId: string, text: string) =>
    fetch(`/api/sessions/${sessionId}/interject`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
    }).then((r) => json<{ ok: boolean }>(r)),
  exportUrl: (sessionId: string) => `/api/sessions/${sessionId}/export`,
}

export const SSE_EVENTS = [
  'session_start', 'phase', 'agent_status', 'speech_start', 'speech_delta', 'speech_end',
  'relation', 'reaction', 'ghost', 'notice', 'gavel', 'verdict', 'done', 'error',
] as const

export type SseEventType = (typeof SSE_EVENTS)[number]

/**
 * 订阅会话事件流。EventSource 原生重连不会带上 from_seq，会导致整场庭审从头重放、
 * 记录翻倍，所以这里手动管理重连：记录已消费的 seq，断线后从下一条继续。
 */
export function subscribe(sessionId: string, onEvent: (type: SseEventType, data: Record<string, unknown>) => void,
  onError?: () => void): () => void {
  let es: EventSource | null = null
  let lastSeq = -1
  let finished = false
  let retry: ReturnType<typeof setTimeout> | null = null

  const open = () => {
    es = new EventSource(`/api/sessions/${sessionId}/stream?from_seq=${lastSeq + 1}`)
    for (const type of SSE_EVENTS) {
      es.addEventListener(type, (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as Record<string, unknown>
          const seq = Number(data.seq)
          if (Number.isFinite(seq)) {
            if (seq <= lastSeq) return
            lastSeq = seq
          }
          if (type === 'done' || type === 'error') finished = true
          onEvent(type, data)
        } catch {
          /* malformed chunk, ignore */
        }
      })
    }
    es.onerror = () => {
      es?.close()
      if (finished) return
      onError?.()
      retry = setTimeout(open, 1500)
    }
  }
  open()

  return () => {
    finished = true
    if (retry) clearTimeout(retry)
    es?.close()
  }
}
