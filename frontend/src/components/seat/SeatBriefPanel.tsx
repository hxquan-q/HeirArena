import { PixelAccordion, PixelAlert, PixelBadge, PixelSkeleton } from '@pxlkit/ui-kit'
import DebriefPanel from './DebriefPanel'
import SpeechCards from './SpeechCards'
import CharacterPortrait from '../scene/CharacterPortrait'
import { BRIEF_SECTIONS } from '../../lib/seat'
import { useCourt } from '../../store/useCourt'
import type { SpeechCard } from '../../types'

interface Props {
  onJumpToTurn: (turnId: string) => void
  onUseCard: (card: SpeechCard) => void
}

export default function SeatBriefPanel({ onJumpToTurn, onUseCard }: Props) {
  const s = useCourt()
  const playerId = s.seat?.playerId
  const me = s.agents.find((a) => a.id === playerId)
  const brief = playerId ? s.strategy?.briefs[playerId] : undefined
  const showDebrief = Boolean(s.done && s.debrief && s.seat && s.caseData)

  const sectionItems = (keys: typeof BRIEF_SECTIONS) => keys
    .map((section) => {
      const items = brief ? brief[section.key].filter((item) => item.enabled) : []
      if (!items.length) return null
      return {
        id: section.key,
        title: section.title,
        content: (
          <ul className="space-y-1.5 text-[11px] text-ink-300">
            {items.map((item) => (
              <li key={item.id}>
                <div>{item.text}</div>
                <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-ink-500">
                  {item.article && <span>第{item.article}条</span>}
                  {item.delta_pct != null && <span>Δ{item.delta_pct >= 0 ? '+' : ''}{item.delta_pct}%</span>}
                  {item.confidence && <span>{item.confidence}</span>}
                </div>
              </li>
            ))}
          </ul>
        ),
      }
    })
    .filter((item): item is NonNullable<typeof item> => item != null)

  const openSections = sectionItems(BRIEF_SECTIONS.filter((section) => section.key === 'playbook' || section.key === 'risks'))
  const foldedSections = sectionItems(BRIEF_SECTIONS.filter((section) => section.key !== 'playbook' && section.key !== 'risks'))

  return (
    <div className="space-y-4">
      {showDebrief && s.debrief && s.seat && s.caseData && (
        <DebriefPanel
          debrief={s.debrief}
          strategy={s.strategy}
          seat={s.seat}
          agents={s.agents}
          caseData={s.caseData}
          onJumpToTurn={onJumpToTurn}
        />
      )}

      <div className={showDebrief ? 'border-t border-white/8 pt-3' : ''}>
        <div className="mb-2 flex items-center gap-2">
          {me && <CharacterPortrait agent={me} status="idle" size={48} animated={false} />}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink-100">{me?.name ?? '本席'}</div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-ink-400">
              <span>本席由 {s.seat?.human ? '我' : 'AI'} 发言</span>
              {s.strategy && (
                <PixelBadge size="sm" tone="gold" variant="outline">
                  {s.strategy.generated_by === 'rules' ? '规则版' : s.strategy.generated_by}
                </PixelBadge>
              )}
            </div>
          </div>
        </div>

        {!s.strategy && (
          <PixelAlert tone="gold" label="未推演" message="开庭前未推演策略，AI 代理仅按人设与心愿发言" live="polite" />
        )}

        {openSections.length > 0 && (
          <div className="mt-3 space-y-2">
            {openSections.map((section) => (
              <div key={section.id} className="rounded-lg border border-white/8 bg-black/15 px-3 py-2">
                <div className="mb-1 text-[11px] font-semibold text-gold-300">{section.title}</div>
                {section.content}
              </div>
            ))}
          </div>
        )}
        {foldedSections.length > 0 && (
          <div className="mt-2">
            <PixelAccordion items={foldedSections} allowMultiple collapsedByDefault />
          </div>
        )}

        {s.awaiting && (
          <div className="mt-3 space-y-2">
            <div className="eyebrow">发言卡</div>
            {s.cardsPending && (
              <div className="space-y-2">
                <PixelSkeleton height="3rem" />
                <PixelSkeleton height="3rem" />
                <PixelSkeleton height="3rem" />
                <div className="text-[11px] text-ink-400">军师起草中</div>
              </div>
            )}
            {!s.cardsPending && s.cards.length === 0 && (
              <div className="text-[11px] text-ink-400">未接入军师，自由发挥吧</div>
            )}
            {!s.cardsPending && s.cards.length > 0 && s.sessionId && (
              <SpeechCards
                sessionId={s.sessionId}
                cards={s.cards}
                agents={s.agents}
                brief={brief}
                onUse={onUseCard}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
