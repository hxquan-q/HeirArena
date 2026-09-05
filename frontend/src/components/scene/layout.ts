export const W = 1200
export const H = 700

export interface Pt { x: number; y: number }

export const EXECUTOR_ANCHOR: Pt = { x: 600, y: 272 }
export const PODIUM_ANCHOR: Pt = { x: 600, y: 452 }

/** 家属席：沿一条朝向法官席张开的弧线排列。返回每个座位的"脚底"坐标。 */
export function seatPositions(n: number): Pt[] {
  if (n <= 0) return []
  if (n === 1) return [{ x: 600, y: 630 }]
  const start = 162
  const end = 18
  const cx = 600
  const cy = 445
  const rx = n > 6 ? 500 : 470
  const ry = n > 6 ? 185 : 190
  return Array.from({ length: n }, (_, i) => {
    const t = ((start + ((end - start) * i) / (n - 1)) * Math.PI) / 180
    return { x: Math.round(cx + rx * Math.cos(t)), y: Math.round(cy + ry * Math.sin(t)) }
  })
}

export function spriteSize(n: number): number {
  if (n <= 5) return 100
  if (n <= 7) return 92
  if (n <= 9) return 82
  return 72
}
