import type { AgentSpec, CaseInput, LegalResult } from '../types'

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
  base_url: string | null
}

export const api = {
  config: () => fetch('/api/config').then((r) => json<ServerConfig>(r)),
  legalPreview: (c: CaseInput, signal?: AbortSignal) =>
    fetch('/api/legal/preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c), signal,
    }).then((r) => json<LegalResult>(r)),
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

export function subscribe(sessionId: string, onEvent: (type: SseEventType, data: Record<string, unknown>) => void,
  onError?: () => void): () => void {
  const es = new EventSource(`/api/sessions/${sessionId}/stream`)
  for (const type of SSE_EVENTS) {
    es.addEventListener(type, (e) => {
      try {
        onEvent(type, JSON.parse((e as MessageEvent).data))
      } catch {
        /* malformed chunk, ignore */
      }
    })
  }
  es.onerror = () => onError?.()
  return () => es.close()
}
