import { useMemo } from 'react'
import { RELATION_LABEL } from '../../data/presets'
import type { AgentSpec, CaseInput, LegalResult, Member } from '../../types'

interface Props {
  caseData: CaseInput
  legal: LegalResult
  agents: AgentSpec[]
  width?: number
}

interface Node {
  id: string
  x: number
  y: number
  member?: Member
  label: string
  sub: string
  percent: number
  eligible: boolean
  color: string
  decedent?: boolean
}

const NODE_W = 118
const NODE_H = 48
const GAP = 18

export default function FamilyGraph({ caseData, legal, agents, width: minWidth = 380 }: Props) {
  const { nodes, edges, height, width } = useMemo(() => layout(caseData, legal, agents, minWidth), [caseData, legal, agents, minWidth])
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxHeight: 600 }} className="select-none">
      <defs>
        <marker id="fg-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8 Z" fill="#5b647a" />
        </marker>
      </defs>
      {edges.map((e, i) => (
        <g key={i}>
          <path d={e.d} fill="none" stroke={e.color} strokeWidth="1.6" strokeDasharray={e.dashed ? '5 4' : undefined} opacity=".85" />
          {e.label && (
            <g transform={`translate(${e.lx} ${e.ly})`}>
              <rect x="-18" y="-8" width="36" height="16" rx="8" fill="#0b0d12" stroke="#2a3142" />
              <text textAnchor="middle" y="4" fontSize="9" fill="#8b93a7">{e.label}</text>
            </g>
          )}
        </g>
      ))}
      {nodes.map((n) => {
        const dead = n.member?.deceased
        const disq = n.member?.disqualified
        const tag = n.percent > 0 ? null : disq ? { text: '丧失继承权', color: '#f87171' }
          : !n.decedent && !dead && !n.eligible ? { text: '无继承权', color: '#5b647a' } : null
        const name = `${dead ? '✝ ' : ''}${n.label}`
        return (
          <g key={n.id} transform={`translate(${n.x - NODE_W / 2} ${n.y - NODE_H / 2})`} opacity={dead ? 0.55 : 1}>
            <rect width={NODE_W} height={NODE_H} rx="10" fill={n.decedent ? '#2a2016' : '#151924'}
              stroke={n.decedent ? '#d4a55a' : n.eligible ? `${n.color}` : '#2a3142'} strokeWidth={n.decedent || n.eligible ? 1.8 : 1} />
            <text x="10" y="19" fontSize="11.5" fontWeight="700" fill={dead ? '#8b93a7' : '#eef0f5'}>
              {tag ? (name.length > 6 ? name.slice(0, 5) + '…' : name) : name.length > 9 ? name.slice(0, 9) + '…' : name}
            </text>
            <text x="10" y="37" fontSize="9.5" fill="#8b93a7">{n.sub.length > 8 ? n.sub.slice(0, 8) : n.sub}</text>
            {n.percent > 0 && (
              <g transform={`translate(${NODE_W - 7} ${NODE_H - 15})`}>
                <rect x="-36" y="-9" width="36" height="18" rx="9" fill={n.color} opacity=".95" />
                <text x="-18" y="4" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#0b0d12">{n.percent.toFixed(0)}%</text>
              </g>
            )}
            {tag && <text x={NODE_W - 8} y="19" fontSize="8.5" fill={tag.color} textAnchor="end">{tag.text}</text>}
          </g>
        )
      })}
    </svg>
  )
}

function layout(c: CaseInput, legal: LegalResult, agents: AgentSpec[], minWidth: number) {
  const pct = Object.fromEntries(legal.shares.map((s) => [s.member_id, s.percent]))
  const elig = Object.fromEntries(legal.shares.map((s) => [s.member_id, s.eligible]))
  const color = Object.fromEntries(agents.map((a) => [a.id, a.color]))
  const members = c.members

  const rowY = { grand: 40, parent: 122, self: 226, child: 340, grandchild: 444, side: 226 }
  const grandparents = members.filter((m) => m.relation === 'grandparent')
  const parents = members.filter((m) => m.relation === 'father' || m.relation === 'mother')
  const spouses = members.filter((m) => m.relation === 'spouse')
  const exes = members.filter((m) => m.relation === 'ex_spouse')
  const siblings = members.filter((m) => m.relation === 'sibling')
  const children = members.filter((m) => ['son', 'daughter', 'stepchild'].includes(m.relation))
  const inlaws = members.filter((m) => m.relation === 'daughter_in_law' || m.relation === 'son_in_law')
  const grandchildren = members.filter((m) => m.relation === 'grandchild')
  const side = members.filter((m) => ['pet', 'ai_twin', 'dependent', 'friend'].includes(m.relation))

  const hasSide = side.length > 0
  const cols = Math.max(
    1 + spouses.length + exes.length + siblings.length, parents.length, grandparents.length,
    children.length + inlaws.length, grandchildren.length,
  )
  const sideW = hasSide ? NODE_W + 30 : 0
  const mainW = Math.max(minWidth - sideW, cols * (NODE_W + GAP) + 40)
  const width = mainW + sideW
  const nodes: Node[] = []
  const edges: { d: string; color: string; dashed?: boolean; label?: string; lx: number; ly: number }[] = []

  const mk = (m: Member, x: number, y: number): Node => ({
    id: m.id, x, y, member: m, label: m.name, sub: RELATION_LABEL[m.relation] ?? m.relation,
    percent: pct[m.id] ?? 0, eligible: !!elig[m.id], color: color[m.id] ?? '#8b93a7',
  })
  const spread = (list: Member[], y: number, x0: number, x1: number): Node[] => {
    const n = list.length
    return list.map((m, i) => mk(m, n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1), y))
  }

  // row: self
  const selfRow: Node[] = []
  const decedent: Node = {
    id: '__decedent', x: 0, y: rowY.self, label: c.decedent_name, sub: '被继承人', percent: 0, eligible: false, color: '#d4a55a', decedent: true,
  }
  const rowMembers = [...exes.map((m) => ({ m, kind: 'ex' })), { m: null, kind: 'self' }, ...spouses.map((m) => ({ m, kind: 'spouse' })), ...siblings.map((m) => ({ m, kind: 'sib' }))]
  const n0 = rowMembers.length
  rowMembers.forEach((r, i) => {
    const x = n0 === 1 ? mainW / 2 : 60 + ((mainW - 120) * i) / (n0 - 1)
    if (r.kind === 'self') {
      decedent.x = x
      selfRow.push(decedent)
    } else if (r.m) {
      selfRow.push(mk(r.m, x, rowY.self))
    }
  })
  nodes.push(...selfRow)
  for (const m of spouses) {
    const n = selfRow.find((x) => x.id === m.id)!
    edges.push({ d: `M${decedent.x} ${decedent.y} L${n.x} ${n.y}`, color: '#d4a55a', label: '婚姻', lx: (decedent.x + n.x) / 2, ly: decedent.y })
  }
  for (const m of exes) {
    const n = selfRow.find((x) => x.id === m.id)!
    edges.push({ d: `M${decedent.x} ${decedent.y} L${n.x} ${n.y}`, color: '#5b647a', dashed: true, label: '已离婚', lx: (decedent.x + n.x) / 2, ly: decedent.y })
  }

  // parents / grandparents
  const pNodes = spread(parents, rowY.parent, 70, mainW - 70)
  nodes.push(...pNodes)
  for (const n of pNodes) {
    edges.push({ d: `M${n.x} ${n.y + NODE_H / 2} V${(n.y + decedent.y) / 2} H${decedent.x} V${decedent.y - NODE_H / 2}`, color: '#5b647a', lx: 0, ly: 0 })
  }
  const gpNodes = spread(grandparents, rowY.grand, 70, mainW - 70)
  nodes.push(...gpNodes)
  for (const n of gpNodes) {
    const target = pNodes[0] ?? decedent
    edges.push({ d: `M${n.x} ${n.y + NODE_H / 2} V${(n.y + target.y) / 2} H${target.x} V${target.y - NODE_H / 2}`, color: '#5b647a', dashed: true, lx: 0, ly: 0 })
  }
  for (const m of siblings) {
    const n = selfRow.find((x) => x.id === m.id)!
    const junctionY = pNodes.length ? (pNodes[0].y + decedent.y) / 2 : decedent.y - 60
    edges.push({ d: `M${n.x} ${n.y - NODE_H / 2} V${junctionY} H${decedent.x}`, color: '#5b647a', dashed: true, label: '兄弟姐妹', lx: n.x, ly: junctionY - 12 })
  }

  // children + in-laws
  const childRow = [...children, ...inlaws]
  const cNodes = spread(childRow, rowY.child, 60, mainW - 60)
  nodes.push(...cNodes)
  for (const n of cNodes) {
    const isInlaw = n.member!.relation === 'daughter_in_law' || n.member!.relation === 'son_in_law'
    edges.push({
      d: `M${decedent.x} ${decedent.y + NODE_H / 2} V${(decedent.y + n.y) / 2} H${n.x} V${n.y - NODE_H / 2}`,
      color: isInlaw ? '#5b647a' : '#8b93a7', dashed: isInlaw, lx: 0, ly: 0,
    })
  }

  // grandchildren under their parent
  const byParent = new Map<string, Member[]>()
  for (const g of grandchildren) byParent.set(g.parent_id ?? '__none', [...(byParent.get(g.parent_id ?? '__none') ?? []), g])
  const step = NODE_W + GAP
  let orphanX = 60
  for (const [pid, list] of byParent) {
    const parent = cNodes.find((n) => n.id === pid)
    const cx = parent ? parent.x : (orphanX += step)
    const w = (list.length - 1) * step
    list.forEach((g, i) => {
      const n = mk(g, Math.max(60, Math.min(mainW - 60, cx - w / 2 + i * step)), rowY.grandchild)
      nodes.push(n)
      const from = parent ?? decedent
      edges.push({
        d: `M${from.x} ${from.y + NODE_H / 2} V${(from.y + n.y) / 2} H${n.x} V${n.y - NODE_H / 2}`,
        color: parent?.member?.deceased ? '#f472b6' : '#5b647a', dashed: !parent?.member?.deceased,
        label: parent?.member?.deceased ? '代位' : undefined, lx: n.x, ly: (from.y + n.y) / 2 - 12,
      })
    })
  }

  // side column
  side.forEach((m, i) => {
    const n = mk(m, width - 60, 60 + i * 74)
    nodes.push(n)
    edges.push({ d: `M${decedent.x + NODE_W / 2} ${decedent.y} Q${(decedent.x + n.x) / 2} ${n.y} ${n.x - NODE_W / 2} ${n.y}`, color: '#3a4257', dashed: true, lx: 0, ly: 0 })
  })

  const maxY = Math.max(...nodes.map((n) => n.y)) + NODE_H / 2 + 24
  const minY = Math.min(...nodes.map((n) => n.y)) - NODE_H / 2 - 16
  if (minY > 0) {
    for (const n of nodes) n.y -= minY
    for (const e of edges) {
      e.ly -= minY
      e.d = e.d.replace(/([ML])(-?[\d.]+) (-?[\d.]+)/g, (_s, cmd, x, y) => `${cmd}${x} ${+y - minY}`)
        .replace(/V(-?[\d.]+)/g, (_s, y) => `V${+y - minY}`)
        .replace(/Q(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)/g, (_s, x1, y1, x2, y2) => `Q${x1} ${+y1 - minY} ${x2} ${+y2 - minY}`)
    }
  }
  return { nodes, edges, width, height: Math.max(220, maxY - Math.max(minY, 0)) }
}
