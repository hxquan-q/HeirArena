import { PixelBadge, PixelEmptyState } from '@pxlkit/ui-kit'
import CharacterPortrait from '../scene/CharacterPortrait'
import { PERSONALITIES, RELATION_LABEL } from '../../data/presets'
import { memberAgent, petKindOf } from '../../lib/agentSpec'
import { sfx } from '../../lib/sfx'
import { useCaseDraft } from '../../store/useCaseDraft'

const BLOCKED = new Set(['pet', 'ai_twin'])

export default function SeatPicker() {
  const c = useCaseDraft((s) => s.c)
  const preview = useCaseDraft((s) => s.preview)
  const enterSeat = useCaseDraft((s) => s.enterSeat)
  const setPlayer = useCaseDraft((s) => s.setPlayer)
  const candidates = c.members.filter((m) => !BLOCKED.has(m.relation) && !m.deceased && m.name.trim())
  const playerId = c.seat?.player_id ?? null

  if (candidates.length === 0) {
    return (
      <PixelEmptyState
        title="庭上还没有家人"
        description="先在第 III 卷传唤至少一位家人"
      />
    )
  }

  return (
    <ul className="no-scrollbar flex snap-x items-stretch gap-2.5 overflow-x-auto" role="listbox" aria-label="选择席位">
      {candidates.map((m) => {
        const on = playerId === m.id
        const share = preview?.shares.find((s) => s.member_id === m.id)
        const p = PERSONALITIES.find((x) => x.value === m.personality)
        const color = p?.color ?? '#a08d78'
        const pct = share?.eligible && share.percent > 0 ? share.percent : 0
        const heir = Boolean(share?.eligible && share.percent > 0)
        return (
          <li key={m.id} role="option" aria-selected={on} className="w-[140px] shrink-0 snap-start">
            <button
              type="button"
              onClick={() => {
                sfx('confirm')
                if (!c.seat) enterSeat(m.id)
                else setPlayer(m.id)
              }}
              className={`relative flex h-full w-full flex-col border-2 text-left transition ${on
                ? 'border-gold-400 bg-gold-600/10 shadow-[3px_3px_0_rgba(0,0,0,.6)]'
                : 'border-ink-600 bg-ink-900 hover:border-ink-400'}`}
            >
              <div
                className="relative flex h-[92px] w-full items-end justify-center overflow-hidden border-b-2 border-ink-700"
                style={{ background: `radial-gradient(circle at 50% 88%, ${color}55, transparent 68%), linear-gradient(180deg, #1e1712, #17120f)` }}
              >
                <CharacterPortrait agent={memberAgent(m)} status={on ? 'happy' : 'idle'} size={66} petKind={petKindOf(m.name)} animated={on} />
                <span className="pixel-text absolute top-1 left-1 border-2 border-ink-950 px-1 text-[10px] leading-4 text-ink-950 shadow-[2px_2px_0_rgba(0,0,0,.55)]" style={{ background: color }}>
                  {p?.emoji} {p?.label}
                </span>
                {on && <PixelBadge tone="gold" size="sm" className="absolute top-1 right-1">这是我</PixelBadge>}
              </div>
              <div className="w-full px-2 py-1.5">
                <div className="flex items-baseline gap-1.5">
                  <span className="pixel-text min-w-0 truncate text-[14px] leading-5 text-ink-100">{m.name}</span>
                  <span className="shrink-0 truncate text-[10px] text-ink-400">{RELATION_LABEL[m.relation] ?? m.relation}</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  {heir ? (
                    <>
                      <div className="hp-track h-2.5 min-w-0 flex-1 overflow-hidden">
                        <div className="h-full" style={{ width: `${Math.min(100, pct)}%`, background: color, boxShadow: 'inset 0 -2px 0 rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.3)' }} />
                      </div>
                      <span className="pixel-text w-8 shrink-0 text-right text-[10px] text-gold-300">{pct.toFixed(0)}%</span>
                    </>
                  ) : (
                    <PixelBadge tone="neutral" size="sm">无法定份额</PixelBadge>
                  )}
                </div>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
