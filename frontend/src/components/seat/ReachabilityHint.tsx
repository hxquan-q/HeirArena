import { PixelAlert, PixelProgress, PixelSkeleton } from '@pxlkit/ui-kit'
import { useCaseDraft } from '../../store/useCaseDraft'

export default function ReachabilityHint() {
  const analysis = useCaseDraft((s) => s.analysis)
  const analyzing = useCaseDraft((s) => s.analyzing)
  const analysisErr = useCaseDraft((s) => s.analysisErr)
  const c = useCaseDraft((s) => s.c)
  const playerId = c.seat?.player_id
  const row = analysis?.matrix.find((r) => r.member_id === playerId)
  const reach = analysis?.reachability

  if (analysisErr) {
    return <PixelAlert tone="red" message={analysisErr} />
  }
  if (analyzing && !reach) {
    return <PixelSkeleton height="4.5rem" width="100%" ariaLabel="正在计算可达区间" />
  }
  if (!reach) return null

  const span = Math.max(reach.high - reach.low, 0.01)
  const legalPos = Math.min(100, Math.max(0, ((reach.legal_pct - reach.low) / span) * 100))
  const noShare = Boolean(row?.no_legal_share_reason)

  return (
    <div className="panel-inset space-y-2 p-3">
      <div className="pixel-text text-[12px] text-gold-400">这一席的法定基线与可达区间</div>
      <div className="relative">
        <PixelProgress value={legalPos} tone="gold" label="法定基线在可达区间中的位置" showValue={false} />
        <div className="mt-1 flex justify-between text-[10px] text-ink-400">
          <span>下限 {reach.low.toFixed(1)}%</span>
          <span className="text-gold-300">法定 {reach.legal_pct.toFixed(1)}%</span>
          <span>上限 {reach.high.toFixed(1)}%</span>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-ink-400">
        法定基线 {reach.legal_pct.toFixed(1)}% · 可达区间 {reach.low.toFixed(1)}%~{reach.high.toFixed(1)}%
        {reach.value_low != null && reach.value_high != null && (
          <> · 价值份额区间 {reach.value_low.toFixed(1)}%~{reach.value_high.toFixed(1)}%（含房产等不可分资产与折价补偿）</>
        )}
      </p>
      {noShare && row?.no_legal_share_reason && (
        <PixelAlert
          tone="gold"
          label="无法定份额"
          message={`${row.no_legal_share_reason} 你仍可入局：可争取第 1131 条酌分（需证明扶养事实）或通过协商取得资产。`}
        />
      )}
    </div>
  )
}
