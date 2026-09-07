import { motion } from 'motion/react'
import type { EvidenceCard } from '../../lib/evidence'

interface Props {
  cards: EvidenceCard[]
  seen: Set<string>
  onOpen: (cardId?: string) => void
}

const KIND_LABEL: Record<EvidenceCard['kind'], string> = { submission: '举证', testimony: '证言', asset: '资产', fact: '事实' }
const KIND_TONE: Record<EvidenceCard['kind'], string> = {
  submission: '#f3d38a',
  testimony: '#7fd9ad',
  asset: '#e2b25a',
  fact: '#a58bff',
}

/** 左侧证据卡牌：紧凑列表，权重条 + 解锁状态，点一张在宝箱里放大看。 */
export default function EvidenceRail({ cards, seen, onOpen }: Props) {
  const unlocked = cards.filter((c) => c.unlocked).length
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-1.5 flex items-center justify-between text-[10px] text-ink-400">
        <span className="font-mono">{unlocked}/{cards.length} 已浮出</span>
        <button type="button" className="pixel-text text-[11px] text-gold-300 hover:underline" onClick={() => onOpen()}>证据总览 ▸</button>
      </div>
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {cards.map((c) => {
          const fresh = c.unlocked && !seen.has(c.id) && c.kind !== 'fact'
          return (
            <li key={c.id}>
              <motion.button type="button" layout onClick={() => onOpen(c.id)}
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                className={`relative flex w-full items-center gap-2 border-2 px-2 py-1.5 text-left transition ${c.unlocked
                  ? 'border-ink-600 bg-ink-900 hover:border-gold-600'
                  : 'border-dashed border-ink-700 bg-ink-950/60 opacity-70 hover:opacity-100'}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center border-2 border-ink-950 text-[16px] shadow-[2px_2px_0_rgba(0,0,0,.5)] ${c.unlocked ? 'bg-ink-800' : 'bg-ink-900 grayscale'}`} aria-hidden>
                  {c.unlocked ? c.emoji : '🔒'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span className="pixel-text shrink-0 text-[9px] leading-3" style={{ color: KIND_TONE[c.kind] }}>{KIND_LABEL[c.kind]}</span>
                    <span className="truncate text-[11px] leading-4 text-ink-100">{c.title}</span>
                  </span>
                  <span className="block truncate text-[10px] text-ink-400">{c.unlocked ? c.subtitle : '尚未被提及'}</span>
                  <span className="hp-track mt-1 block h-1.5 overflow-hidden">
                    <motion.span className="block h-full" animate={{ width: `${c.unlocked ? c.weight : 0}%` }} transition={{ duration: 0.5 }}
                      style={{ background: c.contested ? '#ea6a5b' : KIND_TONE[c.kind] }} />
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="font-mono text-[10px] text-ink-300">{c.unlocked ? `${c.weight}%` : '—'}</span>
                  {c.contested && <span className="pixel-text text-[9px] leading-3 text-seal-400">争夺中</span>}
                </span>
                {fresh && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 animate-blink-step border border-ink-950 bg-gold-400" aria-label="新证据" />}
              </motion.button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
