import { useEffect } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { api, type CaseParseResult } from '../api/client'
import { ASSET_TYPES, PRESETS, newAsset, newMember } from '../data/presets'
import { assetsHint, defaultWish } from '../lib/wish'
import { sanitizeGoals } from '../lib/seat'
import type { Asset, CaseInput, Goals, LegalResult, Member, ModelRef, SeatAnalysis, SeatConfig, StrategyPack } from '../types'

const SEAT_BLOCKED = new Set(['pet', 'ai_twin'])

export function isSeatable(m: Member): boolean {
  return !m.deceased && !SEAT_BLOCKED.has(m.relation)
}

export function goalsFromWish(member: Member, assets: Asset[]): Goals {
  const wish = member.wish.trim() || defaultWish(member, assetsHint(assets))
  const tokens = wish.split(/[与和及、,，\s]+/).filter((t) => t.length >= 2)
  const hits: string[] = []
  for (const asset of assets) {
    if (hits.length >= 5) break
    const label = ASSET_TYPES.find((t) => t.value === asset.type)?.label ?? ''
    const nameHit = Boolean(asset.name) && (wish.includes(asset.name) || tokens.some((t) => asset.name.includes(t)))
    const typeHit = Boolean(label) && wish.includes(label)
    if (nameHit || typeHit) hits.push(asset.id)
  }
  return {
    target_assets: hits,
    min_value_share: null,
    red_lines: [],
    soft_goals: [],
    narrative: wish,
    source: 'user',
  }
}

function pruneGoals(goals: Record<string, Goals>, members: Member[], assets: Asset[]): Record<string, Goals> {
  const memberIds = new Set(members.map((m) => m.id))
  const assetIds = new Set(assets.map((a) => a.id))
  const next: Record<string, Goals> = {}
  for (const [id, g] of Object.entries(goals)) {
    if (!memberIds.has(id)) continue
    next[id] = {
      ...g,
      target_assets: g.target_assets.filter((aid) => assetIds.has(aid)),
      red_lines: g.red_lines.filter((r) => (!r.asset_id || assetIds.has(r.asset_id)) && (!r.member_id || memberIds.has(r.member_id))),
      soft_goals: g.soft_goals.filter((s) => (!s.asset_id || assetIds.has(s.asset_id)) && (!s.member_id || memberIds.has(s.member_id))),
    }
  }
  return next
}

export function pruneSeat(c: CaseInput, dropStrategy = true): CaseInput {
  const seat = c.seat
  if (!seat) return { ...c, seat: null }
  const player = c.members.find((m) => m.id === seat.player_id)
  if (!player || !isSeatable(player)) return { ...c, seat: null }
  return {
    ...c,
    seat: {
      ...seat,
      goals: pruneGoals(seat.goals, c.members, c.assets),
      strategy: dropStrategy ? null : seat.strategy,
    },
  }
}

function expireStrategy(c: CaseInput): CaseInput {
  if (!c.seat) return c
  return { ...c, seat: { ...c.seat, strategy: null } }
}

interface DraftState {
  c: CaseInput
  activePreset: string
  preview: LegalResult | null
  previewErr: string | null
  analysis: SeatAnalysis | null
  analysisErr: string | null
  analyzing: boolean
  strategizing: boolean
  strategyErr: string | null
  strategyStale: boolean
  advisorModel: ModelRef | null
  upd: (patch: Partial<CaseInput>) => void
  replace: (c: CaseInput, presetId?: string) => void
  loadPreset: (id: string) => void
  applyParsed: (result: CaseParseResult) => void
  updAsset: (id: string, patch: Partial<Asset>) => void
  updMember: (id: string, patch: Partial<Member>) => void
  addAsset: () => Asset
  addMember: () => Member
  removeAsset: (id: string) => void
  removeMember: (id: string) => void
  setPreview: (preview: LegalResult | null, err: string | null) => void
  enterSeat: (playerId: string) => void
  leaveSeat: () => void
  setPlayer: (playerId: string) => void
  updGoals: (memberId: string, patch: Partial<Goals>) => void
  resetGoals: (memberId: string) => void
  applyInferred: (inferred: Record<string, Goals>) => void
  setSeatHuman: (human: boolean) => void
  setAdvisorModel: (ref: ModelRef | null) => void
  setStrategy: (pack: StrategyPack | null) => void
  setAnalysis: (analysis: SeatAnalysis | null) => void
  setAnalysisErr: (err: string | null) => void
  setAnalyzing: (v: boolean) => void
  setStrategizing: (v: boolean) => void
  setStrategyErr: (err: string | null) => void
}

function emptySeat(playerId: string, member: Member, assets: Asset[], advisor: ModelRef | null): SeatConfig {
  return {
    player_id: playerId,
    goals: { [playerId]: goalsFromWish(member, assets) },
    seat_human: false,
    advisor_model: advisor,
    strategy: null,
  }
}

export const useCaseDraft = create<DraftState>()(
  persist(
    (set, get) => ({
      c: PRESETS[0].build(),
      activePreset: PRESETS[0].id,
      preview: null,
      previewErr: null,
      analysis: null,
      analysisErr: null,
      analyzing: false,
      strategizing: false,
      strategyErr: null,
      strategyStale: false,
      advisorModel: null,

      upd: (patch) => set((s) => ({
        c: expireStrategy({ ...s.c, ...patch }),
        strategyStale: s.strategyStale || Boolean(s.c.seat?.strategy),
      })),
      replace: (c, presetId = '') => set({ c: { ...c, seat: c.seat ?? null }, activePreset: presetId }),
      loadPreset: (id) => {
        const p = PRESETS.find((x) => x.id === id)
        if (p) set({ c: p.build(), activePreset: id, preview: null, previewErr: null, analysis: null, analysisErr: null, strategyStale: false })
      },
      applyParsed: (result) => {
        const current = get().c
        const incoming = result.case
        const playerStillThere = current.seat && incoming.members.some((m) => m.id === current.seat!.player_id)
        const next: CaseInput = {
          ...incoming,
          rounds: current.rounds,
          speed: current.speed,
          discretion: current.discretion ?? 5,
          default_model: current.default_model,
          executor_model: current.executor_model,
          seat: playerStillThere ? current.seat : null,
        }
        set({
          c: playerStillThere ? pruneSeat(next) : { ...next, seat: null },
          preview: result.legal,
          previewErr: null,
          activePreset: '',
          analysis: playerStillThere ? get().analysis : null,
        })
      },
      updAsset: (id, patch) => set((s) => ({
        c: expireStrategy({ ...s.c, assets: s.c.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) }),
        strategyStale: s.strategyStale || Boolean(s.c.seat?.strategy),
      })),
      updMember: (id, patch) => set((s) => {
        const members = s.c.members.map((m) => (m.id === id ? { ...m, ...patch } : m))
        const next = { ...s.c, members }
        return {
          c: pruneSeat(next),
          strategyStale: s.strategyStale || Boolean(s.c.seat?.strategy),
        }
      }),
      addAsset: () => {
        const a = newAsset()
        set((s) => ({
          c: expireStrategy({ ...s.c, assets: [...s.c.assets, a] }),
          strategyStale: s.strategyStale || Boolean(s.c.seat?.strategy),
        }))
        return a
      },
      addMember: () => {
        const m = newMember()
        set((s) => ({
          c: expireStrategy({ ...s.c, members: [...s.c.members, m] }),
          strategyStale: s.strategyStale || Boolean(s.c.seat?.strategy),
        }))
        return m
      },
      removeAsset: (id) => set((s) => ({
        c: pruneSeat({ ...s.c, assets: s.c.assets.filter((a) => a.id !== id) }),
        strategyStale: s.strategyStale || Boolean(s.c.seat?.strategy),
      })),
      removeMember: (id) => set((s) => {
        const next = pruneSeat({ ...s.c, members: s.c.members.filter((m) => m.id !== id) })
        return {
          c: next,
          analysis: next.seat ? s.analysis : null,
          strategyStale: next.seat ? (s.strategyStale || Boolean(s.c.seat?.strategy)) : false,
        }
      }),
      setPreview: (preview, previewErr) => set({ preview, previewErr }),

      enterSeat: (playerId) => set((s) => {
        const member = s.c.members.find((m) => m.id === playerId)
        if (!member || !isSeatable(member)) return s
        return {
          c: { ...s.c, seat: emptySeat(playerId, member, s.c.assets, s.advisorModel) },
        }
      }),
      leaveSeat: () => set((s) => ({
        c: { ...s.c, seat: null },
        analysis: null,
        analysisErr: null,
        strategyStale: false,
      })),
      setPlayer: (playerId) => set((s) => {
        const seat = s.c.seat
        if (!seat) return s
        const member = s.c.members.find((m) => m.id === playerId)
        if (!member || !isSeatable(member)) return s
        const goals = { ...seat.goals }
        if (!goals[playerId]) goals[playerId] = goalsFromWish(member, s.c.assets)
        return {
          c: { ...s.c, seat: { ...seat, player_id: playerId, goals, strategy: null } },
          strategyStale: s.strategyStale || Boolean(seat.strategy),
        }
      }),
      updGoals: (memberId, patch) => set((s) => {
        const seat = s.c.seat
        if (!seat) return s
        const prev = seat.goals[memberId] ?? goalsFromWish(
          s.c.members.find((m) => m.id === memberId) ?? newMember({ id: memberId }),
          s.c.assets,
        )
        return {
          c: {
            ...s.c,
            seat: {
              ...seat,
              goals: { ...seat.goals, [memberId]: { ...prev, ...patch, source: 'user' } },
              strategy: null,
            },
          },
          strategyStale: s.strategyStale || Boolean(seat.strategy),
        }
      }),
      resetGoals: (memberId) => set((s) => {
        const seat = s.c.seat
        if (!seat) return s
        const rest = { ...seat.goals }
        delete rest[memberId]
        return {
          c: { ...s.c, seat: { ...seat, goals: rest, strategy: null } },
          strategyStale: s.strategyStale || Boolean(seat.strategy),
        }
      }),
      applyInferred: (inferred) => set((s) => {
        const seat = s.c.seat
        if (!seat) return s
        const goals = { ...seat.goals }
        let changed = false
        for (const [id, g] of Object.entries(inferred)) {
          if (goals[id]?.source === 'user') continue
          const next = { ...g, source: 'inferred' as const }
          if (JSON.stringify(goals[id]) === JSON.stringify(next)) continue
          goals[id] = next
          changed = true
        }
        if (!changed) return s
        return { c: { ...s.c, seat: { ...seat, goals } } }
      }),
      setSeatHuman: (human) => set((s) => {
        const seat = s.c.seat
        if (!seat) return s
        return { c: { ...s.c, seat: { ...seat, seat_human: human } } }
      }),
      setAdvisorModel: (ref) => set((s) => ({
        advisorModel: ref,
        c: s.c.seat ? { ...s.c, seat: { ...s.c.seat, advisor_model: ref } } : s.c,
      })),
      setStrategy: (pack) => set((s) => {
        const seat = s.c.seat
        if (!seat) return s
        return { c: { ...s.c, seat: { ...seat, strategy: pack } }, strategyStale: pack == null }
      }),
      setAnalysis: (analysis) => set({ analysis }),
      setAnalysisErr: (analysisErr) => set({ analysisErr }),
      setAnalyzing: (analyzing) => set({ analyzing }),
      setStrategizing: (strategizing) => set({ strategizing }),
      setStrategyErr: (strategyErr) => set({ strategyErr }),
    }),
    {
      name: 'heirarena-draft',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ c: s.c, activePreset: s.activePreset, advisorModel: s.advisorModel }),
    },
  ),
)

export function isDraftValid(c: CaseInput): boolean {
  const base = c.assets.some((a) => a.name.trim()) && c.members.some((m) => m.name.trim()) && c.decedent_name.trim().length > 0
  if (!base) return false
  if (!c.seat) return true
  const player = c.members.find((m) => m.id === c.seat!.player_id)
  return Boolean(player && isSeatable(player))
}

export function cleanDraft(c: CaseInput): CaseInput {
  const pruned = pruneSeat({
    ...c,
    assets: c.assets.filter((a) => a.name.trim()).map((a) => ({ ...a, value: Number(a.value) || 0 })),
    members: c.members.filter((m) => m.name.trim()),
    seat: c.seat ?? null,
  }, false)
  if (!pruned.seat) return pruned
  const goals: Record<string, Goals> = {}
  for (const [id, g] of Object.entries(pruned.seat.goals)) {
    goals[id] = sanitizeGoals(g)
  }
  return { ...pruned, seat: { ...pruned.seat, goals } }
}

export function seatAnalysisEligible(c: CaseInput): boolean {
  if (!c.seat) return false
  const player = c.members.find((m) => m.id === c.seat!.player_id)
  return Boolean(player && isSeatable(player))
}

export function watchSeatAnalysis(
  c: CaseInput,
  analyze: typeof api.seatAnalyze,
  hooks: {
    setAnalysis: (a: SeatAnalysis | null) => void
    setAnalysisErr: (err: string | null) => void
    setAnalyzing: (v: boolean) => void
    applyInferred: (inferred: Record<string, Goals>) => void
  },
): () => void {
  if (!seatAnalysisEligible(c)) return () => {}
  const ctrl = new AbortController()
  const t = setTimeout(() => {
    hooks.setAnalyzing(true)
    const payload: CaseInput = { ...c, seat: c.seat ? { ...c.seat, strategy: null } : null }
    analyze(payload, ctrl.signal)
      .then((r) => {
        hooks.setAnalysis(r)
        hooks.setAnalysisErr(null)
        hooks.applyInferred(r.inferred_goals)
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') hooks.setAnalysisErr(e.message)
      })
      .finally(() => {
        if (!ctrl.signal.aborted) hooks.setAnalyzing(false)
      })
  }, 350)
  return () => { clearTimeout(t); ctrl.abort() }
}

/** 草稿一变就（防抖）向后端要一份法定份额预览。任何画面挂一次即可。 */
export function useLegalPreview() {
  const c = useCaseDraft((s) => s.c)
  const setPreview = useCaseDraft((s) => s.setPreview)
  useEffect(() => {
    if (!isDraftValid(c)) return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      api.legalPreview(cleanDraft(c), ctrl.signal)
        .then((r) => setPreview(r, null))
        .catch((e: Error) => {
          if (e.name !== 'AbortError') setPreview(useCaseDraft.getState().preview, e.message)
        })
    }, 350)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [c, setPreview])
}

export function useSeatAnalysis() {
  const c = useCaseDraft((s) => s.c)
  const setAnalysis = useCaseDraft((s) => s.setAnalysis)
  const setAnalysisErr = useCaseDraft((s) => s.setAnalysisErr)
  const setAnalyzing = useCaseDraft((s) => s.setAnalyzing)
  const applyInferred = useCaseDraft((s) => s.applyInferred)
  useEffect(
    () => watchSeatAnalysis(c, api.seatAnalyze, { setAnalysis, setAnalysisErr, setAnalyzing, applyInferred }),
    [c, setAnalysis, setAnalysisErr, setAnalyzing, applyInferred],
  )
}
