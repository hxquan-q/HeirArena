import type { ReactNode } from 'react'
import type { AgentSpec, AgentStatus } from '../../types'

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h >>> 0)
}

const SKINS = ['#f6d7b0', '#f1c9a5', '#e8b88f', '#d9a578', '#c68a5b', '#f9e0c2']
const HAIRS = ['#2b2118', '#4a2c1a', '#111318', '#6b3f23', '#8a5a34', '#3c2a3e', '#1f2a44']
const ELDER_HAIR = '#cfd3dc'

function darken(hex: string, amt = 0.25): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, ((n >> 16) & 255) * (1 - amt))
  const g = Math.max(0, ((n >> 8) & 255) * (1 - amt))
  const b = Math.max(0, (n & 255) * (1 - amt))
  return `rgb(${r | 0},${g | 0},${b | 0})`
}

interface Props {
  agent: AgentSpec
  status: AgentStatus
  size?: number
  petKind?: 'cat' | 'dog'
  className?: string
  animated?: boolean
}

export default function AgentSprite({ agent, status, size = 96, petKind = 'cat', className, animated = true }: Props) {
  const seed = hash(agent.id)
  const anim = !animated ? '' :
    status === 'speaking' ? 'animate-bob'
      : status === 'angry' ? 'animate-shake'
        : status === 'happy' ? 'animate-bob'
          : 'animate-float'
  const isElder = ['father', 'mother', 'grandparent'].includes(agent.relation)

  return (
    <div className={className} style={{ width: size, height: size * 1.25, position: 'relative' }}>
      <svg viewBox="0 0 120 150" width={size} height={size * 1.25} className={`${anim} overflow-visible`}
        style={{ transformOrigin: '50% 100%' }}>
        <ellipse cx="60" cy="141" rx="30" ry="6" fill="rgba(0,0,0,.42)" />
        {agent.kind === 'pet' ? (
          <Pet color={agent.color} status={status} kind={petKind} seed={seed} />
        ) : agent.kind === 'ai' ? (
          <Robot color={agent.color} status={status} />
        ) : (
          <Human agent={agent} status={status} seed={seed} elder={isElder} />
        )}
        <StatusFx status={status} kind={agent.kind} />
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------------ human */
function Human({ agent, status, seed, elder }: { agent: AgentSpec; status: AgentStatus; seed: number; elder: boolean }) {
  const skin = SKINS[seed % SKINS.length]
  const hairColor = elder ? ELDER_HAIR : HAIRS[(seed >> 3) % HAIRS.length]
  const hairStyle = elder ? 4 : (seed >> 6) % 4
  const isJudge = agent.kind === 'judge'
  const torso = isJudge ? '#2a2b3f' : agent.color
  const pants = isJudge ? '#1c1d2b' : darken(agent.color, 0.55)
  const feminine = ['daughter', 'mother', 'spouse', 'daughter_in_law', 'stepchild'].includes(agent.relation) && (seed & 1) === 0
    || ['daughter', 'mother', 'daughter_in_law'].includes(agent.relation)

  return (
    <g>
      {/* legs */}
      <rect x="45" y="100" width="12" height="34" rx="5" fill={pants} />
      <rect x="63" y="100" width="12" height="34" rx="5" fill={pants} />
      <ellipse cx="51" cy="135" rx="8" ry="4" fill="#15161d" />
      <ellipse cx="69" cy="135" rx="8" ry="4" fill="#15161d" />
      {/* arms */}
      <rect x="24" y="72" width="12" height="34" rx="6" fill={darken(torso, 0.15)} />
      <rect x="84" y="72" width="12" height="34" rx="6" fill={darken(torso, 0.15)} />
      <circle cx="30" cy="108" r="6" fill={skin} />
      <circle cx="90" cy="108" r="6" fill={skin} />
      {/* torso */}
      {isJudge ? (
        <>
          <path d="M30 70 Q60 60 90 70 L96 118 Q60 126 24 118 Z" fill={torso} />
          <path d="M52 68 L60 96 L68 68 Z" fill="#a93226" />
          <rect x="54" y="70" width="12" height="14" rx="3" fill="#f6f7fb" />
          <rect x="52" y="82" width="16" height="6" rx="3" fill="#f6f7fb" />
          <circle cx="60" cy="102" r="5" fill="#d4a55a" stroke="#8a5a34" strokeWidth="1" />
        </>
      ) : (
        <>
          <rect x="34" y="66" width="52" height="46" rx="14" fill={torso} />
          <path d="M50 66 L60 78 L70 66" fill="none" stroke={darken(torso, 0.35)} strokeWidth="2" />
        </>
      )}
      {/* neck + head */}
      <rect x="54" y="56" width="12" height="12" fill={skin} />
      <circle cx="60" cy="42" r="24" fill={skin} />
      {/* ears */}
      <circle cx="36" cy="44" r="4" fill={skin} />
      <circle cx="84" cy="44" r="4" fill={skin} />
      <Hair style={hairStyle} color={hairColor} feminine={feminine} />
      <Face status={status} personality={agent.personality} />
      <Accessory agent={agent} skin={skin} elder={elder} />
    </g>
  )
}

function Hair({ style, color, feminine }: { style: number; color: string; feminine: boolean }) {
  switch (style) {
    case 0:
      return (
        <g>
          <path d="M36 40 Q36 16 60 16 Q84 16 84 40 Q74 28 60 30 Q46 28 36 40 Z" fill={color} />
          {feminine && <path d="M36 40 Q34 56 40 66 L46 62 Q40 52 40 40 Z M84 40 Q86 56 80 66 L74 62 Q80 52 80 40 Z" fill={color} />}
        </g>
      )
    case 1:
      return (
        <g>
          <path d="M34 44 Q34 14 60 14 Q86 14 86 44 L82 58 Q78 40 62 34 Q46 40 38 58 Z" fill={color} />
          {feminine && <path d="M34 44 Q30 64 36 74 L44 70 Q40 58 40 46 Z M86 44 Q90 64 84 74 L76 70 Q80 58 80 46 Z" fill={color} />}
        </g>
      )
    case 2:
      return (
        <g>
          <path d="M36 40 Q36 18 60 18 Q84 18 84 40 Q72 30 60 30 Q48 30 36 40 Z" fill={color} />
          <circle cx="60" cy="16" r="9" fill={color} />
        </g>
      )
    case 3:
      return (
        <g>
          <path d="M36 42 Q34 16 62 16 Q86 16 84 40 Q80 26 66 30 Q56 32 50 42 Q44 36 36 42 Z" fill={color} />
          {feminine && <path d="M84 40 Q88 60 82 72 L74 68 Q80 56 80 42 Z" fill={color} />}
        </g>
      )
    default:
      return (
        <g>
          <path d="M38 40 Q40 22 60 20 Q80 22 82 40 Q72 32 60 32 Q48 32 38 40 Z" fill={color} />
          {feminine && <circle cx="60" cy="18" r="8" fill={color} />}
        </g>
      )
  }
}

function Face({ status, personality }: { status: AgentStatus; personality: string }) {
  const angry = status === 'angry'
  const happy = status === 'happy'
  const speaking = status === 'speaking'
  return (
    <g>
      {(personality === 'filial' || personality === 'drama') && (
        <>
          <ellipse cx="47" cy="50" rx="5" ry="3" fill="#f4a3b0" opacity=".55" />
          <ellipse cx="73" cy="50" rx="5" ry="3" fill="#f4a3b0" opacity=".55" />
        </>
      )}
      {angry && (
        <>
          <path d="M44 34 L54 38" stroke="#1b1d24" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M76 34 L66 38" stroke="#1b1d24" strokeWidth="2.4" strokeLinecap="round" />
        </>
      )}
      {happy ? (
        <>
          <path d="M47 44 Q51 40 55 44" stroke="#1b1d24" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M65 44 Q69 40 73 44" stroke="#1b1d24" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <g className="animate-blink" style={{ transformOrigin: '60px 44px' }}>
          <ellipse cx="51" cy="44" rx="2.6" ry="3.4" fill="#1b1d24" />
          <ellipse cx="69" cy="44" rx="2.6" ry="3.4" fill="#1b1d24" />
          <circle cx="52" cy="43" r="0.9" fill="#fff" />
          <circle cx="70" cy="43" r="0.9" fill="#fff" />
        </g>
      )}
      {speaking ? (
        <ellipse cx="60" cy="56" rx="4.5" ry="3.5" fill="#7a2c2c" className="animate-caret" />
      ) : angry ? (
        <path d="M54 59 Q60 53 66 59" stroke="#1b1d24" strokeWidth="2" fill="none" strokeLinecap="round" />
      ) : happy ? (
        <path d="M52 54 Q60 63 68 54" stroke="#1b1d24" strokeWidth="2" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M55 56 Q60 59 65 56" stroke="#1b1d24" strokeWidth="2" fill="none" strokeLinecap="round" />
      )}
    </g>
  )
}

function Accessory({ agent, skin, elder }: { agent: AgentSpec; skin: string; elder: boolean }) {
  if (agent.kind === 'judge') {
    return (
      <g>
        <rect x="86" y="86" width="4" height="26" rx="2" fill="#6b3f23" transform="rotate(-25 88 100)" />
        <rect x="76" y="78" width="22" height="10" rx="3" fill="#8a5a34" transform="rotate(-25 88 84)" />
      </g>
    )
  }
  const items: ReactNode[] = []
  if (agent.relation === 'ex_spouse') {
    items.push(
      <g key="glasses">
        <rect x="44" y="39" width="13" height="9" rx="3" fill="#111318" />
        <rect x="63" y="39" width="13" height="9" rx="3" fill="#111318" />
        <path d="M57 43 L63 43" stroke="#111318" strokeWidth="2" />
      </g>,
      <rect key="case" x="12" y="104" width="22" height="16" rx="3" fill="#5c3a21" stroke="#3a2414" />,
    )
  }
  if (elder) {
    items.push(
      <g key="cane">
        <path d="M96 108 L100 136" stroke="#8a5a34" strokeWidth="3" strokeLinecap="round" />
        <path d="M88 108 Q96 100 100 108" stroke="#8a5a34" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>,
    )
  }
  switch (agent.personality) {
    case 'greedy':
      items.push(
        <g key="coin">
          <circle cx="90" cy="104" r="8" fill="#f5b942" stroke="#b3853f" strokeWidth="1.5" />
          <text x="90" y="108" fontSize="10" fontWeight="700" textAnchor="middle" fill="#7a5a17">¥</text>
        </g>,
      )
      break
    case 'filial':
      items.push(
        <g key="frame">
          <rect x="18" y="98" width="20" height="16" rx="2" fill="#f3e9d2" stroke="#8a5a34" strokeWidth="2" />
          <path d="M22 110 L27 104 L31 108 L34 105 L34 110 Z" fill="#8a5a34" />
        </g>,
      )
      break
    case 'calculating':
      items.push(
        <g key="specs">
          <circle cx="51" cy="44" r="7" fill="none" stroke="#cbd5e1" strokeWidth="1.8" />
          <circle cx="69" cy="44" r="7" fill="none" stroke="#cbd5e1" strokeWidth="1.8" />
          <path d="M58 44 L62 44" stroke="#cbd5e1" strokeWidth="1.8" />
        </g>,
      )
      break
    case 'lawyer':
      items.push(
        <g key="tie">
          <path d="M56 68 L64 68 L62 92 L60 96 L58 92 Z" fill="#7f1d1d" />
          <rect x="14" y="96" width="18" height="22" rx="2" fill="#f6f7fb" stroke="#8b93a7" />
          <path d="M18 102 H28 M18 106 H28 M18 110 H25" stroke="#8b93a7" strokeWidth="1.2" />
        </g>,
      )
      break
    case 'drama':
      items.push(
        <g key="rose">
          <path d="M90 104 L92 90" stroke="#3f7f3f" strokeWidth="2" />
          <circle cx="92" cy="88" r="5" fill="#e11d48" />
          <text x="26" y="30" fontSize="12" fill="#f1d28f">✦</text>
        </g>,
      )
      break
    case 'chill':
      items.push(
        <g key="tea">
          <rect x="22" y="102" width="16" height="12" rx="3" fill="#f3e9d2" stroke="#8a5a34" />
          <path d="M38 105 Q44 108 38 112" stroke="#8a5a34" strokeWidth="2" fill="none" />
          <path d="M27 98 Q29 94 27 90 M32 98 Q34 94 32 90" stroke="#cbd5e1" strokeWidth="1.2" fill="none" opacity=".7" />
        </g>,
      )
      break
    case 'mischief':
      items.push(
        <g key="horns">
          <path d="M40 26 L36 12 L48 20 Z" fill={agent.color} />
          <path d="M80 26 L84 12 L72 20 Z" fill={agent.color} />
        </g>,
      )
      break
    case 'loyal':
      items.push(<path key="band" d="M36 30 Q60 22 84 30 L84 36 Q60 28 36 36 Z" fill={agent.color} opacity=".85" />)
      break
  }
  if (agent.relation === 'grandchild') {
    items.push(<rect key="phone" x="84" y="100" width="12" height="18" rx="2" fill="#111318" stroke={skin} strokeWidth="1" />)
  }
  return <g>{items}</g>
}

/* -------------------------------------------------------------------- pet */
function Pet({ color, status, kind, seed }: { color: string; status: AgentStatus; kind: 'cat' | 'dog'; seed: number }) {
  const fur = kind === 'cat' ? '#f4a259' : '#d8a56b'
  const furDark = kind === 'cat' ? '#d97d2b' : '#a9784a'
  const angry = status === 'angry'
  const happy = status === 'happy'
  return (
    <g>
      {/* tail */}
      <path d="M86 116 Q108 108 100 84" stroke={fur} strokeWidth="9" fill="none" strokeLinecap="round"
        className="animate-wag" style={{ transformOrigin: '86px 116px' }} />
      {/* body */}
      <ellipse cx="60" cy="112" rx="32" ry="24" fill={fur} />
      {kind === 'cat' && (
        <>
          <path d="M44 96 Q50 104 44 112" stroke={furDark} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M58 92 Q64 102 58 112" stroke={furDark} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M72 96 Q78 104 72 112" stroke={furDark} strokeWidth="4" fill="none" strokeLinecap="round" />
        </>
      )}
      <ellipse cx="60" cy="122" rx="16" ry="10" fill="#fbe7cf" />
      {/* paws */}
      <ellipse cx="42" cy="134" rx="9" ry="5" fill={fur} />
      <ellipse cx="78" cy="134" rx="9" ry="5" fill={fur} />
      {/* head */}
      {kind === 'cat' ? (
        <>
          <path d="M34 66 L38 40 L56 58 Z" fill={fur} />
          <path d="M86 66 L82 40 L64 58 Z" fill={fur} />
          <path d="M38 62 L40 48 L52 60 Z" fill="#f7c8b0" />
          <path d="M82 62 L80 48 L68 60 Z" fill="#f7c8b0" />
        </>
      ) : (
        <>
          <ellipse cx="36" cy="66" rx="9" ry="16" fill={furDark} />
          <ellipse cx="84" cy="66" rx="9" ry="16" fill={furDark} />
        </>
      )}
      <circle cx="60" cy="70" r="26" fill={fur} />
      <ellipse cx="60" cy="80" rx="14" ry="10" fill="#fbe7cf" />
      {/* eyes */}
      {happy ? (
        <>
          <path d="M46 66 Q50 61 54 66" stroke="#1b1d24" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M66 66 Q70 61 74 66" stroke="#1b1d24" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <g className="animate-blink" style={{ transformOrigin: '60px 66px' }}>
          <ellipse cx="50" cy="66" rx="4" ry={angry ? 3 : 5} fill="#1b1d24" />
          <ellipse cx="70" cy="66" rx="4" ry={angry ? 3 : 5} fill="#1b1d24" />
          <circle cx="51" cy="64" r="1.3" fill="#fff" />
          <circle cx="71" cy="64" r="1.3" fill="#fff" />
        </g>
      )}
      {/* nose + mouth */}
      <path d="M57 76 L63 76 L60 80 Z" fill={kind === 'cat' ? '#e07a8a' : '#1b1d24'} />
      <path d={status === 'speaking' ? 'M56 83 Q60 88 64 83' : angry ? 'M56 85 Q60 82 64 85' : 'M56 82 Q58 85 60 82 Q62 85 64 82'}
        stroke="#1b1d24" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {kind === 'cat' && (
        <g stroke="#1b1d24" strokeWidth="1.2" opacity=".7">
          <path d="M30 76 L46 78 M30 82 L46 81" />
          <path d="M90 76 L74 78 M90 82 L74 81" />
        </g>
      )}
      {/* collar */}
      <path d="M40 92 Q60 100 80 92" stroke={color} strokeWidth="5" fill="none" />
      <circle cx="60" cy="98" r="4" fill="#f1d28f" stroke="#b3853f" />
      {seed % 2 === 0 && <ellipse cx="60" cy="60" rx="4" ry="2" fill={furDark} opacity=".5" />}
    </g>
  )
}

/* ------------------------------------------------------------------ robot */
function Robot({ color, status }: { color: string; status: AgentStatus }) {
  const speaking = status === 'speaking'
  return (
    <g className="animate-glitch">
      {/* antenna */}
      <path d="M60 22 L60 8" stroke="#8b93a7" strokeWidth="3" strokeLinecap="round" />
      <circle cx="60" cy="6" r="5" fill={color}>
        <animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite" />
      </circle>
      {/* head */}
      <rect x="32" y="22" width="56" height="44" rx="12" fill="#1f2433" stroke={color} strokeWidth="2" />
      <rect x="40" y="30" width="40" height="28" rx="8" fill="#0b0d12" />
      {status === 'angry' ? (
        <>
          <path d="M46 40 L56 46" stroke="#f87171" strokeWidth="4" strokeLinecap="round" />
          <path d="M74 40 L64 46" stroke="#f87171" strokeWidth="4" strokeLinecap="round" />
        </>
      ) : status === 'happy' ? (
        <>
          <path d="M46 44 Q51 38 56 44" stroke={color} strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <path d="M64 44 Q69 38 74 44" stroke={color} strokeWidth="3.5" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <rect x="46" y="38" width="10" height="5" rx="2.5" fill={color} />
          <rect x="64" y="38" width="10" height="5" rx="2.5" fill={color} />
        </>
      )}
      <path d={speaking ? 'M48 52 L52 48 L56 54 L60 47 L64 54 L68 49 L72 52' : 'M50 52 H70'}
        stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" opacity=".9" />
      {/* torso */}
      <rect x="38" y="70" width="44" height="40" rx="10" fill="#1f2433" stroke={color} strokeWidth="2" />
      <circle cx="60" cy="88" r="7" fill="none" stroke={color} strokeWidth="2" opacity=".8" />
      <circle cx="60" cy="88" r="3" fill={color}>
        <animate attributeName="r" values="3;4.5;3" dur="2s" repeatCount="indefinite" />
      </circle>
      {/* arms */}
      <rect x="24" y="72" width="10" height="30" rx="5" fill="#2a3142" stroke={color} strokeWidth="1.5" />
      <rect x="86" y="72" width="10" height="30" rx="5" fill="#2a3142" stroke={color} strokeWidth="1.5" />
      {/* hover base */}
      <ellipse cx="60" cy="122" rx="20" ry="6" fill={color} opacity=".35">
        <animate attributeName="rx" values="20;24;20" dur="1.8s" repeatCount="indefinite" />
      </ellipse>
      <path d="M48 110 L72 110 L66 120 L54 120 Z" fill="#2a3142" stroke={color} strokeWidth="1.5" />
    </g>
  )
}

/* -------------------------------------------------------------- status fx */
function StatusFx({ status, kind }: { status: AgentStatus; kind: string }) {
  const headY = kind === 'pet' ? 36 : kind === 'ai' ? 10 : 10
  if (status === 'thinking') {
    return (
      <g>
        <ellipse cx="88" cy={headY + 6} rx="16" ry="10" fill="#fff" opacity=".92" />
        <circle cx="76" cy={headY + 18} r="3" fill="#fff" opacity=".8" />
        <circle cx="71" cy={headY + 24} r="1.8" fill="#fff" opacity=".6" />
        {[0, 1, 2].map((i) => (
          <circle key={i} cx={81 + i * 7} cy={headY + 6} r="2" fill="#5b647a">
            <animate attributeName="cy" values={`${headY + 6};${headY + 3};${headY + 6}`} dur="0.9s" begin={`${i * 0.15}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </g>
    )
  }
  if (status === 'speaking') {
    return (
      <g stroke="#f1d28f" strokeWidth="2" fill="none" strokeLinecap="round">
        <path d="M98 40 Q104 48 98 56"><animate attributeName="opacity" values="1;.3;1" dur="0.8s" repeatCount="indefinite" /></path>
        <path d="M104 34 Q114 48 104 62"><animate attributeName="opacity" values=".3;1;.3" dur="0.8s" repeatCount="indefinite" /></path>
      </g>
    )
  }
  if (status === 'angry') {
    return (
      <g>
        <text x="84" y={headY + 14} fontSize="16" fill="#f87171" fontWeight="700">💢</text>
        {[0, 1].map((i) => (
          <circle key={i} cx={40 + i * 10} cy={headY + 8} r="3" fill="#f87171" opacity=".6">
            <animate attributeName="cy" values={`${headY + 8};${headY - 6}`} dur="1s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values=".6;0" dur="1s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </g>
    )
  }
  if (status === 'happy') {
    return (
      <g fill="#f1d28f">
        <text x="26" y={headY + 12} fontSize="12">✦</text>
        <text x="88" y={headY + 4} fontSize="10">✦</text>
        <text x="96" y={headY + 22} fontSize="8">✦</text>
      </g>
    )
  }
  return null
}
