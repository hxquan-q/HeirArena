import { useMemo } from 'react'

/** 确定性伪随机（mulberry32）：粒子阵型按索引固定，渲染保持纯净 */
function rand(seed: number): number {
  let t = seed + 0x6d2b79f5
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * 夜间萤火 / 浮尘：一把 3–5px 的暖色方块散在画面里，各自错峰、按帧往上飘。
 * 只作氛围，pointer-events 关掉；prefers-reduced-motion 下由全局规则停掉动画。
 */
export default function Fireflies({ count = 16, className = '' }: { count?: number; className?: string }) {
  const motes = useMemo(() => Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${6 + rand(i * 7 + 1) * 88}%`,
    top: `${18 + rand(i * 7 + 2) * 70}%`,
    size: 3 + Math.round(rand(i * 7 + 3) * 2),
    delay: `${-rand(i * 7 + 4) * 7}s`,
    duration: `${6 + rand(i * 7 + 5) * 4}s`,
    color: rand(i * 7 + 6) > 0.35 ? '#f3d38a' : '#7fd9ad',
  })), [count])

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      {motes.map((m) => (
        <span
          key={m.id}
          className="animate-firefly absolute block"
          style={{
            left: m.left,
            top: m.top,
            width: m.size,
            height: m.size,
            background: m.color,
            boxShadow: `0 0 0 ${m.size}px ${m.color}22`,
            animationDelay: m.delay,
            animationDuration: m.duration,
          }}
        />
      ))}
    </div>
  )
}
