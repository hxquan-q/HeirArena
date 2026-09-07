import type { AgentSpec, AgentStatus } from '../../types'
import AgentSprite from './AgentSprite'
import { agentMotionClass } from './agentMotion'

const artworkModules = import.meta.glob('../../../../assets/*.{png,PNG}', {
  eager: true,
  import: 'default',
}) as Record<string, string>

const ARTWORK = new Map(
  Object.entries(artworkModules).map(([path, src]) => {
    const filename = path.split('/').pop()?.replace(/\.(png)$/i, '').toLowerCase() ?? path
    return [filename, src]
  }),
)

const PERSONALITY_ALIASES: Record<string, string[]> = {
  greedy: ['greedy', 'stingy'],
  filial: ['dutiful', 'filial', 'devoted'],
  chill: ['chill', 'easygoing', 'calm'],
  calculating: ['calculating', 'accountant', 'strategic'],
  drama: ['dramatic', 'drama'],
  lawyer: ['lawyer', 'legal'],
  loyal: ['loyal', 'faithful'],
  mischief: ['mischievous', 'mischief', 'trickster'],
}

const RELATION_ALIASES: Record<string, string[]> = {
  executor: ['executor', 'judge', 'arbiter'],
  spouse: ['spouse', 'wife', 'husband', 'widow'],
  son: ['son', 'heir'],
  daughter: ['daughter', 'heiress'],
  father: ['father', 'dad'],
  mother: ['mother', 'mom'],
  stepchild: ['stepchild', 'stepdaughter', 'stepson'],
  grandchild: ['grandchild', 'granddaughter', 'grandson'],
  daughter_in_law: ['daughter_in_law', 'daughterinlaw'],
  son_in_law: ['son_in_law', 'soninlaw'],
  sibling: ['sibling', 'brother', 'sister'],
  grandparent: ['grandparent', 'grandfather', 'grandmother'],
  ex_spouse: ['ex_spouse', 'exwife', 'exhusband', 'ex'],
  dependent: ['dependent', 'nanny', 'carer', 'butler'],
  pet: ['pet', 'cat', 'dog'],
  ai_twin: ['ai_twin', 'digital_twin', 'ai', 'robot'],
  friend: ['friend', 'cousin', 'outsider'],
}

function artworkFor(agent: AgentSpec, petKind: 'cat' | 'dog', status: AgentStatus): string | undefined {
  const personalities = PERSONALITY_ALIASES[agent.personality] ?? [agent.personality]
  const relations = agent.kind === 'judge'
    ? RELATION_ALIASES.executor
    : agent.kind === 'pet'
      ? [petKind, ...(RELATION_ALIASES.pet ?? [])]
      : RELATION_ALIASES[agent.relation] ?? [agent.relation]

  const safeId = agent.id.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  const specialCandidates = agent.kind === 'judge'
    ? ['executor_judge']
    : agent.kind === 'pet'
      ? petKind === 'dog' ? ['pet_barkie'] : ['pet_cat', 'cat']
      : agent.kind === 'ai'
        ? ['system_neo']
        : agent.relation === 'ex_spouse'
          ? ['ex_partner']
          : []
  const candidates = [
    ...specialCandidates,
    safeId,
    ...personalities.flatMap((personality) => relations.map((relation) => `${personality}_${relation}`)),
    ...relations.flatMap((relation) => personalities.map((personality) => `${relation}_${personality}`)),
    ...relations,
    ...personalities,
  ]
  const key = candidates.find((name) => ARTWORK.has(name))
  if (!key) return undefined
  return status !== 'idle' ? ARTWORK.get(`${key}_variant`) ?? ARTWORK.get(key) : ARTWORK.get(key)
}

interface Props {
  agent: AgentSpec
  status: AgentStatus
  size?: number
  petKind?: 'cat' | 'dog'
  className?: string
  animated?: boolean
}

export default function CharacterPortrait({
  agent,
  status,
  size = 96,
  petKind = 'cat',
  className,
  animated = true,
}: Props) {
  const artwork = artworkFor(agent, petKind, status)
  if (!artwork) {
    return <AgentSprite agent={agent} status={status} size={size} petKind={petKind} className={className} animated={animated} />
  }

  const animation = agentMotionClass(status, animated)

  return (
    <div className={`relative ${className ?? ''}`} style={{ width: size, height: size * 1.25 }}>
      <span className={`pointer-events-none absolute inset-0 ${animation}`} style={{ transformOrigin: '50% 100%' }}>
        <img
          src={artwork}
          alt={`${agent.name}角色立绘`}
          draggable={false}
          className="absolute bottom-0 left-1/2 max-w-none -translate-x-1/2 object-contain drop-shadow-[3px_4px_0_rgba(0,0,0,.35)]"
          style={{ width: size * 1.12, height: size * 1.12 }}
        />
      </span>
      {status === 'thinking' && (
        <span className="absolute top-[4%] right-[-4%] flex h-5 min-w-7 items-center justify-center border-2 border-ink-950 bg-paper-100 px-1 text-[9px] font-black tracking-wider text-ink-700 shadow-[2px_2px_0_rgba(0,0,0,.55)]">
          ···
        </span>
      )}
      {status === 'speaking' && (
        <span className="absolute top-[26%] right-[-7%] text-xs font-black text-gold-300 drop-shadow-[0_0_6px_rgba(233,190,111,.8)]">)))</span>
      )}
      {status === 'angry' && <span className="pixel-text absolute top-0 right-0 text-sm text-seal-400 drop-shadow-[2px_2px_0_rgba(0,0,0,.75)]" aria-label="生气">!!</span>}
      {status === 'happy' && <span className="pixel-text absolute top-0 right-0 text-sm text-gold-300 drop-shadow-[2px_2px_0_rgba(0,0,0,.75)]">✦</span>}
    </div>
  )
}
