import { PixelAlert, PixelButton, PixelCheckbox, PixelNumberInput, PixelSegmented, PixelSelect, PixelTextarea, PixelTooltip, useToast } from '@pxlkit/ui-kit'
import { useMemo, useState, type ReactNode } from 'react'
import { api } from '../../api/client'
import { sfx } from '../../lib/sfx'
import { useCourt } from '../../store/useCourt'
import type { Action, PlayerSpeech } from '../../types'
import { draftAdmissions, emptySeatDraft, type SeatDraft } from './draft'

const PHASE_LABEL: Record<string, string> = {
  statements: '陈述',
  debate: '辩论',
  negotiation: '协商',
  opening: '开庭',
  verdict: '裁决',
}

const ACTION_OPTIONS = [
  { value: '', label: '由军师判断' },
  { value: 'attack', label: '攻击' },
  { value: 'ally', label: '结盟' },
  { value: 'propose', label: '提案' },
  { value: 'concede', label: '让步' },
  { value: 'plead', label: '恳求' },
]

interface Props {
  sessionId: string
  draft: SeatDraft
  onDraftChange: (draft: SeatDraft) => void
  cardsSlot?: ReactNode
  onOpenBrief: () => void
}

export default function SeatDock({ sessionId, draft, onDraftChange, cardsSlot, onOpenBrief }: Props) {
  const seat = useCourt((s) => s.seat)
  const awaiting = useCourt((s) => s.awaiting)
  const agents = useCourt((s) => s.agents)
  const caseData = useCourt((s) => s.caseData)
  const { toast } = useToast()
  const [busy, setBusy] = useState<'speak' | 'delegate' | null>(null)

  const me = agents.find((a) => a.id === seat?.playerId)
  const others = useMemo(
    () => agents.filter((a) => a.kind !== 'judge' && a.id !== seat?.playerId),
    [agents, seat?.playerId],
  )
  const assets = caseData?.assets ?? []
  const anyAdmission = draft.admitNeglect || draft.waiveShare || Boolean(draft.supportId)
  const phaseLabel = awaiting ? PHASE_LABEL[awaiting.phase] ?? awaiting.phase : ''
  const attackedName = awaiting?.attacked_by
    ? (agents.find((a) => a.id === awaiting.attacked_by)?.name ?? awaiting.attacked_by)
    : ''

  const patch = (partial: Partial<SeatDraft>) => onDraftChange({ ...draft, ...partial })

  const speak = async (delegate: boolean) => {
    if (busy) return
    setBusy(delegate ? 'delegate' : 'speak')
    try {
      if (delegate) {
        await api.speak(sessionId, { delegate: true })
      } else {
        const body: PlayerSpeech = {
          text: draft.text.trim().slice(0, 500),
          meta: { admissions: draftAdmissions(draft) },
        }
        if (draft.action) body.meta.action = draft.action
        if (draft.target) body.meta.target = draft.target
        if (Object.keys(draft.claims).length) body.meta.claims = draft.claims
        await api.speak(sessionId, body)
      }
      sfx('confirm')
      onDraftChange(emptySeatDraft())
    } catch (error) {
      sfx('error')
      toast.error({ title: delegate ? '代说失败' : '发言失败', message: (error as Error).message })
    } finally {
      setBusy(null)
    }
  }

  if (!seat) return null

  if (!awaiting) {
    return (
      <div className="panel-elevated flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="text-[12px] text-ink-300">
          本席由 {seat.human ? '我' : 'AI 代理'} 发言 · 你的席位：{me?.name ?? seat.playerId}
        </div>
        <PixelButton type="button" size="sm" variant="ghost" tone="gold" onClick={onOpenBrief}>
          我的简报
        </PixelButton>
      </div>
    )
  }

  const banner = [
    `${phaseLabel}${awaiting.round ? ` 第${awaiting.round}轮` : ''}`,
    awaiting.focus ? `焦点：${awaiting.focus}` : '',
    attackedName ? `${attackedName} 刚点名针对了你，先正面回应` : '',
  ].filter(Boolean).join(' · ')

  return (
    <div className="panel-elevated space-y-3 px-3 py-3">
      <PixelAlert tone="gold" label="轮到你了" message={banner || '请当庭发言'} live="polite" />

      {cardsSlot}

      {anyAdmission && (
        <PixelAlert tone="red" label="份额会变" message="这会直接改变份额，确定吗" live="assertive" />
      )}

      {draft.action === 'concede' && awaiting.phase === 'negotiation' && (
        <PixelAlert tone="gold" message="让步只记录谈判动作，不会自动改变份额；放弃份额必须在自认区显式勾选" live="polite" />
      )}

      <PixelTextarea
        label="当庭发言"
        value={draft.text}
        maxLength={500}
        showCount={{ max: 500 }}
        minRows={3}
        maxRows={6}
        autosize
        tone="gold"
        onChange={(e) => patch({ text: e.target.value.slice(0, 500) })}
      />

      <PixelSegmented
        label="动作"
        value={draft.action}
        tone="gold"
        options={ACTION_OPTIONS}
        onChange={(value) => patch({ action: value as Action | '' })}
      />

      <PixelSelect
        label="目标"
        value={draft.target}
        placeholder="可不选，交给军师"
        tone="gold"
        options={[{ value: '', label: '不指定' }, ...others.map((a) => ({ value: a.id, label: a.name }))]}
        onChange={(value) => patch({ target: value })}
      />

      {assets.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] text-ink-400">资产诉求（%，可空）</div>
          <div className="flex flex-wrap gap-2">
            {assets.map((asset) => (
              <div key={asset.id} className="flex items-end gap-1">
                <PixelNumberInput
                  label={asset.name}
                  min={0}
                  max={100}
                  step={1}
                  suffix="%"
                  size="sm"
                  value={draft.claims[asset.id]}
                  onChange={(n) => patch({ claims: { ...draft.claims, [asset.id]: n } })}
                />
                {draft.claims[asset.id] != null && (
                  <PixelButton
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mb-1"
                    onClick={() => {
                      const next = { ...draft.claims }
                      delete next[asset.id]
                      patch({ claims: next })
                    }}
                  >
                    清空
                  </PixelButton>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="text-[11px] text-ink-400">自认（只会按勾选记入，卡片不会自动勾）</div>
        <PixelTooltip content="第1130条：承认有能力却未尽扶养义务，少分 3 个百分点。">
          <PixelCheckbox
            label="我承认有能力却未尽扶养义务（第1130条，−3 个百分点）"
            checked={draft.admitNeglect}
            tone="red"
            onChange={(next) => patch({ admitNeglect: next })}
          />
        </PixelTooltip>
        <PixelTooltip content="第1132条：明确放弃一部分应得份额，少分 3 个百分点。">
          <PixelCheckbox
            label="我放弃一部分应得份额（第1132条，−3 个百分点）"
            checked={draft.waiveShare}
            tone="red"
            onChange={(next) => patch({ waiveShare: next })}
          />
        </PixelTooltip>
        <div className="flex flex-wrap items-center gap-2">
          <PixelTooltip content="第1130条：被两人以上确认后，对方多分 2 个百分点。">
            <PixelCheckbox
              label="我确认对方尽了主要扶养义务（第1130条，被两人以上确认后对方 +2）"
              checked={Boolean(draft.supportId)}
              tone="red"
              onChange={(next) => patch({ supportId: next ? (others[0]?.id ?? '') : '' })}
            />
          </PixelTooltip>
          {draft.supportId && (
            <PixelSelect
              label="确认谁"
              value={draft.supportId}
              tone="gold"
              options={others.map((a) => ({ value: a.id, label: a.name }))}
              onChange={(value) => patch({ supportId: value })}
            />
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <PixelButton
          type="button"
          tone="gold"
          disabled={!draft.text.trim() || busy != null}
          loading={busy === 'speak'}
          onClick={() => void speak(false)}
        >
          发言
        </PixelButton>
        <PixelButton
          type="button"
          variant="ghost"
          disabled={busy != null}
          loading={busy === 'delegate'}
          onClick={() => void speak(true)}
        >
          改由 AI 代说
        </PixelButton>
      </div>
    </div>
  )
}
