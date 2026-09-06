import { PixelAccordion, PixelBadge, PixelButton } from '@pxlkit/ui-kit'
import CharacterPortrait from '../scene/CharacterPortrait'
import { RELATION_LABEL } from '../../data/presets'
import { memberAgent, petKindOf } from '../../lib/agentSpec'
import { goalsSummary } from '../../lib/seat'
import { isSeatable, useCaseDraft } from '../../store/useCaseDraft'
import GoalsForm from './GoalsForm'

export default function OpponentGoals() {
  const c = useCaseDraft((s) => s.c)
  const analysis = useCaseDraft((s) => s.analysis)
  const resetGoals = useCaseDraft((s) => s.resetGoals)
  const applyInferred = useCaseDraft((s) => s.applyInferred)
  const playerId = c.seat?.player_id
  const opponents = c.members.filter((m) => m.id !== playerId && isSeatable(m) && m.name.trim())

  if (!playerId) return null

  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-relaxed text-ink-300">
        这些是系统从 wish、人设和法定地位推断的对手诉求。你了解的内情可以直接改——它只会进入你的简报，不会泄露给其他对手。
      </p>
      {opponents.length === 0 ? (
        <p className="text-[12px] text-ink-400">没有可入局的对手。</p>
      ) : (
        <PixelAccordion
          collapsedByDefault
          items={opponents.map((m) => {
            const goals = c.seat?.goals[m.id]
            const edited = goals?.source === 'user'
            return {
              id: m.id,
              title: `${m.name} · ${RELATION_LABEL[m.relation] ?? m.relation} · ${edited ? '已修改' : '系统推断'} · ${goalsSummary(goals, c.assets)}`,
              content: (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 items-end justify-center overflow-hidden border-2 border-ink-700 bg-ink-950">
                      <CharacterPortrait agent={memberAgent(m)} status="idle" size={48} petKind={petKindOf(m.name)} animated={false} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="pixel-text text-[14px] text-ink-100">{m.name}</div>
                      <div className="text-[11px] text-ink-400">{RELATION_LABEL[m.relation]}</div>
                    </div>
                    <PixelBadge tone={edited ? 'gold' : 'neutral'} size="sm">{edited ? '已修改' : '系统推断'}</PixelBadge>
                    <PixelButton
                      type="button"
                      disabled={!edited}
                      onClick={() => {
                        resetGoals(m.id)
                        if (analysis?.inferred_goals) applyInferred(analysis.inferred_goals)
                      }}
                    >
                      恢复系统推断
                    </PixelButton>
                  </div>
                  <GoalsForm memberId={m.id} compact />
                </div>
              ),
            }
          })}
        />
      )}
    </div>
  )
}
