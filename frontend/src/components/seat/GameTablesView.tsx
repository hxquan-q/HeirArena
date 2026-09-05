import { PixelAlert, PixelDataTable, PixelTabs, type ColumnDef } from '@pxlkit/ui-kit'
import { assetLabel, memberLabel } from '../../lib/seat'
import { useCaseDraft } from '../../store/useCaseDraft'
import type { AssetCompetitionRow, CoalitionRow, EquilibriumRow, PayoffRow } from '../../types'

export default function GameTablesView() {
  const c = useCaseDraft((s) => s.c)
  const analysis = useCaseDraft((s) => s.analysis)
  const strategy = c.seat?.strategy
  const game = strategy?.game ?? analysis?.game
  const estimated = !strategy && Boolean(analysis?.game)
  const playerId = c.seat?.player_id ?? ''
  const name = (id: string) => memberLabel(c.members, id)
  const asset = (id: string) => assetLabel(c.assets, id)

  if (!game) {
    return <p className="text-[12px] text-ink-400">先完成席位分析，再看博弈表。</p>
  }

  const coalitionCols: ColumnDef<CoalitionRow>[] = [
    { accessorKey: 'member_id', header: '成员', cell: ({ row }) => name(row.original.member_id) },
    { id: 'confirm', header: '可能确认扶养', cell: ({ row }) => row.original.potential_confirmers.map(name).join('、') || '—' },
    { accessorKey: 'gain_pct', header: '增益 %' },
    { id: 'risk', header: '暴露风险', cell: ({ row }) => row.original.exposure_from.map(name).join('、') || '—' },
  ]
  const assetCols: ColumnDef<AssetCompetitionRow>[] = [
    { accessorKey: 'asset_id', header: '资产', cell: ({ row }) => asset(row.original.asset_id) },
    { id: 'who', header: '竞争者', cell: ({ row }) => row.original.competitors.map(name).join('、') || '—' },
    { id: 'win', header: '预测归属', cell: ({ row }) => (row.original.predicted_winner ? name(row.original.predicted_winner) : '—') },
    { accessorKey: 'compensation_needed', header: '需补偿（万）' },
  ]
  const payoffCols: ColumnDef<PayoffRow>[] = [
    { accessorKey: 'label', header: '选项' },
    { accessorKey: 'my_value', header: '到手价值' },
    { accessorKey: 'my_value_share', header: '价值份额' },
    { id: 'got', header: '拿到', cell: ({ row }) => row.original.assets_obtained.map(asset).join('、') || '—' },
    { id: 'comp', header: '补偿', cell: ({ row }) => `付 ${row.original.compensation_paid} / 收 ${row.original.compensation_received}` },
  ]
  const eqCols: ColumnDef<EquilibriumRow>[] = [
    {
      id: 'combo',
      header: '每人主张什么',
      cell: ({ row }) => Object.entries(row.original.profile).map(([id, label]) => `${name(id)}：${label}`).join('；'),
    },
    {
      id: 'pay',
      header: '每人到手',
      cell: ({ row }) => Object.entries(row.original.payoffs).map(([id, value]) => `${name(id)} ${value} 万`).join('；'),
    },
    { accessorKey: 'my_value', header: '我的收益（万）' },
    { accessorKey: 'my_value_share', header: '我的价值份额' },
    { id: 'stable', header: '稳定', cell: ({ row }) => (row.original.stable ? '预计均衡' : '会有人改主意') },
  ]

  const unstable = game.equilibrium.find((row) => !row.stable && row.note)

  return (
    <div className="space-y-2">
      {estimated && <div className="text-[10px] text-ink-500">确定性预估（开庭前未推演策略）</div>}
      <PixelTabs
        ariaLabel="博弈表"
        defaultValue="coalition"
        items={[
          {
            id: 'coalition',
            label: '联盟',
            content: <PixelDataTable density="compact" data={game.coalition} getRowId={(row) => row.member_id} columns={coalitionCols} />,
          },
          {
            id: 'assets',
            label: '资产竞争',
            content: <PixelDataTable density="compact" data={game.asset_competition} getRowId={(row) => row.asset_id} columns={assetCols} />,
          },
          {
            id: 'payoff',
            label: '我的收益表',
            content: <PixelDataTable density="compact" data={game.payoff} getRowId={(row) => row.option} columns={payoffCols} />,
          },
          {
            id: 'eq',
            label: '均衡',
            content: (
              <div className="space-y-2">
                <p className="text-[11px] leading-relaxed text-ink-300">
                  如果每个人都按自己的最优打，最可能落在这里；这不是预测，是在当前事实下的稳定点。
                </p>
                {unstable && <PixelAlert tone="gold" label="没有稳定组合" message={unstable.note} live="polite" />}
                <PixelDataTable
                  density="compact"
                  data={game.equilibrium}
                  columns={eqCols}
                  getRowId={(row, idx) => `${row.my_value}-${idx}`}
                  emptyState={<div className="p-3 text-xs text-ink-400">还没有均衡结果</div>}
                />
                {playerId && <div className="text-[10px] text-ink-500">玩家：{name(playerId)}</div>}
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
