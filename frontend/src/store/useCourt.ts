import { create } from 'zustand'
import { subscribe, type SseEventType } from '../api/client'
import { sfx } from '../lib/sfx'
import type {
  AgentSpec, AgentStatus, CaseInput, DoneStats, LegalResult, Phase, Reaction, RelationEdge, Turn, TurnMeta, Verdict,
} from '../types'

export interface PhaseState {
  phase: Phase
  round: number
  label: string
  ts: number
}

export interface GhostMessage {
  text: string
  ts: number
}

interface CourtState {
  sessionId: string | null
  connected: boolean
  mode: string
  model: string
  agents: AgentSpec[]
  caseData: CaseInput | null
  legal: LegalResult | null
  articleShort: Record<string, string>
  statuses: Record<string, AgentStatus>
  phase: PhaseState | null
  phaseHistory: PhaseState[]
  focusIssues: string[]
  paused: boolean
  /** 收到 session_start 的时刻，用于头部计时 */
  startedAt: number | null
  turns: Turn[]
  activeTurnId: string | null
  /** 舞台上正在闪的连线（几秒后消失） */
  relations: RelationEdge[]
  /** 全场所有攻击/结盟记录（永不删除），供阵营网络与时间线使用 */
  relationLog: RelationEdge[]
  reactions: Record<string, Reaction>
  ghosts: GhostMessage[]
  notices: { text: string; ts: number }[]
  verdict: Verdict | null
  verdictAt: number | null
  gavelAt: number | null
  done: DoneStats | null
  error: string | null
  connect: (sessionId: string) => () => void
  reset: () => void
  setPaused: (paused: boolean) => void
}

const initial = {
  sessionId: null, connected: false, mode: 'mock', model: 'scripted', agents: [], caseData: null, legal: null,
  articleShort: {}, statuses: {}, phase: null, phaseHistory: [], focusIssues: [], paused: false, startedAt: null, turns: [],
  activeTurnId: null, relations: [], relationLog: [],
  reactions: {}, ghosts: [], notices: [], verdict: null, verdictAt: null, gavelAt: null, done: null, error: null,
}

const moodTimers: Record<string, ReturnType<typeof setTimeout>> = {}

/* 打字机音效节流：流式 delta 可能每帧都到，110ms 一响足够连成"哒哒哒" */
let lastBlip = 0
const blip = () => {
  const now = Date.now()
  if (now - lastBlip < 110) return
  lastBlip = now
  sfx('blip')
}

export const useCourt = create<CourtState>((set, get) => ({
  ...initial,

  reset: () => set({ ...initial }),

  setPaused: (paused: boolean) => set({ paused }),

  connect: (sessionId) => {
    set({ ...initial, sessionId })
    const handle = (type: SseEventType, d: Record<string, unknown>) => {
      // 手动重连会从下一条事件续播，不会再次收到最初的 session_start。
      if (type !== 'session_start' && !get().connected) set({ connected: true })
      switch (type) {
        case 'session_start': {
          const agents = d.agents as AgentSpec[]
          set({
            connected: true, mode: String(d.mode), model: String(d.model), agents,
            caseData: d.case as CaseInput, legal: d.legal as LegalResult,
            articleShort: d.article_short as Record<string, string>,
            statuses: Object.fromEntries(agents.map((a) => [a.id, 'idle' as AgentStatus])),
            startedAt: Date.now(),
          })
          break
        }
        case 'phase': {
          const p: PhaseState = { phase: d.phase as Phase, round: Number(d.round), label: String(d.label), ts: Date.now() }
          set((s) => ({ phase: p, phaseHistory: [...s.phaseHistory, p] }))
          sfx('phase')
          break
        }
        case 'focus': {
          // 争议焦点列表：执行官从开场陈述归纳，辩论轮依次围绕推进
          set({ focusIssues: (d.issues as string[]) ?? [] })
          break
        }
        case 'agent_status': {
          const id = String(d.agent_id)
          const status = d.status as AgentStatus
          set((s) => ({ statuses: { ...s.statuses, [id]: status } }))
          break
        }
        case 'speech_start': {
          const turn: Turn = {
            turn_id: String(d.turn_id), agent_id: String(d.agent_id), phase: d.phase as Phase,
            round: Number(d.round), text: '', done: false, ts: Date.now(),
          }
          set((s) => s.turns.some((t) => t.turn_id === turn.turn_id)
            ? { activeTurnId: turn.turn_id }
            : { turns: [...s.turns, turn], activeTurnId: turn.turn_id })
          break
        }
        case 'speech_delta': {
          const id = String(d.turn_id)
          const text = String(d.text)
          blip()
          set((s) => {
            const idx = s.turns.findIndex((t) => t.turn_id === id)
            if (idx < 0) return {}
            const turns = s.turns.slice()
            turns[idx] = { ...turns[idx], text: turns[idx].text + text }
            return { turns }
          })
          break
        }
        case 'speech_end': {
          const id = String(d.turn_id)
          set((s) => {
            const idx = s.turns.findIndex((t) => t.turn_id === id)
            if (idx < 0) return { activeTurnId: null }
            const turns = s.turns.slice()
            turns[idx] = { ...turns[idx], text: String(d.text), meta: d.meta as TurnMeta, done: true }
            return { turns, activeTurnId: s.activeTurnId === id ? null : s.activeTurnId }
          })
          break
        }
        case 'relation': {
          const edge: RelationEdge = {
            id: `${d.turn_id}-${d.to}`, from: String(d.from), to: String(d.to),
            kind: d.kind as 'attack' | 'ally', ts: Date.now(),
          }
          set((s) => ({ relations: [...s.relations.slice(-5), edge], relationLog: [...s.relationLog, edge] }))
          setTimeout(() => set((s) => ({ relations: s.relations.filter((r) => r.id !== edge.id) })), 9000)
          sfx(edge.kind === 'attack' ? 'attack' : 'ally')
          break
        }
        case 'reaction': {
          const id = String(d.agent_id)
          const mood = d.mood as Reaction['mood']
          set((s) => ({
            reactions: { ...s.reactions, [id]: { emoji: String(d.emoji), mood, ts: Date.now() } },
            statuses: mood === 'neutral' || s.statuses[id] === 'speaking' || s.statuses[id] === 'thinking'
              ? s.statuses
              : { ...s.statuses, [id]: mood },
          }))
          clearTimeout(moodTimers[id])
          moodTimers[id] = setTimeout(() => {
            set((s) => {
              const statuses = { ...s.statuses }
              if (statuses[id] === 'angry' || statuses[id] === 'happy') statuses[id] = 'idle'
              const reactions = { ...s.reactions }
              delete reactions[id]
              return { statuses, reactions }
            })
          }, 2600)
          break
        }
        case 'ghost':
          set((s) => ({ ghosts: [...s.ghosts, { text: String(d.text), ts: Date.now() }] }))
          sfx('ghost')
          break
        case 'notice':
          set((s) => ({ notices: [...s.notices.slice(-4), { text: String(d.text), ts: Date.now() }] }))
          break
        case 'gavel':
          set({ gavelAt: Date.now() })
          sfx('gavel')
          break
        case 'verdict':
          set({ verdict: d as unknown as Verdict, verdictAt: Date.now() })
          sfx('verdict')
          break
        case 'done':
          set({ done: { stats: d.stats as Record<string, number>, drama_score: Number(d.drama_score) } })
          break
        case 'error':
          set({ error: String(d.text) })
          break
      }
    }
    const close = subscribe(sessionId, handle, () => {
      if (!get().done) set({ connected: false })
    })
    return close
  },
}))

export const selectAgent = (id: string) => (s: CourtState) => s.agents.find((a) => a.id === id)
