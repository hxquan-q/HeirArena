import { useMemo } from 'react'
import { RELATION_LABEL } from '../../data/presets'
import type { AgentSpec, CaseInput, LegalResult, Member } from '../../types'

interface Props {
  caseData: CaseInput
  legal: LegalResult
  agents: AgentSpec[]
}

interface Node {
  id: string
  x: number
  y: number
  w: number
  member?: Member
  label: string
  sub: string
  percent: number
  eligible: boolean
  color: string
  decedent?: boolean
}

interface Edge {
  d: string
  color: string
  dashed?: boolean
  label?: string
  lx: number
  ly: number
}

const GW = 460
const NODE_H = 48
const ROW_GAP = 100
const PAD = 16
const COL_GAP = 12

const PIXEL_FONT = { fontFamily: 'var(--font-pixel)' } as const
const INK = { bg: '#17120f', card: '#241b16', line: '#55443a', muted: '#a08d78', text: '#f5ecd9', gold: '#e2b25a', seal: '#ea6a5b', pink: '#f07aa8' }

export default function FamilyGraph({ caseData, legal, agents }: Props) {
  const { nodes, edges, height, sideDividerY } = useMemo(() => layout(caseData, legal, agents), [caseData, legal, agents])
  return (
    <svg viewBox={`0 0 ${GW} ${height}`} width="100%" className="select-none" shapeRendering="crispEdges">
      {sideDividerY !== null && (
        <g>
          <line x1={PAD} x2={GW - PAD} y1={sideDividerY} y2={sideDividerY} stroke={INK.line} strokeWidth="2" strokeDasharray="4 4" />
          <rect x={GW / 2 - 76} y={sideDividerY - 7} width="156" height="18" fill="#000" opacity=".5" />
          <rect x={GW / 2 - 78} y={sideDividerY - 9} width="156" height="18" fill={INK.bg} stroke={INK.line} strokeWidth="2" />
          <text x={GW / 2} y={sideDividerY + 4} textAnchor="middle" fontSize="9" letterSpacing="2" fill={INK.muted} style={PIXEL_FONT}>
            庭外席 · 酌情关照对象
          </text>
        </g>
      )}

      {edges.map((e, i) => (
        <g key={i}>
          <path d={e.d} fill="none" stroke={e.color} strokeWidth="2" strokeDasharray={e.dashed ? '4 4' : undefined} opacity=".85" />
          {e.label && (
            <g transform={`translate(${e.lx} ${e.ly})`}>
              <rect x="-17" y="-6.5" width="38" height="17" fill="#000" opacity=".5" />
              <rect x="-19" y="-8.5" width="38" height="17" fill={INK.bg} stroke={e.color} strokeWidth="2" />
              <text textAnchor="middle" y="4" fontSize="9" fill={e.color} style={PIXEL_FONT}>{e.label}</text>
            </g>
          )}
        </g>
      ))}

      {nodes.map((n) => {
        const dead = n.member?.deceased
        const disq = n.member?.disqualified
        const tag = n.percent > 0 ? null : disq ? { text: '丧失继承权', color: INK.seal }
          : !n.decedent && !dead && !n.eligible ? { text: '无继承权', color: INK.muted } : null
        const name = `${dead ? '✝ ' : ''}${n.label}`
        const nameMax = Math.max(3, Math.floor((n.w - 18) / 12))
        const subMax = Math.max(3, Math.floor((n.w - (n.percent > 0 ? 52 : 18)) / 10))
        const border = n.decedent ? INK.gold : n.eligible ? n.color : INK.line
        return (
          <g key={n.id} transform={`translate(${n.x - n.w / 2} ${n.y - NODE_H / 2})`} opacity={dead ? 0.55 : 1}>
            {/* 硬阴影 → 卡片 → 顶部一条高光，跟页面里的 panel 同一套语言 */}
            <rect x="3" y="3" width={n.w} height={NODE_H} fill="#000" opacity=".55" />
            <rect width={n.w} height={NODE_H} fill={n.decedent ? '#2e231c' : INK.card} stroke={border} strokeWidth="2" />
            <rect x="2" y="2" width={n.w - 4} height="2" fill="#ffffff" opacity=".07" />
            {(n.eligible || n.decedent) && <rect x="2" y="2" width="4" height={NODE_H - 4} fill={border} />}
            <text x="12" y="20" fontSize="12" fill={dead ? INK.muted : INK.text} style={PIXEL_FONT}>
              {name.length > nameMax ? name.slice(0, nameMax - 1) + '…' : name}
            </text>
            <text x="12" y="36" fontSize="9.5" fill={INK.muted} style={PIXEL_FONT}>
              {n.sub.length > subMax ? n.sub.slice(0, subMax) : n.sub}
            </text>
            {n.percent > 0 && (
              <g transform={`translate(${n.w - 6} ${NODE_H - 6})`}>
                <rect x="-40" y="-18" width="40" height="18" fill={INK.bg} />
                <rect x="-38" y="-16" width="36" height="14" fill={n.color} />
                <rect x="-38" y="-16" width="36" height="2" fill="#ffffff" opacity=".3" />
                <text x="-20" y="-5" textAnchor="middle" fontSize="10" fill={INK.bg} style={PIXEL_FONT}>{n.percent.toFixed(0)}%</text>
              </g>
            )}
            {n.decedent && (
              <g transform={`translate(${n.w - 18} 8)`}>
                <rect x="3" y="4" width="4" height="10" fill="#f6ecd3" />
                <rect x="4" y="0" width="2" height="4" fill={INK.seal} />
                <rect x="4" y="0" width="2" height="2" fill="#f3d38a" />
              </g>
            )}
            {tag && <text x={n.w - 8} y="18" fontSize="8.5" fill={tag.color} textAnchor="end" style={PIXEL_FONT}>{tag.text}</text>}
          </g>
        )
      })}
    </svg>
  )
}

/** 把一行成员均匀铺满可用宽度，返回每个节点的中心 x 与宽度。 */
function rowSlots(n: number): { xs: number[]; w: number } {
  const w = Math.min(128, Math.max(74, (GW - PAD * 2 - (n - 1) * COL_GAP) / n))
  const total = n * w + (n - 1) * COL_GAP
  const x0 = (GW - total) / 2 + w / 2
  return { xs: Array.from({ length: n }, (_, i) => x0 + i * (w + COL_GAP)), w }
}

function layout(c: CaseInput, legal: LegalResult, agents: AgentSpec[]) {
  const pct = Object.fromEntries(legal.shares.map((s) => [s.member_id, s.percent]))
  const elig = Object.fromEntries(legal.shares.map((s) => [s.member_id, s.eligible]))
  const color = Object.fromEntries(agents.map((a) => [a.id, a.color]))
  const members = c.members

  const grandparents = members.filter((m) => m.relation === 'grandparent')
  const parents = members.filter((m) => m.relation === 'father' || m.relation === 'mother')
  const spouses = members.filter((m) => m.relation === 'spouse')
  const exes = members.filter((m) => m.relation === 'ex_spouse')
  const siblings = members.filter((m) => m.relation === 'sibling')
  const children = members.filter((m) => ['son', 'daughter', 'stepchild'].includes(m.relation))
  const inlaws = members.filter((m) => m.relation === 'daughter_in_law' || m.relation === 'son_in_law')
  const grandchildren = members.filter((m) => m.relation === 'grandchild')
  const side = members.filter((m) => ['pet', 'ai_twin', 'dependent', 'friend'].includes(m.relation))

  const nodes: Node[] = []
  const edges: Edge[] = []
  const byId = new Map<string, Node>()

  const mk = (m: Member, x: number, y: number, w: number): Node => {
    const n: Node = {
      id: m.id, x, y, w, member: m, label: m.name, sub: RELATION_LABEL[m.relation] ?? m.relation,
      percent: pct[m.id] ?? 0, eligible: !!elig[m.id], color: color[m.id] ?? INK.muted,
    }
    byId.set(m.id, n)
    return n
  }

  // 自上而下依次排布各代
  let y = 24 + NODE_H / 2
  const rowYs: Record<string, number> = {}
  const placeRow = (key: string, count: number) => {
    if (count === 0) return
    rowYs[key] = y
    y += ROW_GAP
  }
  placeRow('grand', grandparents.length)
  placeRow('parent', parents.length)
  placeRow('self', 1)
  placeRow('child', children.length + inlaws.length)
  placeRow('grandchild', grandchildren.length)

  // self 行：前任 | 被继承人 | 配偶 | 兄弟姐妹
  const selfItems: (Member | null)[] = [...exes, null, ...spouses, ...siblings]
  const { xs: sxs, w: sw } = rowSlots(selfItems.length)
  let decedent: Node = {
    id: '__decedent', x: GW / 2, y: rowYs.self, w: sw, label: c.decedent_name, sub: '被继承人',
    percent: 0, eligible: false, color: INK.gold, decedent: true,
  }
  selfItems.forEach((m, i) => {
    if (m === null) {
      decedent = { ...decedent, x: sxs[i] }
    } else {
      nodes.push(mk(m, sxs[i], rowYs.self, sw))
    }
  })
  nodes.push(decedent)

  const hEdge = (a: Node, b: Node, colorHex: string, dashed: boolean, label: string) => {
    const [l, r] = a.x < b.x ? [a, b] : [b, a]
    edges.push({
      d: `M${l.x + l.w / 2} ${l.y} L${r.x - r.w / 2} ${r.y}`,
      color: colorHex, dashed, label, lx: (l.x + l.w / 2 + r.x - r.w / 2) / 2, ly: l.y,
    })
  }
  for (const m of spouses) hEdge(decedent, byId.get(m.id)!, INK.gold, false, '婚姻')
  for (const m of exes) hEdge(decedent, byId.get(m.id)!, INK.line, true, '已离婚')
  for (const m of siblings) hEdge(decedent, byId.get(m.id)!, INK.line, true, '手足')

  // 父母 → 被继承人
  if (parents.length) {
    const { xs, w } = rowSlots(parents.length)
    parents.forEach((m, i) => nodes.push(mk(m, xs[i], rowYs.parent, w)))
    for (const m of parents) {
      const n = byId.get(m.id)!
      edges.push({
        d: `M${n.x} ${n.y + NODE_H / 2} V${(n.y + decedent.y) / 2} H${decedent.x} V${decedent.y - NODE_H / 2}`,
        color: INK.line, lx: 0, ly: 0,
      })
    }
  }
  // 祖父母 → 父母（或直接指向被继承人）
  if (grandparents.length) {
    const { xs, w } = rowSlots(grandparents.length)
    grandparents.forEach((m, i) => nodes.push(mk(m, xs[i], rowYs.grand, w)))
    const target = parents.length ? byId.get(parents[0].id)! : decedent
    for (const m of grandparents) {
      const n = byId.get(m.id)!
      edges.push({
        d: `M${n.x} ${n.y + NODE_H / 2} V${(n.y + target.y) / 2} H${target.x} V${target.y - NODE_H / 2}`,
        color: INK.line, dashed: true, lx: 0, ly: 0,
      })
    }
  }

  // 子女 + 儿媳女婿
  const childRow = [...children, ...inlaws]
  if (childRow.length) {
    const { xs, w } = rowSlots(childRow.length)
    childRow.forEach((m, i) => nodes.push(mk(m, xs[i], rowYs.child, w)))
    for (const m of childRow) {
      const n = byId.get(m.id)!
      const isInlaw = m.relation === 'daughter_in_law' || m.relation === 'son_in_law'
      edges.push({
        d: `M${decedent.x} ${decedent.y + NODE_H / 2} V${(decedent.y + n.y) / 2} H${n.x} V${n.y - NODE_H / 2}`,
        color: isInlaw ? INK.line : INK.muted, dashed: isInlaw, lx: 0, ly: 0,
      })
    }
  }

  // 孙辈：连到各自父/母，父母先亡则标注代位
  if (grandchildren.length) {
    const { xs, w } = rowSlots(grandchildren.length)
    grandchildren.forEach((m, i) => {
      const n = mk(m, xs[i], rowYs.grandchild, w)
      nodes.push(n)
      const parent = m.parent_id ? byId.get(m.parent_id) : undefined
      const from = parent ?? decedent
      const subrogated = parent?.member?.deceased
      edges.push({
        d: `M${from.x} ${from.y + NODE_H / 2} V${(from.y + n.y) / 2} H${n.x} V${n.y - NODE_H / 2}`,
        color: subrogated ? INK.pink : INK.line, dashed: !subrogated,
        label: subrogated ? '代位' : undefined, lx: n.x, ly: (from.y + n.y) / 2 - 12,
      })
    })
  }

  // 庭外席：宠物 / AI 分身 / 被扶养人等，独立分区、每行最多 3 个
  let sideDividerY: number | null = null
  if (side.length) {
    sideDividerY = y - ROW_GAP / 2 - 4
    const perRow = 3
    for (let r = 0; r * perRow < side.length; r++) {
      const batch = side.slice(r * perRow, (r + 1) * perRow)
      const { xs, w } = rowSlots(batch.length)
      batch.forEach((m, i) => nodes.push(mk(m, xs[i], y, w)))
      y += ROW_GAP
    }
  }

  const height = y - ROW_GAP + NODE_H / 2 + 22
  return { nodes, edges, height, sideDividerY }
}
