import { motion } from 'motion/react'
import { useMemo } from 'react'
import type { AgentSpec, AgentStatus, RelationEdge } from '../../types'
import CharacterPortrait from '../scene/CharacterPortrait'

interface Props {
  agents: AgentSpec[]
  relationLog: RelationEdge[]
  statuses: Record<string, AgentStatus>
  deceasedIds: Set<string>
}

const W = 460
const H = 400
const NODE = 56

/**
 * 阵营网络：谁打谁、谁抱团，全场累计。节点绕一圈，执行官坐中间；
 * 边越粗代表次数越多，红=攻击 绿=结盟，双向时各画一条弧。
 */
export default function AllianceGraph({ agents, relationLog, statuses, deceasedIds }: Props) {
  const judge = agents.find((a) => a.kind === 'judge')
  const debaters = useMemo(() => agents.filter((a) => a.kind !== 'judge' && !deceasedIds.has(a.id)), [agents, deceasedIds])

  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>()
    const cx = W / 2
    const cy = H / 2 + 6
    const rx = W / 2 - NODE / 2 - 30
    const ry = H / 2 - NODE / 2 - 34
    debaters.forEach((a, i) => {
      const t = -Math.PI / 2 + (i / debaters.length) * Math.PI * 2
      m.set(a.id, { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) })
    })
    if (judge) m.set(judge.id, { x: cx, y: cy })
    return m
  }, [debaters, judge])

  // 合并同向同类边：(from,to,kind) → 次数
  const edges = useMemo(() => {
    const agg = new Map<string, { from: string; to: string; kind: 'attack' | 'ally'; n: number }>()
    for (const r of relationLog) {
      if (!pos.has(r.from) || !pos.has(r.to)) continue
      const k = `${r.from}>${r.to}:${r.kind}`
      const e = agg.get(k)
      if (e) e.n += 1
      else agg.set(k, { from: r.from, to: r.to, kind: r.kind, n: 1 })
    }
    return Array.from(agg.values())
  }, [relationLog, pos])

  // 每个人的攻/守/盟统计，用来给名牌配一行小字
  const tally = useMemo(() => {
    const t: Record<string, { atk: number; hit: number; ally: number }> = {}
    for (const r of relationLog) {
      const f = (t[r.from] ??= { atk: 0, hit: 0, ally: 0 })
      const to = (t[r.to] ??= { atk: 0, hit: 0, ally: 0 })
      if (r.kind === 'attack') { f.atk += 1; to.hit += 1 } else { f.ally += 1; to.ally += 1 }
    }
    return t
  }, [relationLog])

  const curve = (a: { x: number; y: number }, b: { x: number; y: number }, bend: number) => {
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    // 法向偏移：同一对节点的往返边分别弯向两侧
    const nx = (-dy / len) * bend
    const ny = (dx / len) * bend
    return `M${a.x} ${a.y} Q${mx + nx} ${my + ny} ${b.x} ${b.y}`
  }

  if (debaters.length === 0) return null

  return (
    <div className="relative mx-auto w-full max-w-[460px]" style={{ aspectRatio: `${W}/${H}` }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full">
        <defs>
          <marker id="ag-attack" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0 0 L8 4 L0 8 Z" fill="#ea6a5b" />
          </marker>
          <marker id="ag-ally" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0 0 L8 4 L0 8 Z" fill="#7fd9ad" />
          </marker>
        </defs>
        {/* 席位环 */}
        <ellipse cx={W / 2} cy={H / 2 + 6} rx={W / 2 - NODE / 2 - 30} ry={H / 2 - NODE / 2 - 34} fill="none" stroke="rgba(255,236,200,.06)" strokeDasharray="4 6" />
        {edges.map((e) => {
          const a = pos.get(e.from)!
          const b = pos.get(e.to)!
          const color = e.kind === 'attack' ? '#ea6a5b' : '#7fd9ad'
          // 缩短到节点边缘
          const dx = b.x - a.x
          const dy = b.y - a.y
          const len = Math.hypot(dx, dy) || 1
          const pad = NODE / 2 + 4
          const a2 = { x: a.x + (dx / len) * pad, y: a.y + (dy / len) * pad }
          const b2 = { x: b.x - (dx / len) * pad, y: b.y - (dy / len) * pad }
          const d = curve(a2, b2, e.kind === 'attack' ? 26 : -26)
          return (
            <motion.g key={`${e.from}-${e.to}-${e.kind}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <path d={d} fill="none" stroke={color} strokeWidth={Math.min(8, 1.5 + e.n * 1.5)} opacity=".22" />
              <path d={d} fill="none" stroke={color} strokeWidth={Math.min(4, 1 + e.n * 0.7)}
                strokeDasharray={e.kind === 'attack' ? '7 5' : undefined} markerEnd={`url(#ag-${e.kind})`} />
              {e.n > 1 && (() => {
                const mx = (a2.x + b2.x) / 2 + ((-dy / len) * (e.kind === 'attack' ? 13 : -13))
                const my = (a2.y + b2.y) / 2 + ((dx / len) * (e.kind === 'attack' ? 13 : -13))
                return (
                  <g transform={`translate(${mx} ${my})`}>
                    <rect x="-10" y="-8" width="20" height="16" fill="#17120f" stroke={color} strokeWidth="1.2" />
                    <text textAnchor="middle" y="4" fontSize="10" fontWeight="700" fill={color}>×{e.n}</text>
                  </g>
                )
              })()}
            </motion.g>
          )
        })}
      </svg>

      {[...(judge ? [judge] : []), ...debaters].map((a) => {
        const p = pos.get(a.id)!
        const st = statuses[a.id] ?? 'idle'
        const t = tally[a.id]
        const isJudge = a.kind === 'judge'
        return (
          <div key={a.id} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` }}>
            <div className={`flex items-end justify-center overflow-hidden border-2 bg-ink-950 shadow-[2px_2px_0_rgba(0,0,0,.6)] ${isJudge ? 'border-gold-600' : ''}`}
              style={{ width: NODE, height: NODE, borderColor: isJudge ? undefined : `${a.color}` }}>
              <CharacterPortrait agent={a} status={st} size={NODE - 12} animated={st !== 'idle'} />
            </div>
            <span className="pixel-text mt-1 border border-ink-950 bg-ink-950 px-1 text-[10px] leading-4 whitespace-nowrap" style={{ color: a.color }}>{a.name}</span>
            {!isJudge && t && (
              <span className="mt-0.5 font-mono text-[9px] leading-3 whitespace-nowrap text-ink-400">
                ⚔{t.atk} 🛡{t.hit} 🤝{t.ally}
              </span>
            )}
            {isJudge && <span className="text-[9px] leading-3 text-ink-400">执行官</span>}
          </div>
        )
      })}

      {relationLog.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 text-center text-[11px] text-ink-400">还没人动手，也没人抱团。</div>
      )}
    </div>
  )
}
