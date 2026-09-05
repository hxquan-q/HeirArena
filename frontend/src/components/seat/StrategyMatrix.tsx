import { PixelAccordion, PixelBadge, PixelDataTable, PixelDrawer, createColumnHelper, type ColumnDef } from '@pxlkit/ui-kit'
import { useMemo, useState } from 'react'
import CharacterPortrait from '../scene/CharacterPortrait'
import { RELATION_LABEL } from '../../data/presets'
import { memberAgent, petKindOf } from '../../lib/agentSpec'
import { BRIEF_SECTIONS, assetEmoji, memberLabel } from '../../lib/seat'
import { useCaseDraft } from '../../store/useCaseDraft'
import type { Brief, MatrixRow, ThreatLevel } from '../../types'
import BriefEditor from './BriefEditor'

interface MatrixView {
  row: MatrixRow
  name: string
  relation: string
  isPlayer: boolean
}

const helper = createColumnHelper<MatrixView>()
const THREAT_TONE: Record<ThreatLevel, 'red' | 'gold' | 'neutral' | undefined> = {
  high: 'red',
  medium: 'gold',
  low: 'neutral',
  none: undefined,
}

export default function StrategyMatrix() {
  const c = useCaseDraft((s) => s.c)
  const analysis = useCaseDraft((s) => s.analysis)
  const playerId = c.seat?.player_id
  const strategy = c.seat?.strategy
  const matrix = strategy?.matrix ?? analysis?.matrix
  const [openId, setOpenId] = useState<string | null>(null)

  const data = useMemo<MatrixView[]>(() => {
    const views = (matrix ?? []).map((row) => {
      const member = c.members.find((m) => m.id === row.member_id)
      return {
        row,
        name: member?.name ?? row.member_id,
        relation: member ? (RELATION_LABEL[member.relation] ?? member.relation) : '',
        isPlayer: row.member_id === playerId,
      }
    })
    return views.sort((a, b) => Number(b.isPlayer) - Number(a.isPlayer))
  }, [c.members, matrix, playerId])

  const columns = useMemo(() => [
    helper.display({
      id: 'member',
      header: '成员',
      cell: ({ row }) => {
        const member = c.members.find((m) => m.id === row.original.row.member_id)
        return (
          <div className={`flex items-center gap-2 ${row.original.isPlayer ? 'text-gold-300' : ''}`}>
            {member && (
              <div className="flex h-9 w-9 items-end justify-center overflow-hidden border border-ink-700 bg-ink-950">
                <CharacterPortrait agent={memberAgent(member)} status={row.original.isPlayer ? 'happy' : 'idle'} size={28} petKind={petKindOf(member.name)} animated={false} />
              </div>
            )}
            <div>
              <div className="pixel-text text-[12px]">{row.original.name}{row.original.isPlayer ? ' · 我' : ''}</div>
              <div className="text-[10px] text-ink-400">{row.original.relation}</div>
            </div>
          </div>
        )
      },
    }),
    helper.accessor((v) => v.row.baseline_pct, {
      id: 'baseline',
      header: '法定基线',
      cell: (info) => `${info.getValue().toFixed(1)}%`,
    }),
    helper.accessor((v) => v.row.reachable, {
      id: 'reach',
      header: '可达区间',
      cell: (info) => {
        const r = info.getValue()
        return r ? `${r.low.toFixed(1)}~${r.high.toFixed(1)}%` : '—'
      },
    }),
    helper.accessor((v) => v.row.target_assets, {
      id: 'targets',
      header: '目标资产',
      cell: (info) => info.getValue().map((id) => assetEmoji(c.assets.find((a) => a.id === id))).join('') || '—',
    }),
    helper.accessor((v) => v.row.conflicts_with_player, {
      id: 'conflicts',
      header: '与我冲突',
      cell: (info) => info.getValue().map((id) => assetEmoji(c.assets.find((a) => a.id === id))).join('') || '—',
    }),
    helper.accessor((v) => v.row.potential_allies, {
      id: 'allies',
      header: '潜在同盟',
      cell: (info) => info.getValue().map((id) => memberLabel(c.members, id)).join('、') || '—',
    }),
    helper.accessor((v) => v.row.strategy_summary, {
      id: 'summary',
      header: '策略要点',
      cell: (info) => <span className="line-clamp-2 text-[11px]">{info.getValue() || '—'}</span>,
    }),
    helper.accessor((v) => v.row.threat_level, {
      id: 'threat',
      header: '威胁',
      cell: (info) => {
        const level = info.getValue()
        if (level === 'none') return null
        const tone = THREAT_TONE[level]
        return <PixelBadge tone={tone} size="sm">{level}</PixelBadge>
      },
    }),
  ], [c.assets, c.members])

  const opened = data.find((d) => d.row.member_id === openId)
  const openedBrief = openId ? strategy?.briefs[openId] : undefined

  return (
    <div className="space-y-2">
      <PixelDataTable
        data={data}
        columns={columns as ColumnDef<MatrixView>[]}
        getRowId={(row) => row.row.member_id}
        density="compact"
        onRowClick={(row) => setOpenId(row.row.member_id)}
        emptyState={<span className="text-[12px] text-ink-400">尚未生成矩阵</span>}
      />
      <PixelDrawer
        open={opened != null}
        onOpenChange={(open) => { if (!open) setOpenId(null) }}
        title={opened ? `${opened.name} 的简报` : '简报'}
        size="lg"
      >
        {opened && (
          <PixelDrawer.Body className="space-y-3">
            {opened.isPlayer ? (
              <>
                <p className="text-[12px] text-ink-300">这是你的简报，可禁用、删除自定义或再加一条。</p>
                <BriefEditor memberId={opened.row.member_id} />
              </>
            ) : (
              <>
                <p className="text-[12px] text-ink-300">这是军师为对手写的最优打法，对手的 Agent 会照此行动。</p>
                <ReadOnlyBrief brief={openedBrief} />
              </>
            )}
          </PixelDrawer.Body>
        )}
      </PixelDrawer>
    </div>
  )
}

function ReadOnlyBrief({ brief }: { brief: Brief | undefined }) {
  if (!brief) return <p className="text-[12px] text-ink-400">还没有这份简报。</p>
  return (
    <PixelAccordion
      allowMultiple
      items={BRIEF_SECTIONS.map((section) => ({
        id: section.key,
        title: section.title,
        content: (
          <ul className="space-y-1 text-[12px] text-ink-200">
            {brief[section.key].filter((item) => item.enabled).map((item) => (
              <li key={item.id}>{item.text}</li>
            ))}
          </ul>
        ),
      }))}
    />
  )
}
