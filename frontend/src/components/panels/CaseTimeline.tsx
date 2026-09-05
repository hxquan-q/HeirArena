import { PxlKitIcon, type PxlKitData } from '@pxlkit/core'
import { Megaphone } from '@pxlkit/feedback'
import { Flag, Skull, Sword, Trophy } from '@pxlkit/gamification'
import { Friends } from '@pxlkit/social'
import { PixelTimeline, PixelTimelineItem } from '@pxlkit/ui-kit'
import { useEffect, useMemo, useRef } from 'react'
import type { PhaseState } from '../../store/useCourt'
import type { AgentSpec, RelationEdge } from '../../types'
import { Gavel } from '../icons/pixel'

interface Props {
  phaseHistory: PhaseState[]
  relationLog: RelationEdge[]
  ghosts: { text: string; ts: number }[]
  notices: { text: string; ts: number }[]
  gavelAt: number | null
  verdictAt: number | null
  agents: AgentSpec[]
  decedent: string
}

interface Event {
  ts: number
  icon: PxlKitData
  label: string
  detail?: string
  tone: string
}

const clock = (ts: number) => new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

/** 案件时间线：阶段、攻击/结盟、显灵、公告、落槌，按时间排成一条 RPG 任务日志。 */
export default function CaseTimeline({ phaseHistory, relationLog, ghosts, notices, gavelAt, verdictAt, agents, decedent }: Props) {
  const nameOf = (id: string) => agents.find((a) => a.id === id)?.name ?? id
  const events = useMemo<Event[]>(() => {
    const out: Event[] = []
    for (const p of phaseHistory) out.push({ ts: p.ts, icon: Flag, label: p.label, tone: '#e2b25a' })
    for (const r of relationLog) {
      out.push({
        ts: r.ts, icon: r.kind === 'attack' ? Sword : Friends, tone: r.kind === 'attack' ? '#ea6a5b' : '#7fd9ad',
        label: r.kind === 'attack' ? '攻击' : '结盟', detail: `${nameOf(r.from)} → ${nameOf(r.to)}`,
      })
    }
    for (const g of ghosts) out.push({ ts: g.ts, icon: Skull, label: `${decedent}显灵`, detail: g.text, tone: '#c8b8ff' })
    for (const n of notices) out.push({ ts: n.ts, icon: Megaphone, label: '法庭公告', detail: n.text, tone: '#f3d38a' })
    if (gavelAt) out.push({ ts: gavelAt, icon: Gavel, label: '落槌', tone: '#e2b25a' })
    if (verdictAt) out.push({ ts: verdictAt, icon: Trophy, label: '裁决送达', tone: '#f3d38a' })
    return out.sort((a, b) => a.ts - b.ts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseHistory, relationLog, ghosts, notices, gavelAt, verdictAt, agents, decedent])

  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [events.length])

  if (!events.length) {
    return <div className="py-6 text-center text-[11px] text-ink-400">书记员正在磨墨…</div>
  }

  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-y-auto pr-1">
      <PixelTimeline active={events.length - 1} bulletSize="sm">
        {events.map((e, i) => (
          <PixelTimelineItem
            key={`${e.ts}-${i}`}
            time={clock(e.ts)}
            label={e.label}
            lineVariant={i === events.length - 1 ? 'dashed' : 'solid'}
            bullet={<PxlKitIcon icon={e.icon} size={12} appearance="solid" color={e.tone} aria-hidden />}
          >
            {e.detail && <span className="block truncate text-[11px] text-ink-300" title={e.detail}>{e.detail}</span>}
          </PixelTimelineItem>
        ))}
      </PixelTimeline>
    </div>
  )
}
