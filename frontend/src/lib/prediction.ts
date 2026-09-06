import type { Asset, Turn } from '../types'

export interface ClaimShare {
  id: string
  /** 主张的价值（万元）：Σ 资产估值 × 最新主张比例 */
  value: number
  /** 在全部主张中的占比（0-100） */
  percent: number
}

export interface ContestedAsset {
  assetId: string
  /** 声称要这项资产的人数 */
  claimants: number
  /** 各方主张比例之和；>100 即"僧多粥少" */
  totalPct: number
}

/** 每位角色对每项资产的最新主张比例（后说的覆盖先说的） */
export function latestClaims(turns: Turn[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const t of turns) {
    if (!t.done || !t.meta?.claims) continue
    const row = (out[t.agent_id] ??= {})
    for (const [assetId, pct] of Object.entries(t.meta.claims)) row[assetId] = pct
  }
  return out
}

/**
 * 各方主张份额：把每个人"想要什么"折成价值，再归一化。
 * 主张会互相重叠，所以总量可能超过遗产净额——这正是"争夺热度"的含义。
 */
export function claimedShares(turns: Turn[], assets: Asset[], agentIds: string[]): ClaimShare[] {
  const claims = latestClaims(turns)
  const valueOf = Object.fromEntries(assets.map((a) => [a.id, Number(a.value) || 0]))
  const rows = agentIds
    .map((id) => {
      const value = Object.entries(claims[id] ?? {}).reduce((sum, [assetId, pct]) => sum + (valueOf[assetId] ?? 0) * (pct / 100), 0)
      return { id, value }
    })
    .filter((r) => r.value > 0)
  const total = rows.reduce((s, r) => s + r.value, 0)
  return rows
    .map((r) => ({ ...r, value: round1(r.value), percent: total > 0 ? round1((r.value / total) * 100) : 0 }))
    .sort((a, b) => b.value - a.value)
}

/** 被多人盯上的资产 */
export function contestedAssets(turns: Turn[]): ContestedAsset[] {
  const claims = latestClaims(turns)
  const byAsset: Record<string, { claimants: number; totalPct: number }> = {}
  for (const row of Object.values(claims)) {
    for (const [assetId, pct] of Object.entries(row)) {
      if (pct <= 0) continue
      const c = (byAsset[assetId] ??= { claimants: 0, totalPct: 0 })
      c.claimants += 1
      c.totalPct += pct
    }
  }
  return Object.entries(byAsset)
    .map(([assetId, c]) => ({ assetId, ...c }))
    .filter((c) => c.claimants >= 2 || c.totalPct > 100)
}

const round1 = (n: number) => Math.round(n * 10) / 10
