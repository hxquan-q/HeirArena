import { PixelAccordion, PixelAlert, PixelBadge, PixelChip, PixelDataTable, PixelProgress, PixelStatCard, PixelTypewriter, type ColumnDef } from '@pxlkit/ui-kit'
import CharacterPortrait from '../scene/CharacterPortrait'
import { assetLabel, extractTurnIds, memberLabel } from '../../lib/seat'
import type { AgentSpec, CaseInput, Debrief, MatrixRow, Scorecard, ScorecardPart, StrategyPack, WhatIfDelta } from '../../types'

interface Props {
  debrief: Debrief
  strategy: StrategyPack | null
  seat: { playerId: string; human: boolean }
  agents: AgentSpec[]
  caseData: CaseInput
  onJumpToTurn: (turnId: string) => void
}

function partTone(part: ScorecardPart): 'green' | 'gold' | 'red' | 'neutral' {
  if (!part.applicable) return 'neutral'
  if (part.max <= 0) return 'neutral'
  const ratio = part.score / part.max
  if (ratio >= 0.8) return 'green'
  if (ratio >= 0.4) return 'gold'
  return 'red'
}

function achieveBadge(card: Scorecard) {
  if (card.capped) return { label: '红线被破', tone: 'red' as const }
  if (card.total >= 80) return { label: '达成', tone: 'green' as const }
  if (card.total >= 40) return { label: '部分', tone: 'gold' as const }
  return { label: '未达成', tone: 'red' as const }
}

function TurnChips({ ids, text, onJumpToTurn }: { ids?: string[]; text?: string; onJumpToTurn: (id: string) => void }) {
  const found = [...new Set([...(ids ?? []), ...extractTurnIds(text ?? '')])]
  if (!found.length) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {found.map((id) => (
        <PixelChip key={id} label={id} size="sm" tone="gold" onClick={() => onJumpToTurn(id)} />
      ))}
    </div>
  )
}

function WhatIfRecap({ rows }: { rows: WhatIfDelta[] }) {
  if (!rows.length) return <div className="text-xs text-ink-400">没有 what-if 对照。</div>
  return (
    <ul className="space-y-1.5">
      {rows.map((row) => (
        <li key={`${row.key}-${row.subject_id}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/8 bg-black/15 px-2.5 py-1.5 text-[11px]">
          <span className="text-ink-200">{row.label}</span>
          <PixelBadge size="sm" tone={row.direction === 'favorable' ? 'green' : 'red'} variant="soft">
            {row.delta_pct >= 0 ? '+' : ''}{row.delta_pct.toFixed(1)}%
          </PixelBadge>
          <PixelChip label={`第${row.article}条`} size="sm" tone="gold" />
          {row.evidence.slice(0, 3).map((item) => (
            <span key={item} className="text-ink-400">{item}</span>
          ))}
        </li>
      ))}
    </ul>
  )
}

interface AchieveRow {
  id: string
  mine: boolean
  name: string
  targets: string
  got: string
  share: string
  red: string
  total: string
}

export default function DebriefPanel({ debrief, strategy, seat, agents, caseData, onJumpToTurn }: Props) {
  const me = agents.find((a) => a.id === seat.playerId)
  const mine = debrief.scorecards[seat.playerId]
  const rules = debrief.generated_by === 'rules'
  const rows: AchieveRow[] = (strategy?.matrix ?? Object.keys(debrief.scorecards).map((id) => ({
    member_id: id, target_assets: [] as string[],
  } as Pick<MatrixRow, 'member_id' | 'target_assets'>))).map((row) => {
    const card = debrief.scorecards[row.member_id]
    const targets = row.target_assets
    const got = targets.map((aid) => {
      const held = (card?.parts.find((p) => p.key === 'target_assets')?.detail ?? '').includes(aid)
        && !((card?.parts.find((p) => p.key === 'target_assets')?.detail ?? '').includes(`${aid} 拿到 0%`))
      return `${assetLabel(caseData.assets, aid)} ${held ? '✓' : '✗'}`
    }).join(' ') || '—'
    const red = card?.parts.find((p) => p.key === 'red_lines')
    return {
      id: row.member_id,
      mine: row.member_id === seat.playerId,
      name: (row.member_id === seat.playerId ? '★ ' : '') + memberLabel(caseData.members, row.member_id),
      targets: targets.map((aid) => assetLabel(caseData.assets, aid)).join('、') || '—',
      got,
      share: card
        ? `${card.value_share.toFixed(1)}% / ${caseData.seat?.goals[row.member_id]?.min_value_share ?? '—'}%`
        : '—',
      red: red?.applicable ? red.detail || `${red.score}/${red.max}` : '未设定',
      total: card ? `${card.total.toFixed(1)}` : '—',
    }
  })
  const columns: ColumnDef<AchieveRow>[] = [
    { accessorKey: 'name', header: '成员' },
    { accessorKey: 'targets', header: '目标资产' },
    { accessorKey: 'got', header: '拿到' },
    { accessorKey: 'share', header: '价值份额 vs 最低' },
    { accessorKey: 'red', header: '红线' },
    { accessorKey: 'total', header: '达成度' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        {me && <CharacterPortrait agent={me} status="idle" size={72} animated={false} />}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pixel-text text-[12px] text-gold-300">本席复盘 · {me?.name ?? seat.playerId}</span>
            {mine?.capped && (
              <PixelBadge tone="red" size="sm">红线被破，上限 40</PixelBadge>
            )}
            {mine && <PixelBadge tone={achieveBadge(mine).tone} size="sm">{achieveBadge(mine).label}</PixelBadge>}
          </div>
          <PixelStatCard
            label="达成度"
            value={mine ? mine.total.toFixed(1) : '—'}
            size="sm"
            tone={mine?.capped ? 'red' : 'gold'}
            valueTone
            align="start"
          />
          {mine && (
            <div className="flex flex-wrap gap-1.5">
              <PixelBadge tone="gold" size="sm" variant="outline">价值份额 {mine.value_share.toFixed(1)}%</PixelBadge>
              <PixelBadge tone="neutral" size="sm" variant="outline">名义份额 {mine.nominal_pct.toFixed(1)}%</PixelBadge>
              <PixelBadge tone="neutral" size="sm" variant="outline">法定基线 {mine.legal_pct.toFixed(1)}%</PixelBadge>
            </div>
          )}
        </div>
      </div>

      {mine && (
        <div className="space-y-2">
          {mine.parts.map((part) => (
            <div key={part.key} className={part.applicable ? '' : 'opacity-50'}>
              <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                <span className="text-ink-200">{part.label}</span>
                <span className="font-mono text-ink-400">
                  {part.applicable ? `${part.score.toFixed(1)} / ${part.max}` : '未设定'}
                </span>
              </div>
              {part.applicable ? (
                <PixelProgress value={part.max ? (part.score / part.max) * 100 : 0} tone={partTone(part)} showValue={false} label={part.label} />
              ) : (
                <div className="text-[10px] text-ink-500">未设定</div>
              )}
              {part.detail && <div className="mt-1 text-[10px] text-ink-400">{part.detail}</div>}
              {rules && (part.key === 'soft_goals' || part.key === 'red_lines') && (
                <div className="mt-0.5 text-[10px] text-gold-400/80">需军师评分</div>
              )}
              <TurnChips ids={part.turn_ids} onJumpToTurn={onJumpToTurn} />
            </div>
          ))}
          <PixelAccordion items={[{ id: 'formula', title: '公式', content: <p className="text-[11px] leading-relaxed text-ink-300">{mine.formula}</p> }]} collapsedByDefault />
        </div>
      )}

      <section className="space-y-2">
        <div className="eyebrow">叙事复盘</div>
        {debrief.narrative ? (
          <PixelTypewriter label={debrief.narrative} speed={18} tone="gold" cursor={false} className="block text-[12px] leading-relaxed text-ink-200" />
        ) : (
          <PixelAlert tone="gold" label="剧本复盘" message="接入军师后可得叙事复盘" live="polite" />
        )}
        <TurnChips text={debrief.narrative ?? ''} onJumpToTurn={onJumpToTurn} />
        {debrief.next_time.length > 0 && (
          <PixelAccordion
            items={[{
              id: 'next',
              title: '下一局建议',
              content: (
                <ul className="space-y-1 text-[11px] text-ink-300">
                  {debrief.next_time.map((item) => (
                    <li key={item}>
                      {item}
                      <TurnChips text={item} onJumpToTurn={onJumpToTurn} />
                    </li>
                  ))}
                </ul>
              ),
            }]}
          />
        )}
      </section>

      <section className="space-y-2">
        <div className="eyebrow">what-if 对照</div>
        <WhatIfRecap rows={debrief.whatif_recap} />
      </section>

      <section className="space-y-2">
        <div className="eyebrow">全员达成</div>
        <PixelDataTable
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          density="compact"
          emptyState={<div className="p-3 text-xs text-ink-400">还没有记分卡</div>}
        />
      </section>
    </div>
  )
}
