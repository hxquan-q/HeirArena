import { useEffect } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { api, type CaseParseResult } from '../api/client'
import { PRESETS, newAsset, newMember } from '../data/presets'
import type { Asset, CaseInput, LegalResult, Member } from '../types'

/**
 * 卷宗草稿：大厅选剧本 → 编辑页改细节 → 开庭，三个画面共用同一份。
 * 存 sessionStorage，刷新不丢，关标签页即清。
 */
interface DraftState {
  c: CaseInput
  activePreset: string
  preview: LegalResult | null
  previewErr: string | null
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
}

export const useCaseDraft = create<DraftState>()(
  persist(
    (set, get) => ({
      c: PRESETS[0].build(),
      activePreset: PRESETS[0].id,
      preview: null,
      previewErr: null,

      upd: (patch) => set((s) => ({ c: { ...s.c, ...patch } })),
      replace: (c, presetId = '') => set({ c, activePreset: presetId }),
      loadPreset: (id) => {
        const p = PRESETS.find((x) => x.id === id)
        if (p) set({ c: p.build(), activePreset: id, preview: null, previewErr: null })
      },
      applyParsed: (result) => {
        const current = get().c
        set({
          c: {
            ...result.case,
            rounds: current.rounds,
            speed: current.speed,
            discretion: current.discretion ?? 5,
            default_model: current.default_model,
            executor_model: current.executor_model,
          },
          preview: result.legal,
          previewErr: null,
          activePreset: '',
        })
      },
      updAsset: (id, patch) => set((s) => ({ c: { ...s.c, assets: s.c.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) } })),
      updMember: (id, patch) => set((s) => ({ c: { ...s.c, members: s.c.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) } })),
      addAsset: () => {
        const a = newAsset()
        set((s) => ({ c: { ...s.c, assets: [...s.c.assets, a] } }))
        return a
      },
      addMember: () => {
        const m = newMember()
        set((s) => ({ c: { ...s.c, members: [...s.c.members, m] } }))
        return m
      },
      removeAsset: (id) => set((s) => ({ c: { ...s.c, assets: s.c.assets.filter((a) => a.id !== id) } })),
      removeMember: (id) => set((s) => ({ c: { ...s.c, members: s.c.members.filter((m) => m.id !== id) } })),
      setPreview: (preview, previewErr) => set({ preview, previewErr }),
    }),
    {
      name: 'heirarena-draft',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ c: s.c, activePreset: s.activePreset }),
    },
  ),
)

export function isDraftValid(c: CaseInput): boolean {
  return c.assets.some((a) => a.name.trim()) && c.members.some((m) => m.name.trim()) && c.decedent_name.trim().length > 0
}

export function cleanDraft(c: CaseInput): CaseInput {
  return {
    ...c,
    assets: c.assets.filter((a) => a.name.trim()).map((a) => ({ ...a, value: Number(a.value) || 0 })),
    members: c.members.filter((m) => m.name.trim()),
  }
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
