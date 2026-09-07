import { AnimatedPxlKitIcon } from '@pxlkit/core'
import { CoinSpin } from '@pxlkit/gamification'
import { motion } from 'motion/react'
import { useMemo } from 'react'

interface Coin {
  id: number
  x: number
  delay: number
  dur: number
  size: number
  drift: number
}

/** 确定性伪随机（mulberry32）：渲染必须纯净，撒币阵型按索引固定 */
function rand(seed: number): number {
  let t = seed + 0x6d2b79f5
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** 闭庭撒币：一把旋转的像素金币从舞台上方落下，加速下坠模拟重力。 */
export default function CoinRain({ count = 26 }: { count?: number }) {
  const coins = useMemo<Coin[]>(() => Array.from({ length: count }, (_, i) => ({
    id: i,
    x: rand(i * 5 + 1) * 96,
    delay: rand(i * 5 + 2) * 1.8,
    dur: 2.1 + rand(i * 5 + 3) * 1.7,
    size: 13 + Math.round(rand(i * 5 + 4) * 13),
    drift: (rand(i * 5 + 5) - 0.5) * 70,
  })), [count])

  return (
    <div className="pointer-events-none absolute inset-0 z-[870] overflow-hidden" aria-hidden>
      {coins.map((c) => (
        <motion.span
          key={c.id}
          className="absolute top-0 drop-shadow-[2px_3px_0_rgba(0,0,0,.45)]"
          style={{ left: `${c.x}%` }}
          initial={{ y: -64, x: 0, opacity: 0 }}
          animate={{ y: 900, x: c.drift, opacity: [0, 1, 1, 0.85] }}
          /* 重力加速 + 按 30 帧量化：像老游戏一样一格一格往下掉 */
          transition={{ duration: c.dur, delay: c.delay, ease: (t) => Math.floor(t * t * 30) / 30 }}
        >
          <AnimatedPxlKitIcon icon={CoinSpin} size={c.size} appearance="palette" />
        </motion.span>
      ))}
    </div>
  )
}
