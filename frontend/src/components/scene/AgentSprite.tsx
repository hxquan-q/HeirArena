import type { ReactNode } from 'react'
import type { AgentSpec, AgentStatus } from '../../types'
import { agentMotionClass } from './agentMotion'

/* ──────────────────────────────────────────────────────────────
 * 后备像素小人：没有对应立绘 PNG 时用它。
 *
 * 16×24 字符网格 → 每格 5px 的 rect，四邻自动补一格深色描边，
 * 和 Room.tsx 的瓦片、PixelGlyph 的图标共用同一套「硬边 + 三段色阶」语言。
 * 发型 / 性别 / 长者由 id 哈希决定；表情按状态换帧：idle · speaking · angry · happy。
 * ────────────────────────────────────────────────────────────── */

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h >>> 0)
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  if (Number.isNaN(n)) return hex
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))))
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`
}

const SKINS = ['#f6d7b0', '#f1c9a5', '#e8b88f', '#d9a578', '#c68a5b', '#f9e0c2']
const HAIRS = ['#2b2118', '#4a2c1a', '#111318', '#6b3f23', '#8a5a34', '#3c2a3e', '#1f2a44']
const OUTLINE = '#1e130b'

const CELL = 5
const COLS = 16
const ROWS = 24
const OX = (120 - COLS * CELL) / 2
const OY = 150 - ROWS * CELL - 8

type Grid = string[]
type Palette = Record<string, string>

/** 网格 → rect：先铺一圈描边，再铺色块；同行同色相邻格合并 */
function renderGrid(grid: Grid, palette: Palette, ox = OX, oy = OY, cell = CELL) {
  const filled = (x: number, y: number) => {
    const ch = grid[y]?.[x]
    return !!ch && ch !== '.' && ch !== ' ' && !!palette[ch]
  }
  const outline = new Set<string>()
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!filled(x, y)) continue
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!filled(x + dx, y + dy)) outline.add(`${x + dx},${y + dy}`)
      }
    }
  }
  const outlineRects = [...outline].map((k) => {
    const [x, y] = k.split(',').map(Number)
    return <rect key={`o${k}`} x={ox + x * cell} y={oy + y * cell} width={cell} height={cell} fill={OUTLINE} />
  })
  const fillRects: ReactNode[] = []
  grid.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const ch = row[x]
      if (!filled(x, y)) { x++; continue }
      let end = x
      while (end + 1 < row.length && row[end + 1] === ch) end++
      fillRects.push(<rect key={`${x},${y}`} x={ox + x * cell} y={oy + y * cell} width={(end - x + 1) * cell} height={cell} fill={palette[ch]} />)
      x = end + 1
    }
  })
  return { outlineRects, fillRects }
}

/** 在网格上盖一层字符（越界忽略） */
function paint(grid: Grid, cells: [number, number, string][]): Grid {
  const rows = grid.map((r) => r.split(''))
  for (const [x, y, ch] of cells) {
    if (rows[y] && x >= 0 && x < COLS) rows[y][x] = ch
  }
  return rows.map((r) => r.join(''))
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
  const anim = agentMotionClass(status, animated)
  const isElder = ['father', 'mother', 'grandparent'].includes(agent.relation)

  const body = agent.kind === 'pet'
    ? petGrid(petKind, status, agent.color)
    : agent.kind === 'ai'
      ? robotGrid(status, agent.color)
      : humanGrid(agent, status, seed, isElder)

  const { outlineRects, fillRects } = renderGrid(body.grid, body.palette)
  const blinking = animated && body.eyelids && status !== 'happy' && status !== 'angry'

  return (
    <div className={className} style={{ width: size, height: size * 1.25, position: 'relative' }}>
      <svg viewBox="0 0 120 150" width={size} height={size * 1.25} className={`${anim} overflow-visible`}
        style={{ transformOrigin: '50% 100%' }} shapeRendering="crispEdges">
        {/* 脚下的像素影子：两行台阶 */}
        <rect x="36" y="140" width="48" height="4" fill="rgba(0,0,0,.42)" />
        <rect x="44" y="144" width="32" height="3" fill="rgba(0,0,0,.42)" />
        {outlineRects}
        {fillRects}
        {/* 眨眼：一层眼皮色块平时透明，每隔几秒闪一帧盖住眼睛 */}
        {blinking && body.eyelids && (
          <g className="animate-eyelid" fill={body.eyelids.fill}>
            {body.eyelids.cells.map(([x, y]) => (
              <rect key={`${x},${y}`} x={OX + x * CELL} y={OY + y * CELL} width={CELL} height={CELL} />
            ))}
          </g>
        )}
        <StatusFx status={status} kind={agent.kind} animated={animated} />
      </svg>
    </div>
  )
}

interface Body {
  grid: Grid
  palette: Palette
  /** 眨眼时盖住眼睛的格子与颜色；机器人没有 */
  eyelids?: { cells: [number, number][]; fill: string }
}

/* ------------------------------------------------------------------ human */

/* 基础人形：H 头发 · S 皮肤 · s 皮肤阴影 · W 眼白 · E 眼睛 · M 嘴 · T 上衣 · t 上衣阴影 · P 裤 · B 鞋 · A 强调色 · C 白领 */
const HUMAN_BASE: Grid = [
  '......HHHH......',
  '....HHHHHHHH....',
  '...HHHHHHHHHH...',
  '...HHHHHHHHHH...',
  '...HHSSSSSSHH...',
  '...HSSSSSSSSH...',
  '...HSWESSWESH...',
  '...HSSSSSSSSH...',
  '....SSSMMSSS....',
  '....sSSSSSSs....',
  '......SSSS......',
  '....TTTTTTTT....',
  '..TTTTTTTTTTTT..',
  '.TTTTTTTTTTTTTT.',
  '.TtTTTTTTTTTTtT.',
  '.StTTTTTTTTTTtS.',
  '.S.tTTTTTTTTt.S.',
  '...TTTTTTTTTT...',
  '...PPPPPPPPPP...',
  '...PPPP..PPPP...',
  '...PPPP..PPPP...',
  '...PPPP..PPPP...',
  '...BBBB..BBBB...',
  '..BBBBB..BBBBB..',
]

function humanGrid(agent: AgentSpec, status: AgentStatus, seed: number, elder: boolean): Body {
  const isJudge = agent.kind === 'judge'
  const skin = SKINS[seed % SKINS.length]
  const hair = elder ? '#cfd3dc' : HAIRS[(seed >> 3) % HAIRS.length]
  const torso = isJudge ? '#2a2b3f' : agent.color
  const feminine = ['daughter', 'mother', 'daughter_in_law'].includes(agent.relation)
    || (['spouse', 'stepchild', 'grandchild', 'sibling', 'friend'].includes(agent.relation) && (seed & 1) === 0)
  const hairStyle = (seed >> 6) % 3

  let grid = HUMAN_BASE
  /* 发型 */
  if (hairStyle === 1) grid = paint(grid, [[5, 0, 'H'], [10, 0, 'H'], [4, 1, 'H'], [11, 1, 'H'], [7, 0, '.'], [8, 0, '.']])
  if (hairStyle === 2) grid = paint(grid, [[6, 0, '.'], [9, 0, '.'], [7, 0, 'H'], [8, 0, 'H']])
  if (feminine) {
    grid = paint(grid, [[3, 8, 'H'], [12, 8, 'H'], [3, 9, 'H'], [12, 9, 'H'], [2, 10, 'H'], [13, 10, 'H'], [2, 11, 'H'], [13, 11, 'H']])
  }
  /* 表情 */
  if (status === 'angry') {
    /* 外侧压低的眉 + 倒 U 形的嘴 */
    grid = paint(grid, [[5, 5, 'E'], [10, 5, 'E'], [6, 9, 'M'], [9, 9, 'M']])
  } else if (status === 'happy') {
    /* 眯成一条线的笑眼 + 咧开的嘴 */
    grid = paint(grid, [[5, 5, 'E'], [6, 5, 'E'], [9, 5, 'E'], [10, 5, 'E'], [5, 6, 'S'], [6, 6, 'S'], [9, 6, 'S'], [10, 6, 'S'], [6, 8, 'M'], [9, 8, 'M']])
  } else if (status === 'speaking') {
    grid = paint(grid, [[7, 9, 'M'], [8, 9, 'M']])
  }
  /* 长者：拐杖 */
  if (elder) grid = paint(grid, [[14, 15, 'K'], [14, 16, 'K'], [14, 17, 'K'], [14, 18, 'K'], [14, 19, 'K'], [14, 20, 'K'], [14, 21, 'K'], [15, 15, 'K']])
  /* 执行官：白领 + 红领带 */
  if (isJudge) grid = paint(grid, [[6, 11, 'C'], [9, 11, 'C'], [7, 11, 'A'], [8, 11, 'A'], [7, 12, 'A'], [8, 12, 'A'], [7, 13, 'A'], [8, 13, 'A']])

  grid = paint(grid, accessoryCells(agent, elder))

  return {
    grid,
    eyelids: { cells: [[5, 6], [6, 6], [9, 6], [10, 6]], fill: skin },
    palette: {
      H: hair, S: skin, s: shade(skin, -0.18), W: '#f6f7fb', E: '#1b1d24', M: '#7a2c2c',
      T: torso, t: shade(torso, -0.28), P: isJudge ? '#1c1d2b' : shade(torso, -0.55), B: '#15161d',
      A: isJudge ? '#a93226' : agent.color, C: '#f6f7fb', K: '#8a5a34',
      G: '#f5b942', g: '#b3853f', R: '#e11d48', L: '#3f7f3f', X: '#cbd5e1', Q: '#f3e9d2', h: '#f472b6',
    },
  }
}

/** 职业 / 关系道具：贪婪拿金币，律师系领带，精算戴眼镜，戏精插花，捣蛋长角，忠诚系头带，佛系端茶，孝顺抱相片 */
function accessoryCells(agent: AgentSpec, elder: boolean): [number, number, string][] {
  const cells: [number, number, string][] = []
  const glasses: [number, number, string][] = [[4, 6, 'X'], [7, 6, 'X'], [8, 6, 'X'], [11, 6, 'X'], [5, 7, 'X'], [6, 7, 'X'], [9, 7, 'X'], [10, 7, 'X']]
  if (agent.relation === 'ex_spouse' || agent.personality === 'calculating') cells.push(...glasses)
  if (agent.relation === 'grandchild' && !elder) cells.push([14, 15, 'E'], [14, 16, 'E'], [14, 17, 'E'], [14, 16, 'X'])
  switch (agent.personality) {
    case 'greedy':
      cells.push([0, 14, 'G'], [1, 14, 'G'], [0, 15, 'G'], [1, 15, 'g'])
      break
    case 'lawyer':
      cells.push([7, 11, 'R'], [8, 11, 'R'], [7, 12, 'R'], [8, 12, 'R'], [7, 13, 'R'], [8, 13, 'R'], [7, 14, 'R'])
      break
    case 'drama':
      cells.push([12, 1, 'R'], [13, 1, 'R'], [12, 2, 'R'], [13, 2, 'R'], [13, 3, 'L'])
      break
    case 'mischief':
      cells.push([3, 0, 'A'], [3, 1, 'A'], [4, 1, 'A'], [12, 0, 'A'], [12, 1, 'A'], [11, 1, 'A'])
      break
    case 'loyal':
      cells.push([3, 3, 'A'], [4, 3, 'A'], [5, 3, 'A'], [6, 3, 'A'], [7, 3, 'A'], [8, 3, 'A'], [9, 3, 'A'], [10, 3, 'A'], [11, 3, 'A'], [12, 3, 'A'])
      break
    case 'chill':
      cells.push([0, 14, 'Q'], [1, 14, 'Q'], [0, 15, 'Q'], [1, 15, 'Q'], [0, 13, 'X'])
      break
    case 'filial':
      cells.push([14, 13, 'h'], [15, 13, 'h'], [14, 14, 'h'], [15, 14, 'h'])
      break
  }
  return cells
}

/* -------------------------------------------------------------------- pet */

/* F 毛色 · f 深毛 · p 耳内 / 鼻 · W 眼白 · E 眼 · N 口鼻区 · A 项圈 · G 铃铛 */
const CAT: Grid = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '...F......F.....',
  '...FF....FF.....',
  '...FpFFFFpF.....',
  '...FFFFFFFF.....',
  '...FWEFFWEF.....',
  '...FFFFpFFF.....',
  '...FNNNNNNF...F.',
  '....FFFFFF...FF.',
  '...AAAAGAAA..F..',
  '..FFFFFFFFFF.F..',
  '..FfFFfFFfFFFF..',
  '..FFFFFFFFFFF...',
  '..FFFFFFFFFF....',
  '..NNNNNNNNNN....',
  '..FF.FFFF.FF....',
  '..FF.FFFF.FF....',
  '................',
  '................',
]

const DOG: Grid = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '..ff......ff....',
  '..ffFFFFFFff....',
  '..ffFFFFFFff....',
  '..ffWEFFWEff....',
  '..ffFFFFFFff....',
  '...FNNpNNNF...F.',
  '....FNNNNF...FF.',
  '...AAAAGAAA..F..',
  '..FFFFFFFFFF.F..',
  '..FFFFFFFFFFFF..',
  '..FfFFFFFFfFF...',
  '..FFFFFFFFFF....',
  '..NNNNNNNNNN....',
  '..FF.FFFF.FF....',
  '..FF.FFFF.FF....',
  '................',
  '................',
]

function petGrid(kind: 'cat' | 'dog', status: AgentStatus, collar: string): Body {
  let grid = kind === 'cat' ? CAT : DOG
  if (status === 'happy') grid = paint(grid, [[4, 10, 'E'], [5, 10, 'F'], [8, 10, 'E'], [9, 10, 'F']])
  if (status === 'angry') grid = paint(grid, [[4, 10, 'E'], [5, 10, 'E'], [8, 10, 'E'], [9, 10, 'E'], [4, 9, 'f'], [9, 9, 'f']])
  if (status === 'speaking') grid = paint(grid, [[6, 12, 'E'], [7, 12, 'E']])
  const fur = kind === 'cat' ? '#f4a259' : '#d8a56b'
  return {
    grid,
    eyelids: { cells: [[4, 10], [5, 10], [8, 10], [9, 10]], fill: fur },
    palette: {
      F: fur, f: kind === 'cat' ? '#d97d2b' : '#a9784a', p: kind === 'cat' ? '#e07a8a' : '#1b1d24',
      W: '#f6f7fb', E: '#1b1d24', N: '#fbe7cf', A: collar, G: '#f1d28f',
    },
  }
}

/* ------------------------------------------------------------------ robot */

/* D 机壳 · d 机壳阴影 · A 发光色 · V 屏幕 · X 金属 */
const ROBOT: Grid = [
  '.......A........',
  '.......X........',
  '....DDDDDDDD....',
  '...DDDDDDDDDD...',
  '...DVVVVVVVVD...',
  '...DVAAVVAAVD...',
  '...DVVVVVVVVD...',
  '...DVVAAAAVVD...',
  '...DDDDDDDDDD...',
  '....dDDDDDDd....',
  '......XXXX......',
  '....DDDDDDDD....',
  '..XDDDDDDDDDDX..',
  '..XDDDAAAADDDX..',
  '..XDDDAAAADDDX..',
  '..XDDDDDDDDDDX..',
  '..X.DDDDDDDD.X..',
  '....dDDDDDDd....',
  '.....DDDDDD.....',
  '....dAAAAAAd....',
  '...AAAAAAAAAA...',
  '....AAAAAAAA....',
  '................',
  '................',
]

function robotGrid(status: AgentStatus, color: string): Body {
  let grid = ROBOT
  if (status === 'angry') grid = paint(grid, [[5, 5, 'R'], [6, 5, 'R'], [9, 5, 'R'], [10, 5, 'R'], [6, 7, 'R'], [7, 7, 'R'], [8, 7, 'R'], [9, 7, 'R']])
  if (status === 'happy') grid = paint(grid, [[4, 5, 'A'], [7, 5, 'A'], [8, 5, 'A'], [11, 5, 'A'], [5, 5, 'V'], [6, 5, 'V'], [9, 5, 'V'], [10, 5, 'V'], [5, 7, 'A'], [10, 7, 'A']])
  if (status === 'speaking') grid = paint(grid, [[6, 7, 'V'], [8, 7, 'V'], [5, 7, 'A'], [7, 7, 'A'], [9, 7, 'A']])
  return {
    grid,
    palette: { D: '#1f2433', d: '#141826', A: color, V: '#0b0d12', X: '#8b93a7', R: '#f87171' },
  }
}

/* -------------------------------------------------------------- status fx */

/** 头顶状态特效：思考云、说话声波、生气感叹号、开心星星——全是方块 */
function StatusFx({ status, kind, animated }: { status: AgentStatus; kind: string; animated: boolean }) {
  const headY = kind === 'pet' ? OY + 6 * CELL : OY
  const blink = animated ? 'animate-blink-step' : ''
  if (status === 'thinking') {
    return (
      <g>
        <rect x="88" y={headY - 2} width="24" height="16" fill="#f6f7fb" />
        <rect x="84" y={headY + 2} width="32" height="8" fill="#f6f7fb" />
        <rect x="82" y={headY + 16} width="6" height="6" fill="#f6f7fb" />
        <rect x="76" y={headY + 24} width="4" height="4" fill="#f6f7fb" opacity=".8" />
        {[0, 1, 2].map((i) => (
          <rect key={i} x={91 + i * 7} y={headY + 4} width="4" height="4" fill="#5b647a" className={blink} style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </g>
    )
  }
  if (status === 'speaking') {
    return (
      <g fill="#f1d28f">
        <rect x="100" y={headY + 22} width="4" height="12" className={blink} />
        <rect x="106" y={headY + 16} width="4" height="24" className={blink} style={{ animationDelay: '.18s' }} />
        <rect x="112" y={headY + 10} width="4" height="36" className={blink} style={{ animationDelay: '.36s' }} />
      </g>
    )
  }
  if (status === 'angry') {
    return (
      <g fill="#f87171">
        <rect x="92" y={headY - 6} width="5" height="16" />
        <rect x="92" y={headY + 13} width="5" height="5" />
        <rect x="100" y={headY - 6} width="5" height="16" />
        <rect x="100" y={headY + 13} width="5" height="5" />
        {[0, 1].map((i) => (
          <rect key={i} x={30 + i * 10} y={headY + 4} width="5" height="5" opacity=".7" className={animated ? 'animate-rise' : ''} style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
      </g>
    )
  }
  if (status === 'happy') {
    const star = (x: number, y: number, s: number) => (
      <g key={`${x}${y}`} fill="#f1d28f">
        <rect x={x - s} y={y} width={s * 3} height={s} />
        <rect x={x} y={y - s} width={s} height={s * 3} />
      </g>
    )
    return <g>{star(22, headY + 8, 4)}{star(96, headY, 3)}{star(104, headY + 20, 2)}</g>
  }
  return null
}
