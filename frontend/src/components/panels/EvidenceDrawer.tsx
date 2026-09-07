import { PxlKitIcon } from '@pxlkit/core'
import { LootChest, Scroll } from '@pxlkit/gamification'
import { PixelBadge, PixelDrawer, PixelSegmented } from '@pxlkit/ui-kit'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import type { EvidenceCard, EvidenceKind } from '../../lib/evidence'
import type { CaseInput } from '../../types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  cards: EvidenceCard[]
  caseData: CaseInput
  /** 打开时定位到这张卡 */
  focusId?: string | null
  /** 选卡模式：出示证据时由玩家挑一张 */
  pickMode?: boolean
  pickCost?: number
  onPick?: (card: EvidenceCard) => void
  onJumpToTurn?: (turnId: string) => void
}

const KIND_LABEL: Record<EvidenceKind | 'all', string> = {
  all: '全部',
  submission: '庭上举证',
  testimony: '当庭证言',
  asset: '遗产',
  fact: '卷宗事实',
}

/** 证据宝箱：卷宗案情 + 全部证据卡牌的大图模式；出示证据时切成选卡模式。 */
export default function EvidenceDrawer({ open, onOpenChange, cards, caseData, focusId, pickMode, pickCost, onPick, onJumpToTurn }: Props) {
  const [kind, setKind] = useState<EvidenceKind | 'all'>('all')
  // 每次重新打开都回到"全部"：在渲染期间同步派生，而不是在 effect 里 setState
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setKind('all')
  }
  useEffect(() => {
    if (!open || !focusId) return
    const t = setTimeout(() => document.getElementById(`evidence-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120)
    return () => clearTimeout(t)
  }, [open, focusId])

  const shown = useMemo(() => cards.filter((c) => kind === 'all' || c.kind === kind), [cards, kind])
  const unlocked = cards.filter((c) => c.unlocked).length

  return (
    <PixelDrawer open={open} onOpenChange={onOpenChange} side="right" size="lg" title={pickMode ? '选择要出示的证据' : '证据宝箱 · 卷宗总览'}
      description={pickMode ? `以 ${caseData.decedent_name} 的幽灵之名亮出一张卡，消耗 ${pickCost ?? 0} 点显灵能量` : `${unlocked}/${cards.length} 张证据已浮出水面`}>
      {/* Pxlkit 把 title/description 放在 sr-only 里，这里再画一个可见的像素抬头 */}
      <PixelDrawer.Header>
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center border-2 border-ink-950 shadow-[2px_2px_0_rgba(0,0,0,.5)] ${pickMode ? 'bg-ghost-700/40' : 'bg-gold-600/30'}`}>
            <PxlKitIcon icon={LootChest} size={22} />
          </span>
          <div className="min-w-0">
            <div className="pixel-text text-[16px] leading-5 text-ink-100">{pickMode ? '选择要出示的证据' : '证据宝箱 · 卷宗总览'}</div>
            <div className="truncate text-[11px] text-ink-400">
              {pickMode ? `以 ${caseData.decedent_name} 的幽灵之名亮出一张卡 · 消耗 ${pickCost ?? 0} 点显灵能量` : `${unlocked}/${cards.length} 张证据已浮出水面 · 点相关发言可跳回记录`}
            </div>
          </div>
        </div>
      </PixelDrawer.Header>
      <PixelDrawer.Body>
        {!pickMode && caseData.story && (
          <blockquote className="parchment paper-card mb-3 px-3 py-2 text-[12px] leading-relaxed">
            <span className="pixel-text mr-1.5 text-[10px] text-paper-muted">案情 ·</span>
            {caseData.story}
          </blockquote>
        )}
        <div className="mb-3">
          <PixelSegmented value={kind} onChange={(v) => setKind(v as EvidenceKind | 'all')} tone="gold" aria-label="证据类型"
            options={(['all', 'submission', 'testimony', 'asset', 'fact'] as const).map((k) => ({
              value: k, label: `${KIND_LABEL[k]} ${k === 'all' ? cards.length : cards.filter((c) => c.kind === k).length}`,
            }))} />
        </div>
        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-[12px] text-ink-400">
            <PxlKitIcon icon={LootChest} size={32} />
            这一格还是空的，等他们吵起来就有了。
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {shown.map((c, i) => {
              const canPick = pickMode && c.unlocked
              const focused = focusId === c.id
              return (
                <motion.div key={c.id} id={`evidence-${c.id}`} layout
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, rotate: c.unlocked ? (i % 2 ? 0.5 : -0.5) : 0 }}
                  transition={{ delay: Math.min(i, 8) * 0.04 }}
                  role={canPick ? 'button' : undefined} tabIndex={canPick ? 0 : undefined}
                  onClick={canPick ? () => onPick?.(c) : undefined}
                  onKeyDown={canPick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick?.(c) } } : undefined}
                  className={`relative border-2 px-3 pt-4 pb-3 shadow-[3px_3px_0_rgba(0,0,0,.5)] ${c.unlocked
                    ? `border-dashed bg-[linear-gradient(165deg,rgba(233,190,111,.08),rgba(0,0,0,.3))] ${focused ? 'border-gold-300' : 'border-gold-500/40'} ${canPick ? 'cursor-pointer hover:border-gold-300 hover:bg-gold-500/10' : ''}`
                    : 'border-ink-700 bg-ink-950/70 opacity-60'}`}>
                  <span className={`pixel-text absolute -top-2.5 left-2 border px-1.5 text-[10px] leading-4 shadow-[1.5px_1.5px_0_rgba(0,0,0,.6)] ${c.unlocked ? 'border-gold-600 bg-ink-950 text-gold-300' : 'border-ink-600 bg-ink-950 text-ink-400'}`}>
                    {KIND_LABEL[c.kind]} {String(i + 1).padStart(2, '0')}
                  </span>
                  {c.contested && <PixelBadge tone="red" size="sm" variant="solid" className="absolute -top-2.5 right-2">争夺中</PixelBadge>}
                  <div className="flex items-start gap-2.5">
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center border-2 border-ink-950 text-[22px] shadow-[2px_2px_0_rgba(0,0,0,.5)] ${c.unlocked ? 'bg-ink-800' : 'bg-ink-900 grayscale'}`} aria-hidden>
                      {c.unlocked ? c.emoji : '🔒'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] leading-snug text-ink-100">{c.title}</div>
                      <div className="mt-0.5 text-[11px] text-ink-400">{c.unlocked ? c.subtitle : '尚未被任何人提及'}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-ink-400">
                    <span className="shrink-0">权重</span>
                    <span className="hp-track h-2 flex-1 overflow-hidden">
                      <span className="block h-full" style={{ width: `${c.unlocked ? c.weight : 0}%`, background: c.contested ? '#ea6a5b' : '#e2b25a' }} />
                    </span>
                    <span className="font-mono text-ink-200">{c.unlocked ? `${c.weight}%` : '—'}</span>
                  </div>
                  {c.unlocked && (
                    <div className="mt-2 border-t border-dashed border-ink-700 pt-2 text-[11px] leading-relaxed text-ghost-300">
                      <span className="mr-1 text-ink-400">{c.kind === 'submission' ? '材料摘要 ·' : '幽灵台词 ·'}</span>{c.quip}
                    </div>
                  )}
                  {!pickMode && c.turnIds.length > 0 && onJumpToTurn && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span className="text-[10px] text-ink-400"><PxlKitIcon icon={Scroll} size={10} /> 相关发言</span>
                      {c.turnIds.slice(0, 4).map((tid) => (
                        <button key={tid} type="button" onClick={() => { onJumpToTurn(tid); onOpenChange(false) }}
                          className="chip border-ghost-700 bg-ghost-700/20 px-1.5 font-mono text-[9px] text-ghost-300 hover:border-ghost-400">
                          {tid.slice(0, 6)}
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
      </PixelDrawer.Body>
      {pickMode && (
        <PixelDrawer.Footer>
          <div className="flex w-full items-center justify-between text-[11px] text-ink-400">
            <span>只有已浮出水面的证据能出示</span>
            <button type="button" className="btn-ghost h-8 px-3 text-[11px]" onClick={() => onOpenChange(false)}>取消</button>
          </div>
        </PixelDrawer.Footer>
      )}
    </PixelDrawer>
  )
}
