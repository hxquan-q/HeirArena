import { H, W, type Pt } from './layout'

/** 背景层：墙面、徽章、地板、法官席后部、红毯、绿植。 */
export function RoomBackground({ decedentName }: { decedentName?: string }) {
  const floorLines = Array.from({ length: 14 }, (_, i) => 300 + Math.pow(i, 1.55) * 7)
  const fanLines = Array.from({ length: 13 }, (_, i) => -600 + i * 200)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="moonbeam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(255,220,150,0.18)" />
          <stop offset="1" stopColor="rgba(255,220,150,0)" />
        </linearGradient>
        <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3c2c1b" />
          <stop offset="1" stopColor="#25190e" />
        </linearGradient>
        <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b2117" />
          <stop offset="1" stopColor="#170f09" />
        </linearGradient>
        <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5c3a21" />
          <stop offset="1" stopColor="#3a2414" />
        </linearGradient>
        <linearGradient id="carpet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7a1f2b" />
          <stop offset="1" stopColor="#4a1119" />
        </linearGradient>
        <radialGradient id="emblem" cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#f7dfa5" />
          <stop offset="0.6" stopColor="#d4a55a" />
          <stop offset="1" stopColor="#8a5a34" />
        </radialGradient>
        <radialGradient id="lamp" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="rgba(255,214,140,0.55)" />
          <stop offset="1" stopColor="rgba(255,214,140,0)" />
        </radialGradient>
        <linearGradient id="window" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3f6fb5" />
          <stop offset="0.55" stopColor="#7a86a8" />
          <stop offset="1" stopColor="#efac63" />
        </linearGradient>
        <radialGradient id="spot" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="rgba(241,210,143,0.28)" />
          <stop offset="1" stopColor="rgba(241,210,143,0)" />
        </radialGradient>
      </defs>

      {/* wall */}
      <rect x="0" y="0" width={W} height="300" fill="url(#wall)" />
      {/* moonlight beams from the windows */}
      <polygon points="90,60 210,60 320,320 20,320" fill="url(#moonbeam)" opacity=".5" />
      <polygon points="990,60 1110,60 1180,320 880,320" fill="url(#moonbeam)" opacity=".5" />
      {/* windows */}
      {[90, 990].map((x) => (
        <g key={x}>
          <rect x={x} y="36" width="120" height="170" rx="10" fill="url(#window)" stroke="#3a2414" strokeWidth="5" />
          <path d={`M${x + 60} 36 V206 M${x} 100 H${x + 120} M${x} 160 H${x + 120}`} stroke="#3a2414" strokeWidth="4" />
          <circle cx={x + 30} cy="68" r="10" fill="#e9eef8" opacity=".85" />
          <g fill="#f1d28f" opacity=".7">
            <circle cx={x + 88} cy="58" r="1.4" />
            <circle cx={x + 100} cy="82" r="1" />
            <circle cx={x + 20} cy="130" r="1.2" />
            <circle cx={x + 95} cy="140" r="1" />
          </g>
        </g>
      ))}
      {/* sconces */}
      {[300, 900].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy="120" rx="90" ry="70" fill="url(#lamp)" />
          <path d={`M${x - 14} 112 Q${x} 96 ${x + 14} 112 L${x + 10} 126 H${x - 10} Z`} fill="#d4a55a" />
          <rect x={x - 3} y="126" width="6" height="18" rx="2" fill="#8a5a34" />
        </g>
      ))}
      {/* wood paneling */}
      <rect x="0" y="196" width={W} height="104" fill="url(#panel)" />
      <rect x="0" y="192" width={W} height="6" fill="#8a5a34" />
      {Array.from({ length: 16 }, (_, i) => (
        <rect key={i} x={i * 75 + 8} y="206" width="60" height="84" rx="3" fill="#4a2e1b" stroke="#2f1c0f" strokeWidth="1.5" />
      ))}

      {/* emblem + sign */}
      <circle cx="600" cy="92" r="46" fill="url(#emblem)" stroke="#6b3f23" strokeWidth="3" />
      <circle cx="600" cy="92" r="38" fill="none" stroke="#7a4a22" strokeWidth="1.5" opacity=".7" />
      <g stroke="#3a2414" strokeWidth="3.5" strokeLinecap="round" fill="none">
        <path d="M600 66 V118" />
        <path d="M578 76 H622" />
        <path d="M572 100 L578 82 L584 100 Z" strokeWidth="2.5" />
        <path d="M616 100 L622 82 L628 100 Z" strokeWidth="2.5" />
        <path d="M568 100 H588 M612 100 H632" strokeWidth="2.5" />
        <path d="M588 120 H612" />
      </g>
      <text x="600" y="164" textAnchor="middle" fill="#f1d28f" fontSize="24" fontWeight="700" letterSpacing="10"
        style={{ fontFamily: '"Noto Serif SC","Songti SC","SimSun",serif' }}>
        遗 产 听 证 庭
      </text>
      <text x="600" y="184" textAnchor="middle" fill="#b3853f" fontSize="10" letterSpacing="4" opacity=".9">
        HEIR ARENA · FAMILY INHERITANCE HEARING
      </text>

      {/* floor */}
      <rect x="0" y="300" width={W} height="400" fill="url(#floor)" />
      <g stroke="rgba(255,255,255,0.05)" strokeWidth="1">
        {floorLines.map((y) => <line key={y} x1="0" x2={W} y1={y} y2={y} />)}
        {fanLines.map((x) => <line key={x} x1="600" y1="300" x2={x} y2={H} />)}
      </g>
      {/* red carpet aisle */}
      <path d="M552 470 L648 470 L760 700 L440 700 Z" fill="url(#carpet)" />
      <path d="M560 470 L640 470 L744 700 L456 700 Z" fill="none" stroke="#d4a55a" strokeWidth="1.5" opacity=".45" />

      {/* dais under the bench */}
      <path d="M380 300 L820 300 L850 345 L350 345 Z" fill="#4a2e1b" />
      <rect x="350" y="345" width="500" height="10" fill="#2f1c0f" />

      {/* memorial easel with the decedent's portrait */}
      <g transform="translate(268 268)">
        {/* easel legs */}
        <path d="M-30 108 L0 -6 L30 108" fill="none" stroke="#4a2e1b" strokeWidth="6" strokeLinecap="round" />
        <line x1="0" y1="10" x2="0" y2="112" stroke="#4a2e1b" strokeWidth="5" strokeLinecap="round" />
        <line x1="-26" y1="62" x2="26" y2="62" stroke="#5c3a21" strokeWidth="4" />
        {/* frame */}
        <rect x="-34" y="-24" width="68" height="84" rx="6" fill="#2f1c0f" stroke="#8a5a34" strokeWidth="4" />
        <rect x="-27" y="-17" width="54" height="70" rx="3" fill="#151a24" />
        {/* portrait silhouette */}
        <circle cx="0" cy="4" r="12" fill="#8b93a7" opacity=".85" />
        <path d="M-17 53 Q-17 26 0 26 Q17 26 17 53 Z" fill="#8b93a7" opacity=".85" />
        {/* black mourning ribbon across the corner */}
        <path d="M-40 -14 L-12 -30 L-6 -19 L-36 -2 Z" fill="#111318" stroke="#000" strokeWidth="1" />
        {/* small white chrysanthemum */}
        <g transform="translate(24 56)">
          {Array.from({ length: 8 }, (_, i) => (
            <ellipse key={i} cx="0" cy="-5.5" rx="2.2" ry="5.5" fill="#e9eef8" transform={`rotate(${i * 45})`} />
          ))}
          <circle r="2.6" fill="#f1d28f" />
        </g>
        {/* name plaque */}
        {decedentName && (
          <g>
            <rect x="-30" y="66" width="60" height="17" rx="4" fill="#3a2414" stroke="#8a5a34" strokeWidth="1.5" />
            <text x="0" y="78.5" textAnchor="middle" fontSize="11" fill="#f1d28f" letterSpacing="1"
              style={{ fontFamily: '"Noto Serif SC","Songti SC","SimSun",serif' }}>
              {decedentName.length > 5 ? decedentName.slice(0, 5) : decedentName}
            </text>
          </g>
        )}
      </g>

      {/* plants */}
      {[70, 1130].map((x) => (
        <g key={x}>
          <path d={`M${x - 18} 330 H${x + 18} L${x + 12} 372 H${x - 12} Z`} fill="#8a5a34" />
          <circle cx={x} cy="316" r="22" fill="#2f6b3a" />
          <circle cx={x - 14} cy="326" r="14" fill="#3b8a48" />
          <circle cx={x + 14} cy="324" r="15" fill="#26582f" />
        </g>
      ))}
    </svg>
  )
}

/** 前景层：会遮住人物腿部的家具（法官席台面、证人台、家属席桌子）。 */
export function RoomForeground({ seats, speakerActive }: { seats: Pt[]; speakerActive: boolean }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
      {/* judge bench */}
      <rect x="410" y="238" width="380" height="68" rx="8" fill="#6b3f23" />
      <rect x="410" y="232" width="380" height="12" rx="4" fill="#8a5a34" />
      <rect x="426" y="256" width="348" height="40" rx="4" fill="#5c3a21" />
      <rect x="540" y="262" width="120" height="22" rx="4" fill="#d4a55a" />
      <text x="600" y="278" textAnchor="middle" fontSize="13" fontWeight="700" fill="#3a2414" letterSpacing="2">遗嘱执行官</text>
      <g transform="translate(720 252)">
        <rect x="-4" y="-4" width="8" height="26" rx="3" fill="#3a2414" transform="rotate(-30)" />
        <rect x="-14" y="-16" width="28" height="12" rx="3" fill="#8a5a34" transform="rotate(-30)" />
      </g>
      {/* speaking spotlight */}
      {speakerActive && <ellipse cx="600" cy="452" rx="110" ry="34" fill="url(#spot)" />}
      {/* lectern */}
      <path d="M566 410 L634 410 L642 458 L558 458 Z" fill="#6b3f23" />
      <path d="M560 402 L640 402 L634 412 L566 412 Z" fill="#8a5a34" />
      <rect x="572" y="420" width="56" height="30" rx="3" fill="#5c3a21" />
      <path d="M600 402 V386" stroke="#8b93a7" strokeWidth="2" />
      <circle cx="600" cy="384" r="4" fill="#c3c9d6" />
      {/* seats' desks */}
      {seats.map((p, i) => (
        <g key={i}>
          <rect x={p.x - 52} y={p.y - 30} width="104" height="24" rx="5" fill="#5c3a21" />
          <rect x={p.x - 52} y={p.y - 34} width="104" height="8" rx="3" fill="#8a5a34" />
          <rect x={p.x - 20} y={p.y - 22} width="40" height="9" rx="2" fill="#f3e9d2" opacity=".85" />
        </g>
      ))}
    </svg>
  )
}
