import { PixelStatCard } from '@pxlkit/ui-kit'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Gavel } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { PERSONALITIES } from '../../data/presets'
import { sfx } from '../../lib/sfx'
import type { CaseInput, LegalResult, Member } from '../../types'
import { Balance as PixelBalance, Gavel as PixelGavel } from '../icons/pixel'

const VoxelStage = lazy(() => import('../scene3d/VoxelStage'))

interface Props {
  c: CaseInput
  preview: LegalResult | null
  previewErr: string | null
  valid: boolean
  submitting: boolean
  submitErr: string | null
  onStart?: () => void
  /** 是否显示 3D 体素图腾（窄屏关掉） */
  sigil?: boolean
}

function caseNo(name: string): string {
  let h = 5381
  for (const ch of name) h = ((h << 5) + h + ch.charCodeAt(0)) | 0
  return `HA-${String(Math.abs(h) % 10000).padStart(4, '0')}`
}

/** 羊皮纸法庭记录：卷宗速览 + 法定份额 + 火漆印 + 开庭。 */
export default function CourtRecord({ c, preview, previewErr, valid, submitting, submitErr, onStart, sigil = true }: Props) {
  const [balance, setBalance] = useState(false)
  const total = c.assets.reduce((s, a) => s + (Number(a.value) || 0), 0)
  const eligible = preview?.shares.filter((s) => s.eligible && s.percent > 0).length ?? 0
  const missing = [
    !c.decedent_name.trim() && '逝者姓名',
    !c.assets.some((a) => a.name.trim()) && '至少一项资产',
    !c.members.some((m) => m.name.trim()) && '至少一位出席者',
  ].filter(Boolean) as string[]

  return (
    <section className="parchment paper-card p-1" aria-label="法庭记录">
      <div className="border-b-2 border-dashed border-paper-400 px-4 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="pixel-text text-[12px] tracking-[0.14em] text-paper-muted">COURT RECORD · 法庭记录</div>
            <h3 className="pixel-text mt-1 truncate text-[20px] leading-6 text-paper-ink">
              {c.decedent_name || '未命名'}的遗产卷宗
            </h3>
          </div>
          <span className="pixel-text shrink-0 border-2 border-paper-ink bg-paper-100 px-1.5 py-0.5 text-[12px] text-paper-ink">
            卷号 {caseNo(c.decedent_name || 'draft')}
          </span>
        </div>
      </div>

      {sigil && (
        <div className="relative flex h-[132px] items-center justify-center overflow-hidden border-b-2 border-dashed border-paper-400 bg-[radial-gradient(circle_at_50%_60%,rgba(143,101,34,.18),transparent_62%)]">
          <button type="button" onClick={() => setBalance((v) => !v)}
            className="pixel-text absolute top-2 right-3 border-2 border-paper-ink bg-paper-100 px-1.5 text-[12px] text-paper-muted shadow-[2px_2px_0_#2b1c10] active:translate-x-px active:translate-y-px active:shadow-none"
            title={balance ? '切换为法槌' : '切换为天平'}>
            {balance ? 'BALANCE' : 'GAVEL'}
          </button>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={balance ? 'b' : 'g'} initial={{ opacity: 0, rotateY: 40 }} animate={{ opacity: 1, rotateY: 0 }} exit={{ opacity: 0, rotateY: -40 }} transition={{ duration: 0.25 }}>
              <Suspense fallback={<div className="pixel-text flex h-[120px] w-[120px] items-center justify-center text-[12px] text-paper-muted">LOADING…</div>}>
                <VoxelStage icon={balance ? PixelBalance : PixelGavel} size={120} spin={0.5} bob={0.05} glow="rgba(143,101,34,.28)" />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 p-3">
        <PixelStatCard label="资产估值" value={`${total.toFixed(total >= 100 ? 0 : 1)} 万`} size="sm" tone="neutral" align="start" />
        <PixelStatCard label="出席角色" value={`${c.members.length} 位`} size="sm" tone="neutral" align="start" />
        <PixelStatCard label="辩论轮数" value={`${c.rounds} 轮`} size="sm" tone="neutral" align="start" />
        <PixelStatCard label="法定继承人" value={preview ? `${eligible} 位` : '—'} size="sm" tone="gold" valueTone align="start" />
      </div>

      <div className="px-3 pb-3">
        <div className="pixel-text mb-1.5 flex items-center justify-between text-[12px] text-paper-muted">
          <span>法定参考份额</span>
          {preview && <span>净额 {preview.estate_total} 万</span>}
        </div>
        <ShareBar preview={preview} previewErr={previewErr} members={c.members} onPaper />
        {preview && (
          <div className="mt-1.5 text-[11px] leading-relaxed text-paper-muted">
            {preview.community_deduction > 0 && <>配偶先析产 {preview.community_deduction} 万 · </>}
            适用第{preview.order_used === 1 ? '一' : preview.order_used === 2 ? '二' : '—'}顺序继承
          </div>
        )}
      </div>

      <div className="relative flex items-center gap-3 border-t-2 border-dashed border-paper-400 px-3 pt-3 pb-3">
        <WaxSeal valid={valid} />
        <div className="min-w-0 flex-1">
          {onStart ? (
            <button className="btn-gold w-full justify-center" disabled={!valid || submitting} onClick={onStart}>
              <Gavel size={15} /> {submitting ? '正在传唤…' : '开庭'} {!submitting && <ArrowRight size={14} />}
            </button>
          ) : (
            <p className="pixel-text text-[12px] text-paper-muted">翻到第 IV 卷「入局」再开庭</p>
          )}
          <p className="mt-1.5 text-[11px] leading-snug text-paper-muted">
            {valid ? '卷宗齐备，火漆已封。' : `待补：${missing.join('、')}`}
          </p>
          {submitErr && <p className="mt-1 text-[11px] text-seal-700">{submitErr}</p>}
        </div>
      </div>
    </section>
  )
}

/** 火漆印：卷宗齐备时「盖」下来，并配一声闷响（首次挂载已齐备则不响）。 */
function WaxSeal({ valid }: { valid: boolean }) {
  const prev = useRef(valid)
  useEffect(() => {
    if (valid && !prev.current) sfx('stamp')
    prev.current = valid
  }, [valid])
  return (
    <div className="relative h-16 w-16 shrink-0" aria-hidden>
      <AnimatePresence mode="wait" initial={false}>
        {valid ? (
          <motion.div key="sealed" className="absolute inset-0 animate-stamp"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-seal-700 bg-[radial-gradient(circle_at_40%_35%,#ea6a5b,#d9483b_55%,#b83a2f)] shadow-[2px_3px_0_rgba(43,28,16,.55)]">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-seal-400/70">
                <span className="pixel-text text-[16px] leading-none text-paper-100" style={{ textShadow: '1px 1px 0 #8e2a22' }}>准</span>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div key="pending" className="absolute inset-0 flex items-center justify-center rounded-full border-2 border-dashed border-paper-muted/60"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span className="pixel-text text-[12px] text-paper-muted">待封</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** HP 条式份额条：颜色跟着角色性格走。 */
export function ShareBar({ preview, previewErr, members, compact, onPaper }: {
  preview: LegalResult | null; previewErr: string | null; members: Member[]; compact?: boolean; onPaper?: boolean
}) {
  if (previewErr) return <div className={`truncate text-[11px] ${onPaper ? 'text-seal-700' : 'text-seal-400'}`}>{previewErr}</div>
  if (!preview) return <div className={`hp-track w-full animate-blink-step ${compact ? 'h-3' : 'h-5'}`} />
  const shares = preview.shares.filter((s) => s.percent > 0)
  return (
    <div className={`hp-track flex w-full overflow-hidden ${compact ? 'h-3' : 'h-5'}`} role="img" aria-label={shares.map((s) => `${s.name} ${s.percent.toFixed(0)}%`).join('，')}>
      {shares.map((s) => {
        const color = PERSONALITIES.find((p) => p.value === members.find((m) => m.id === s.member_id)?.personality)?.color ?? '#a08d78'
        return (
          <div key={s.member_id} className="pixel-text flex items-center justify-center overflow-hidden whitespace-nowrap border-r-2 border-ink-950 text-[12px] text-ink-950 last:border-r-0"
            style={{ width: `${s.percent}%`, background: color, boxShadow: 'inset 0 -3px 0 rgba(0,0,0,.25), inset 0 2px 0 rgba(255,255,255,.28)' }}
            title={`${s.name} ${s.percent}%`}>
            {!compact && s.percent > 12 ? `${s.name} ${s.percent.toFixed(0)}%` : ''}
          </div>
        )
      })}
    </div>
  )
}
