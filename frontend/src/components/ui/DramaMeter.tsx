import { PxlKitIcon } from '@pxlkit/core'
import { Fire } from '@pxlkit/gamification'
import { PixelProgress } from '@pxlkit/ui-kit'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import type { Turn } from '../../types'

/**
 * 庭审戏剧指数条：从已落定的发言动作里统计火药味。
 * 戏剧值 = 攻击×3 + 恳求×2 + 结盟×2 + 让步×1 + 提案×1；
 * 进度条是"火药味"——攻击（含部分恳求）占全部动作的比例。
 */
export default function DramaMeter({ turns }: { turns: Turn[] }) {
  const { counts, drama, heat } = useMemo(() => {
    const counts: Record<string, number> = { attack: 0, ally: 0, concede: 0, plead: 0, propose: 0 }
    for (const t of turns) {
      if (t.done && t.meta) counts[t.meta.action] = (counts[t.meta.action] ?? 0) + 1
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    const drama = counts.attack * 3 + counts.plead * 2 + counts.ally * 2 + counts.concede + counts.propose
    const heat = total ? Math.round(((counts.attack + counts.plead * 0.6) / total) * 100) : 0
    return { counts, drama, heat }
  }, [turns])

  return (
    <div
      className="flex shrink-0 flex-col justify-center gap-1 border-l-2 border-ink-700 pl-2.5"
      title={`攻击 ${counts.attack} · 结盟 ${counts.ally} · 让步 ${counts.concede} · 恳求 ${counts.plead} · 提案 ${counts.propose}`}
    >
      <div className="flex items-center gap-1.5 text-[10px] leading-none">
        <PxlKitIcon icon={Fire} size={12} aria-hidden />
        <span className="font-semibold text-ink-200">戏剧</span>
        <motion.span
          key={drama}
          initial={{ scale: 1.5, color: '#f3d38a' }}
          animate={{ scale: 1, color: '#e2b25a' }}
          transition={{ type: 'spring', stiffness: 420, damping: 18 }}
          className="font-mono text-[11px] font-bold"
        >
          {drama}
        </motion.span>
        <span className="text-ink-400">⚔{counts.attack} 🤝{counts.ally}</span>
      </div>
      <div className="w-[104px]">
        <PixelProgress
          value={heat}
          tone={heat > 55 ? 'red' : 'gold'}
          showValue={false}
          aria-label="火药味"
        />
      </div>
    </div>
  )
}
