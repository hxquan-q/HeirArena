import { PixelBadge, PixelButton, PixelCard, PixelChip } from '@pxlkit/ui-kit'
import { useState } from 'react'
import { api } from '../../api/client'
import { BRIEF_SECTIONS } from '../../lib/seat'
import { sfx } from '../../lib/sfx'
import type { AgentSpec, Brief, SpeechCard } from '../../types'

function serveLabel(id: string, brief?: Brief): string {
  if (!brief) return id
  for (const section of BRIEF_SECTIONS) {
    const hit = brief[section.key].find((item) => item.id === id)
    if (hit) return hit.text
  }
  return id
}

function admissionHint(card: SpeechCard, agents: AgentSpec[]): string | null {
  const raw = card.suggests_admission
  if (!raw) return null
  if (raw.startsWith('acknowledge_support:')) {
    const who = raw.slice('acknowledge_support:'.length)
    const name = agents.find((a) => a.id === who)?.name ?? who
    return `建议确认 ${name} 的扶养——需你在输入区手动勾选`
  }
  if (raw === 'waive_share') return '建议放弃部分份额——需你在输入区手动勾选'
  return '建议某种自认——需你在输入区手动勾选'
}

interface Props {
  sessionId: string
  cards: SpeechCard[]
  agents: AgentSpec[]
  brief?: Brief
  onUse: (card: SpeechCard) => void
}

export default function SpeechCards({ sessionId, cards, agents, brief, onUse }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const regenerate = async () => {
    if (busy) return
    setBusy(true)
    try {
      await api.regenerateCards(sessionId)
      sfx('open')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      {cards.map((card) => {
        const hint = admissionHint(card, agents)
        const target = card.responds_to ? agents.find((a) => a.id === card.responds_to)?.name ?? card.responds_to : null
        const expanded = openId === card.id
        return (
          <PixelCard key={card.id} title={card.title} padding="sm" tone="gold">
            <p className={`text-[12px] leading-relaxed text-ink-200 ${expanded ? '' : 'line-clamp-3'}`}>
              {card.text}
            </p>
            <PixelButton
              type="button"
              size="sm"
              variant="ghost"
              className="mt-1"
              onClick={() => setOpenId(expanded ? null : card.id)}
            >
              {expanded ? '收起' : '展开全文'}
            </PixelButton>
            <div className="mt-2 flex flex-wrap gap-1">
              {target && <PixelChip label={`回应 ${target}`} size="sm" tone="cyan" />}
              {card.serves.map((id) => (
                <PixelChip key={id} label={serveLabel(id, brief)} size="sm" />
              ))}
            </div>
            {card.risk_note && <p className="mt-2 text-[11px] text-seal-400">{card.risk_note}</p>}
            {hint && <div className="mt-2"><PixelBadge tone="red" size="sm">{hint}</PixelBadge></div>}
            <div className="mt-2">
              <PixelButton type="button" size="sm" tone="gold" onClick={() => { sfx('move'); onUse(card) }}>
                用这张
              </PixelButton>
            </div>
          </PixelCard>
        )
      })}
      <PixelButton type="button" size="sm" variant="ghost" loading={busy} onClick={() => void regenerate()}>
        重新起草
      </PixelButton>
    </div>
  )
}

export function SpeechCardChips({ cards, onUse }: { cards: SpeechCard[]; onUse: (card: SpeechCard) => void }) {
  if (!cards.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {cards.map((card) => (
        <PixelChip key={card.id} label={card.title} size="sm" tone="gold" onClick={() => { sfx('move'); onUse(card) }} />
      ))}
    </div>
  )
}
