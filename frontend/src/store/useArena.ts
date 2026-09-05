import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ENERGY_MAX, ENERGY_PER_PHASE, ENERGY_START } from '../lib/skills'

interface ArenaSave {
  energy: number
  /** 已经发过能量的阶段 key，防止刷新页面重复回蓝 */
  phasesSeen: string[]
  /** 已在宝箱里看过的证据卡 id，用于"新证据"徽章 */
  seenEvidence: string[]
  casts: number
}

interface ArenaState {
  sessionId: string | null
  saves: Record<string, ArenaSave>
  bind: (sessionId: string) => void
  regen: (phaseKey: string) => void
  spend: (cost: number) => boolean
  markSeen: (ids: string[]) => void
  current: () => ArenaSave
}

const fresh = (): ArenaSave => ({ energy: ENERGY_START, phasesSeen: [], seenEvidence: [], casts: 0 })
/* 选择器兜底必须是稳定引用，否则 zustand 每次都拿到新对象会无限重渲染 */
const EMPTY: ArenaSave = fresh()

/**
 * 幽灵玩家的资源：显灵能量按场次存档在 localStorage 里，
 * 每进入一个新阶段回复一段，显灵术按卡消耗。
 */
export const useArena = create<ArenaState>()(
  persist(
    (set, get) => ({
      sessionId: null,
      saves: {},
      bind: (sessionId) => set((s) => ({ sessionId, saves: s.saves[sessionId] ? s.saves : { ...s.saves, [sessionId]: fresh() } })),
      current: () => {
        const { sessionId, saves } = get()
        return (sessionId && saves[sessionId]) || EMPTY
      },
      regen: (phaseKey) => {
        const { sessionId } = get()
        if (!sessionId) return
        set((s) => {
          const save = s.saves[sessionId] ?? fresh()
          if (save.phasesSeen.includes(phaseKey)) return {}
          // 第一个阶段（开庭）不回蓝：初始能量已经给了
          const energy = save.phasesSeen.length === 0 ? save.energy : Math.min(ENERGY_MAX, save.energy + ENERGY_PER_PHASE)
          return { saves: { ...s.saves, [sessionId]: { ...save, energy, phasesSeen: [...save.phasesSeen, phaseKey] } } }
        })
      },
      spend: (cost) => {
        const { sessionId } = get()
        if (!sessionId) return false
        const save = get().saves[sessionId] ?? fresh()
        if (save.energy < cost) return false
        set((s) => ({ saves: { ...s.saves, [sessionId]: { ...save, energy: save.energy - cost, casts: save.casts + 1 } } }))
        return true
      },
      markSeen: (ids) => {
        const { sessionId } = get()
        if (!sessionId || !ids.length) return
        set((s) => {
          const save = s.saves[sessionId] ?? fresh()
          const merged = Array.from(new Set([...save.seenEvidence, ...ids]))
          if (merged.length === save.seenEvidence.length) return {}
          return { saves: { ...s.saves, [sessionId]: { ...save, seenEvidence: merged } } }
        })
      },
    }),
    {
      name: 'heirarena-arena',
      // 只留最近 12 场，避免 localStorage 无限长
      partialize: (s) => ({ saves: Object.fromEntries(Object.entries(s.saves).slice(-12)) }),
    },
  ),
)

/** 组件里读当前场次存档的选择器 */
export const selectSave = (s: ArenaState): ArenaSave => (s.sessionId && s.saves[s.sessionId]) || EMPTY
