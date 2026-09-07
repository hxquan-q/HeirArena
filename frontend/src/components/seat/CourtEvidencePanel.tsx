import { PxlKitIcon } from '@pxlkit/core'
import { Scroll } from '@pxlkit/gamification'
import { PixelAccordion, PixelAlert, PixelButton, PixelTextarea, useToast } from '@pxlkit/ui-kit'
import { useMemo, useState } from 'react'
import { api } from '../../api/client'
import { sfx } from '../../lib/sfx'
import { useCourt } from '../../store/useCourt'

interface Props {
  sessionId: string
}

export default function CourtEvidencePanel({ sessionId }: Props) {
  const awaiting = useCourt((state) => state.awaiting)
  const options = useCourt((state) => state.evidenceOptions)
  const submitted = useCourt((state) => state.submittedEvidence)
  const { toast } = useToast()
  const [factKey, setFactKey] = useState('')
  const [evidenceType, setEvidenceType] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [optimisticSubmissions, setOptimisticSubmissions] = useState<{
    turnKey: string
    factKey: string
  }[]>([])

  const available = useMemo(
    () => options.filter(
      (option) => !optimisticSubmissions.some((item) => item.factKey === option.fact_key)
        && !submitted.some((item) => item.fact_key === option.fact_key),
    ),
    [options, optimisticSubmissions, submitted],
  )
  const selected = available.find((option) => option.fact_key === factKey)
  const usedThisTurn = Boolean(
    awaiting && (
      optimisticSubmissions.some((item) => item.turnKey === awaiting.turn_key)
      || submitted.some((item) => item.turn_key === awaiting.turn_key)
    ),
  )

  if (!awaiting) return null

  const chooseFact = (next: string) => {
    const option = available.find((item) => item.fact_key === next)
    setFactKey(next)
    setEvidenceType(option?.evidence_types[0] ?? '')
  }

  const submit = async () => {
    if (!selected || !evidenceType || note.trim().length < 2 || busy || usedThisTurn) return
    const turnKey = awaiting.turn_key
    const submittedFactKey = selected.fact_key
    setBusy(true)
    try {
      await api.submitEvidence(sessionId, {
        fact_key: submittedFactKey,
        evidence_type: evidenceType,
        note: note.trim(),
      })
      setOptimisticSubmissions((current) => (
        current.some((item) => item.factKey === submittedFactKey)
          ? current
          : [...current, { turnKey, factKey: submittedFactKey }]
      ))
      sfx('confirm')
      toast({
        title: '材料已提交',
        message: '本庭将在这次沙盘中采信，并由规则引擎重算法定基线。',
        tone: 'green',
      })
    } catch (error) {
      sfx('error')
      toast.error({ title: '举证失败', message: (error as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel-inset space-y-2.5 p-3" aria-labelledby="court-evidence-title">
      <div className="flex items-start gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-gold-700 bg-gold-600/10">
          <PxlKitIcon icon={Scroll} size={17} aria-hidden />
        </span>
        <div>
          <div id="court-evidence-title" className="pixel-text text-[12px] text-gold-300">庭上举证</div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-ink-400">
            每个发言回合最多提交一项。这里只模拟材料已完成真实性核验，不替代真实证据审查。
          </p>
        </div>
      </div>

      {usedThisTurn ? (
        <PixelAlert tone="gold" label="本回合已举证" message="你仍可继续发言；下一次轮到你时可提交另一项材料。" live="polite" />
      ) : available.length === 0 ? (
        <PixelAlert tone="gold" message="当前没有尚未举证、且会改变规则计算结果的待证事实。" live="polite" />
      ) : (
        <PixelAccordion
          collapsedByDefault
          items={[{
            id: 'court-evidence-form',
            title: `选择材料 · ${available.length} 项可举证`,
            content: (
              <div className="space-y-2.5 pt-1">
          <div role="group" aria-labelledby="evidence-fact-label" className="space-y-1.5">
            <div id="evidence-fact-label" className="text-[11px] text-ink-400">1. 选择待证事实</div>
            <div className="grid max-h-40 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
              {available.map((option) => {
                const active = option.fact_key === factKey
                const delta = `${option.delta_pct > 0 ? '+' : ''}${option.delta_pct.toFixed(1)}pt`
                return (
                  <PixelButton
                    key={option.fact_key}
                    type="button"
                    size="sm"
                    variant="ghost"
                    tone={option.direction === 'favorable' ? 'green' : 'red'}
                    aria-pressed={active}
                    onClick={() => chooseFact(option.fact_key)}
                    className={`min-h-11 justify-between text-left ${active ? 'border-gold-500 bg-gold-600/10' : ''}`}
                  >
                    <span className="min-w-0">
                      <span className="block text-[11px] leading-4">{option.label}</span>
                      <span className="block text-[9px] text-ink-400">第{option.article}条</span>
                    </span>
                    <span className={`shrink-0 font-mono text-[10px] ${option.delta_pct >= 0 ? 'text-jade-300' : 'text-seal-400'}`}>
                      对我 {delta}
                    </span>
                  </PixelButton>
                )
              })}
            </div>
          </div>

          {selected && (
            <>
              <div role="group" aria-labelledby="evidence-type-label" className="space-y-1.5">
                <div id="evidence-type-label" className="text-[11px] text-ink-400">2. 选择材料类型</div>
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                  {selected.evidence_types.map((type) => (
                    <PixelButton
                      key={type}
                      type="button"
                      size="sm"
                      variant="ghost"
                      tone="gold"
                      aria-pressed={evidenceType === type}
                      onClick={() => setEvidenceType(type)}
                      className={evidenceType === type ? 'border-gold-500 bg-gold-600/10' : ''}
                    >
                      {type}
                    </PixelButton>
                  ))}
                </div>
              </div>
              <div className="text-[10px] leading-relaxed text-ink-400">
                举证责任：{selected.burden}
                {selected.note ? <span className="block text-seal-300">限制：{selected.note}</span> : null}
              </div>
              <PixelTextarea
                label="3. 材料摘要（必填）"
                value={note}
                maxLength={240}
                showCount={{ max: 240 }}
                minRows={2}
                maxRows={4}
                autosize
                tone="gold"
                onChange={(event) => setNote(event.target.value.slice(0, 240))}
              />
              <div className="-mt-1 text-[9px] text-ink-400">2–240 字；只填写虚构或已脱敏内容</div>
              <PixelButton
                type="button"
                tone="gold"
                disabled={!evidenceType || note.trim().length < 2 || busy}
                loading={busy}
                onClick={() => void submit()}
              >
                提交并请求沙盘采信
              </PixelButton>
            </>
          )}
              </div>
            ),
          }]}
        />
      )}
    </section>
  )
}
