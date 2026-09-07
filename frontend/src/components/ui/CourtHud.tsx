import { PxlKitIcon } from '@pxlkit/core'
import { Coin } from '@pxlkit/gamification'

interface Props {
  /** mm:ss */
  elapsed: string
  /** 遗产净额（万），未知时不显示 */
  estate?: number | string | null
  /** 当前幕的罗马数字；开庭前传 '·' */
  roman: string
  /** 幕名，如「辩论 1」 */
  phase: string
  /** 幕的强调色 */
  accent: string
  className?: string
}

/** 12×12 像素挂钟：表盘 + 指针 */
function PixelClock() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" shapeRendering="crispEdges" aria-hidden>
      <rect x="2" y="0" width="8" height="1" fill="#f6ecd3" />
      <rect x="1" y="1" width="10" height="1" fill="#f6ecd3" />
      <rect x="0" y="2" width="12" height="8" fill="#f6ecd3" />
      <rect x="1" y="10" width="10" height="1" fill="#f6ecd3" />
      <rect x="2" y="11" width="8" height="1" fill="#f6ecd3" />
      <rect x="5" y="2" width="2" height="4" fill="#2b1c10" />
      <rect x="5" y="5" width="4" height="2" fill="#d9483b" />
      <rect x="5" y="5" width="2" height="2" fill="#2b1c10" />
    </svg>
  )
}

/**
 * 星露谷右上角那块木牌：时间 · 金币 · 日期，这里对应 庭审用时 · 遗产净额 · 当前幕。
 * 木头用两段色阶 + 顶部高光线 + 硬阴影，格与格之间是深色接缝。
 */
export default function CourtHud({ elapsed, estate, roman, phase, accent, className = 'flex' }: Props) {
  return (
    <div
      className={`pixel-text h-9 items-stretch border-2 border-[#8a5a34] bg-[#3a2414] text-[12px] leading-none text-ink-100 ${className}`}
      style={{ boxShadow: 'inset 0 2px 0 #5c3a21, inset 0 -2px 0 #1e130b, 3px 3px 0 rgba(0,0,0,.6)' }}
      role="group"
      aria-label="庭审状态"
    >
      <span className="flex items-center gap-1.5 px-2.5" title="庭审已进行">
        <PixelClock />
        <span className="tabular-nums tracking-[0.06em]">{elapsed}</span>
      </span>
      {estate != null && estate !== '' && (
        <>
          <span className="w-0.5 bg-[#1e130b]" aria-hidden />
          <span className="flex items-center gap-1.5 px-2.5 text-gold-300" title="可供继承的遗产净额">
            <PxlKitIcon icon={Coin} size={12} />
            <span className="tabular-nums">{estate}</span>
            <span className="text-[10px] text-ink-300">万</span>
          </span>
        </>
      )}
      <span className="w-0.5 bg-[#1e130b]" aria-hidden />
      <span className="flex items-center gap-1.5 pr-2.5 pl-2" title="当前幕">
        <span className="flex h-5 min-w-5 items-center justify-center border-2 px-1 text-[11px]"
          style={{ borderColor: accent, color: accent, background: `${accent}22` }}>
          {roman}
        </span>
        <span className="hidden max-w-[7em] truncate lg:inline">{phase}</span>
      </span>
    </div>
  )
}
