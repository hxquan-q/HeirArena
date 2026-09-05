import { PixelAlert, PixelBadge, PixelProgress, PixelTypewriter } from '@pxlkit/ui-kit'
import { AnimatePresence, motion } from 'motion/react'
import { api } from '../../api/client'
import { cleanDraft, useCaseDraft } from '../../store/useCaseDraft'
import GameTablesView from './GameTablesView'
import StrategyMatrix from './StrategyMatrix'

interface Props {
  onManageProviders: () => void
}

export default function StrategyPanel({ onManageProviders }: Props) {
  const c = useCaseDraft((s) => s.c)
  const setStrategy = useCaseDraft((s) => s.setStrategy)
  const setStrategizing = useCaseDraft((s) => s.setStrategizing)
  const setStrategyErr = useCaseDraft((s) => s.setStrategyErr)
  const strategizing = useCaseDraft((s) => s.strategizing)
  const strategyErr = useCaseDraft((s) => s.strategyErr)
  const strategyStale = useCaseDraft((s) => s.strategyStale)
  const strategy = c.seat?.strategy
  const degraded = strategy?.generated_by === 'rules' || (strategy?.warnings ?? []).some((w) => w.includes('未接入军师模型'))

  const run = async () => {
    setStrategizing(true)
    setStrategyErr(null)
    try {
      const pack = await api.seatStrategy(cleanDraft(c))
      setStrategy(pack)
    } catch (e) {
      setStrategyErr((e as Error).message)
    } finally {
      setStrategizing(false)
    }
  }

  return (
    <div className="relative space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-gold h-9 px-4" disabled={strategizing} onClick={() => void run()}>
          {strategy ? '重新推演' : '推演策略'}
        </button>
        {strategy && (
          <>
            <PixelBadge tone={degraded ? 'gold' : 'green'} size="sm">
              {strategy.generated_by === 'rules' ? '规则版' : strategy.generated_by}
            </PixelBadge>
            <span className="text-[11px] text-ink-400">
              {strategy.generated_at ? new Date(strategy.generated_at * 1000).toLocaleString() : ''}
            </span>
          </>
        )}
      </div>

      {strategyStale && !strategy && (
        <PixelAlert tone="gold" message="诉求已变化，需重新推演" />
      )}
      {strategyErr && <PixelAlert tone="red" message={strategyErr} />}
      {degraded && (
        <PixelAlert
          tone="gold"
          label="未接入军师模型"
          message="简报为规则版；剧本对手不会执行策略。确定性矩阵与风险提示仍可用。"
          action={<button type="button" className="btn-gold h-8 px-3 text-[11px]" onClick={onManageProviders}>去接入供应商</button>}
        />
      )}
      {strategy?.warnings.filter((w) => !w.includes('未接入军师模型')).map((w) => (
        <PixelAlert key={w} tone="gold" message={w} />
      ))}

      {strategy && (
        <>
          <StrategyMatrix />
          <GameTablesView />
        </>
      )}
      {!strategy && <GameTablesView />}

      <AnimatePresence>
        {strategizing && (
          <motion.div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-ink-950/85 p-6 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <PixelTypewriter label="军师正在为每一席写简报…" speed={28} cursor tone="gold" className="pixel-text max-w-[420px] text-[14px] text-gold-300" />
            <div className="w-full max-w-[320px]">
              <PixelProgress value={0} indeterminate tone="gold" label="推演进度" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
