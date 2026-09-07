import { memo } from 'react'
import { Balance, Gavel } from '../icons/pixel'
import { H, W, type Pt } from './layout'
import PixelGlyph from './PixelGlyph'

/* ──────────────────────────────────────────────────────────────
 * 像素听证庭 · 星露谷式室内瓦片
 *
 * 全部用 4px 网格上的矩形拼出来：没有渐变、没有圆角、没有曲线。
 * 立体感全靠三段色阶（亮 / 本色 / 暗）+ 1 格深色描边。
 * 坐标沿用 layout.ts 里的锚点：法官席 y≈232–306、发言台 y≈400–460、
 * 家属席桌子跟随 seatPositions()，保证人物依旧被家具正确遮挡。
 * ────────────────────────────────────────────────────────────── */

const U = 4
const snap = (v: number) => Math.round(v / U) * U
const snap8 = (v: number) => Math.round(v / 8) * 8

const C = {
  out: '#1e130b',
  wall: '#4a3324', wallHi: '#563b2b', wallLo: '#3f2b1e',
  woodHi: '#b8794a', wood1: '#8a5a34', wood2: '#6b4426', wood3: '#5c3a21', wood4: '#4a2e1b', wood5: '#3a2414',
  floorA: '#6b4426', floorB: '#73492a', floorSeam: '#3f2716', floorHi: '#7f5330',
  carpet: '#7a1f2b', carpetHi: '#8f2634', carpetLo: '#4a1119',
  gold: '#d4a55a', goldHi: '#f1d28f', goldLo: '#8a5a34',
  sky1: '#16233f', sky2: '#1f3358', sky3: '#2b4370', star: '#e9eef8', starDim: '#8ea0c9', moon: '#f4f0dc', moonLo: '#d9d3b8',
  leaf1: '#2f6b3a', leaf2: '#3b8a48', leaf3: '#26582f', leafHi: '#5db36a',
  clay: '#b8794a', clayLo: '#8a5a34', clayHi: '#d19a63',
  paper: '#f2e6c8', paperLo: '#c9b58a', ink: '#2b1c10',
  slate: '#151a24', silver: '#8b93a7', silverHi: '#c3c9d6',
  flame: '#ea6a5b', flameHi: '#f3d38a', glow: '#ffd68c',
  ribbon: '#111318', seal: '#d9483b',
  velvet: '#5a1c26', velvetHi: '#7a1f2b',
}

const PIXEL_FONT = { fontFamily: 'var(--font-pixel)' } as const

/** 像素椭圆：按行切片，每行宽度取整到 8px，得到台阶状的硬边椭圆 */
function ellipseRows(cx: number, cy: number, rx: number, ry: number, step = U) {
  const rows: { x: number; y: number; w: number; h: number }[] = []
  for (let y = -ry; y < ry; y += step) {
    const t = (y + step / 2) / ry
    const w = snap8(2 * rx * Math.sqrt(Math.max(0, 1 - t * t)))
    if (w <= 0) continue
    rows.push({ x: cx - w / 2, y: cy + y, w, h: step })
  }
  return rows
}

function Rows({ rows, fill, opacity }: { rows: { x: number; y: number; w: number; h: number }[]; fill: string; opacity?: number }) {
  return (
    <g fill={fill} opacity={opacity}>
      {rows.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} />)}
    </g>
  )
}

/** 带 1 格描边的方块：先画描边再画本体 */
function Block({ x, y, w, h, fill, out = C.out }: { x: number; y: number; w: number; h: number; fill: string; out?: string }) {
  return (
    <>
      <rect x={x - U} y={y - U} width={w + U * 2} height={h + U * 2} fill={out} />
      <rect x={x} y={y} width={w} height={h} fill={fill} />
    </>
  )
}

/* ─── 墙面 ─────────────────────────────────────────────────── */

function Wallpaper() {
  return (
    <>
      <defs>
        <pattern id="px-wallpaper" width="32" height="32" patternUnits="userSpaceOnUse">
          <rect width="32" height="32" fill={C.wall} />
          {/* 菱形小花 */}
          <rect x="12" y="16" width="4" height="4" fill={C.wallHi} />
          <rect x="16" y="12" width="4" height="4" fill={C.wallHi} />
          <rect x="20" y="16" width="4" height="4" fill={C.wallHi} />
          <rect x="16" y="20" width="4" height="4" fill={C.wallHi} />
          <rect x="16" y="16" width="4" height="4" fill={C.wallLo} />
          <rect x="0" y="0" width="4" height="4" fill={C.wallLo} />
        </pattern>
      </defs>
      <rect x="0" y="0" width={W} height="204" fill="url(#px-wallpaper)" />
      {/* 顶部一条阴影，像天花板压下来 */}
      <rect x="0" y="0" width={W} height="8" fill={C.out} opacity=".55" />
      <rect x="0" y="8" width={W} height="4" fill={C.out} opacity=".25" />
    </>
  )
}

function Window({ x, moon }: { x: number; moon: boolean }) {
  const y = 36
  const w = 120
  const h = 168
  const paneX = x + 8
  const paneY = y + 8
  const paneW = w - 16
  const paneH = h - 16
  const moonRows = ellipseRows(x + 88, y + 40, 12, 12)
  const stars: [number, number, string][] = moon
    ? [[x + 24, y + 20, C.star], [x + 40, y + 52, C.starDim], [x + 20, y + 100, C.star], [x + 100, y + 116, C.starDim], [x + 60, y + 132, C.star]]
    : [[x + 28, y + 24, C.star], [x + 84, y + 36, C.star], [x + 56, y + 60, C.starDim], [x + 24, y + 108, C.starDim], [x + 96, y + 96, C.star], [x + 64, y + 140, C.starDim]]
  return (
    <g>
      {/* 红丝绒帷幔 */}
      <rect x={x - 16} y={y - 16} width={w + 32} height={16} fill={C.velvetHi} />
      <rect x={x - 16} y={y - 4} width={w + 32} height={4} fill={C.velvet} />
      <rect x={x - 16} y={y} width={w + 32} height={4} fill={C.out} opacity=".5" />
      {Array.from({ length: 5 }, (_, i) => (
        <rect key={i} x={x - 8 + i * 32} y={y - 12} width={4} height={12} fill={C.velvet} />
      ))}
      {/* 窗框 */}
      <Block x={x} y={y} w={w} h={h} fill={C.wood3} />
      <rect x={x} y={y} width={w} height={4} fill={C.wood1} />
      <rect x={x} y={y} width={4} height={h} fill={C.wood1} />
      {/* 夜空：三段色阶 */}
      <rect x={paneX} y={paneY} width={paneW} height={paneH} fill={C.sky1} />
      <rect x={paneX} y={paneY + 64} width={paneW} height={paneH - 64} fill={C.sky2} />
      <rect x={paneX} y={paneY + 116} width={paneW} height={paneH - 116} fill={C.sky3} />
      {/* 星星 */}
      {stars.map(([sx, sy, fill], i) => <rect key={i} x={sx} y={sy} width={4} height={4} fill={fill} />)}
      {/* 月亮 */}
      {moon && (
        <>
          <Rows rows={moonRows} fill={C.moon} />
          <rect x={x + 84} y={y + 40} width={8} height={4} fill={C.moonLo} />
          <rect x={x + 92} y={y + 32} width={4} height={4} fill={C.moonLo} />
        </>
      )}
      {/* 远处山脊剪影 */}
      <rect x={paneX} y={paneY + paneH - 24} width={paneW} height={24} fill={C.sky1} opacity=".55" />
      <rect x={paneX + 16} y={paneY + paneH - 32} width={24} height={8} fill={C.sky1} opacity=".55" />
      <rect x={paneX + 64} y={paneY + paneH - 36} width={28} height={12} fill={C.sky1} opacity=".55" />
      {/* 十字窗棂 */}
      <rect x={x + w / 2 - 4} y={paneY} width={8} height={paneH} fill={C.wood3} />
      <rect x={paneX} y={y + h / 2 - 4} width={paneW} height={8} fill={C.wood3} />
      <rect x={x + w / 2 - 4} y={paneY} width={4} height={paneH} fill={C.wood1} />
      <rect x={paneX} y={y + h / 2 - 4} width={paneW} height={4} fill={C.wood1} />
      {/* 玻璃反光 */}
      <rect x={paneX + 8} y={paneY + 8} width={4} height={24} fill="#ffffff" opacity=".18" />
      <rect x={paneX + 12} y={paneY + 8} width={4} height={12} fill="#ffffff" opacity=".18" />
      {/* 窗台 */}
      <rect x={x - 12} y={y + h + 4} width={w + 24} height={8} fill={C.wood1} />
      <rect x={x - 12} y={y + h + 4} width={w + 24} height={4} fill={C.woodHi} />
      <rect x={x - 12} y={y + h + 12} width={w + 24} height={4} fill={C.wood5} />
    </g>
  )
}

function Sconce({ x }: { x: number }) {
  return (
    <g>
      {/* 光晕：三层嵴套方块 */}
      <rect x={x - 56} y={64} width={112} height={112} fill={C.glow} opacity=".05" />
      <rect x={x - 40} y={80} width={80} height={80} fill={C.glow} opacity=".07" />
      <rect x={x - 24} y={96} width={48} height={48} fill={C.glow} opacity=".09" />
      {/* 托臂 */}
      <rect x={x - 2} y={128} width={4} height={20} fill={C.wood1} />
      <rect x={x - 6} y={144} width={12} height={4} fill={C.wood1} />
      {/* 灯罩 */}
      <Block x={x - 10} y={100} w={20} h={28} fill={C.gold} />
      <rect x={x - 6} y={104} width={12} height={20} fill={C.goldHi} />
      <rect x={x - 6} y={104} width={12} height={20} fill={C.flameHi} opacity=".55" />
      {/* 火苗 */}
      <rect x={x - 2} y={108} width={4} height={12} fill={C.flame} />
      <rect x={x - 2} y={108} width={4} height={4} fill={C.flameHi} />
      <rect x={x - 14} y={96} width={28} height={4} fill={C.wood1} />
    </g>
  )
}

/** 墙上的天平徽章：木牌 + 像素天平 */
function Crest() {
  const x = 548
  const y = 36
  return (
    <g>
      <Block x={x} y={y} w={104} h={104} fill={C.wood3} />
      <rect x={x} y={y} width={104} height={4} fill={C.wood1} />
      <rect x={x} y={y} width={4} height={104} fill={C.wood1} />
      <rect x={x + 8} y={y + 8} width={88} height={88} fill={C.wood4} />
      <rect x={x + 8} y={y + 8} width={88} height={4} fill={C.wood5} />
      <rect x={x + 8} y={y + 8} width={4} height={88} fill={C.wood5} />
      <PixelGlyph icon={Balance} x={x + 12} y={y + 12} cell={5} />
      {/* 四角铆钉 */}
      {[[x + 4, y + 4], [x + 92, y + 4], [x + 4, y + 92], [x + 92, y + 92]].map(([nx, ny], i) => (
        <rect key={i} x={nx} y={ny} width={8} height={8} fill={C.goldHi} />
      ))}
    </g>
  )
}

function Signboard() {
  return (
    <g>
      <Block x={448} y={148} w={304} h={48} fill={C.wood3} />
      <rect x={448} y={148} width={304} height={4} fill={C.wood1} />
      <rect x={452} y={152} width={296} height={40} fill={C.wood4} />
      <rect x={456} y={156} width={288} height={32} fill={C.wood5} />
      <text x="600" y="176" textAnchor="middle" fill={C.goldHi} fontSize="20" letterSpacing="8" style={PIXEL_FONT}>遗 产 听 证 庭</text>
      <text x="600" y="190" textAnchor="middle" fill={C.gold} fontSize="9" letterSpacing="3" opacity=".9" style={PIXEL_FONT}>HEIR ARENA · INHERITANCE HEARING</text>
    </g>
  )
}

function WallClock({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <Block x={x} y={y} w={36} h={36} fill={C.wood1} />
      <rect x={x + 4} y={y + 4} width={28} height={28} fill={C.paper} />
      <rect x={x + 16} y={y + 6} width={4} height={4} fill={C.ink} />
      <rect x={x + 16} y={y + 26} width={4} height={4} fill={C.ink} />
      <rect x={x + 6} y={y + 16} width={4} height={4} fill={C.ink} />
      <rect x={x + 26} y={y + 16} width={4} height={4} fill={C.ink} />
      {/* 时针 / 分针：永远停在开庭那一刻 */}
      <rect x={x + 16} y={y + 10} width={4} height={8} fill={C.ink} />
      <rect x={x + 16} y={y + 16} width={10} height={4} fill={C.seal} />
      <rect x={x + 16} y={y + 16} width={4} height={4} fill={C.ink} />
    </g>
  )
}

function Certificate({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <Block x={x} y={y} w={44} h={52} fill={C.wood1} />
      <rect x={x + 4} y={y + 4} width={36} height={44} fill={C.paper} />
      <rect x={x + 8} y={y + 10} width={28} height={2} fill={C.paperLo} />
      <rect x={x + 8} y={y + 16} width={28} height={2} fill={C.paperLo} />
      <rect x={x + 8} y={y + 22} width={20} height={2} fill={C.paperLo} />
      <rect x={x + 8} y={y + 28} width={24} height={2} fill={C.paperLo} />
      <rect x={x + 26} y={y + 34} width={10} height={10} fill={C.seal} />
      <rect x={x + 28} y={y + 36} width={6} height={6} fill={C.flame} />
    </g>
  )
}

/** 护墙板上沿的横梁 + 竖木护墙板 + 踢脚线 */
function Paneling() {
  const planks = Array.from({ length: Math.ceil(W / 48) }, (_, i) => i * 48)
  return (
    <g>
      <rect x="0" y="192" width={W} height="4" fill={C.woodHi} />
      <rect x="0" y="196" width={W} height="4" fill={C.wood1} />
      <rect x="0" y="200" width={W} height="4" fill={C.wood5} />
      <rect x="0" y="204" width={W} height="96" fill={C.wood3} />
      {planks.map((x) => (
        <g key={x}>
          <rect x={x} y="204" width="4" height="96" fill={C.wood5} />
          <rect x={x + 4} y="204" width="4" height="96" fill={C.wood2} opacity=".7" />
          <rect x={x + 12} y="216" width="28" height="68" fill={C.wood4} />
          <rect x={x + 12} y="216" width="28" height="4" fill={C.wood5} />
          <rect x={x + 12} y="216" width="4" height="68" fill={C.wood5} />
          <rect x={x + 36} y="220" width="4" height="64" fill={C.wood2} opacity=".6" />
        </g>
      ))}
      <rect x="0" y="288" width={W} height="4" fill={C.wood1} />
      <rect x="0" y="292" width={W} height="8" fill={C.wood5} />
    </g>
  )
}

/* ─── 地面 ─────────────────────────────────────────────────── */

const FLOOR_TOP = 300
const ROW_H = 24
const PLANK_LENGTHS = [168, 120, 144, 96, 192]
const FLOOR_ROWS = Array.from({ length: Math.ceil((H - FLOOR_TOP) / ROW_H) }, (_, i) => {
  const y = FLOOR_TOP + i * ROW_H
  const joints: number[] = []
  let x = -((i * 56) % 168)
  let k = i
  while (x < W) {
    x += PLANK_LENGTHS[k % PLANK_LENGTHS.length]
    k++
    if (x > 0 && x < W) joints.push(snap(x))
  }
  return { y, joints, tone: i % 2 ? C.floorB : C.floorA }
})

function Floor() {
  return (
    <g>
      <rect x="0" y={FLOOR_TOP} width={W} height={H - FLOOR_TOP} fill={C.floorA} />
      {FLOOR_ROWS.map((row) => (
        <g key={row.y}>
          <rect x="0" y={row.y} width={W} height={ROW_H} fill={row.tone} />
          <rect x="0" y={row.y} width={W} height="4" fill={C.floorHi} opacity=".55" />
          <rect x="0" y={row.y + ROW_H - 4} width={W} height="4" fill={C.floorSeam} />
          {row.joints.map((jx) => (
            <g key={jx}>
              <rect x={jx} y={row.y} width="4" height={ROW_H} fill={C.floorSeam} />
              <rect x={jx + 4} y={row.y + 4} width="4" height={ROW_H - 8} fill={C.floorHi} opacity=".35" />
            </g>
          ))}
        </g>
      ))}
    </g>
  )
}

/** 窗口洒到地板上的月光：台阶状光带 */
function Moonlight({ cx }: { cx: number }) {
  const rows = Array.from({ length: 7 }, (_, i) => {
    const w = 120 + i * 16
    return { x: cx - w / 2, y: FLOOR_TOP + i * 16, w, h: 16 }
  })
  return <Rows rows={rows} fill="#ffe6b0" opacity={0.045} />
}

/** 法官席下的三级台阶 */
function Dais() {
  return (
    <g>
      <rect x="376" y="296" width="448" height="4" fill={C.out} />
      <rect x="380" y="300" width="440" height="16" fill={C.wood2} />
      <rect x="380" y="300" width="440" height="4" fill={C.wood1} />
      <rect x="368" y="316" width="464" height="16" fill={C.wood3} />
      <rect x="368" y="316" width="464" height="4" fill={C.wood2} />
      <rect x="356" y="332" width="488" height="16" fill={C.wood4} />
      <rect x="356" y="332" width="488" height="4" fill={C.wood3} />
      <rect x="352" y="348" width="496" height="4" fill={C.out} />
    </g>
  )
}

/** 红地毯：从台阶脚下一路铺到画面底部，宽度逐行阶梯放大 */
const CARPET_ROWS = Array.from({ length: (H - 352) / 16 }, (_, i) => {
  const y = 352 + i * 16
  const w = snap8(96 + (i / ((H - 352) / 16 - 1)) * 224)
  return { y, x: 600 - w / 2, w }
})

function Carpet() {
  return (
    <g>
      {CARPET_ROWS.map((r) => (
        <g key={r.y}>
          <rect x={r.x - 4} y={r.y} width={r.w + 8} height="16" fill={C.carpetLo} />
          <rect x={r.x} y={r.y} width={r.w} height="16" fill={C.carpet} />
          <rect x={r.x + 4} y={r.y} width="4" height="16" fill={C.gold} />
          <rect x={r.x + r.w - 8} y={r.y} width="4" height="16" fill={C.gold} />
          <rect x={r.x + 16} y={r.y + 4} width={r.w - 32} height="8" fill={C.carpetHi} opacity={r.y % 32 === 0 ? 1 : 0} />
        </g>
      ))}
    </g>
  )
}

/* ─── 道具 ─────────────────────────────────────────────────── */

/** 灵堂画架：黑白遗像 + 黑纱 + 白菊，名牌可写逝者称呼 */
function Easel({ x, decedentName }: { x: number; decedentName?: string }) {
  const ribbon = Array.from({ length: 8 }, (_, i) => ({ x: x - 42 + i * 4, y: 262 - i * 4 }))
  return (
    <g>
      {/* 架腿 */}
      <rect x={x - 30} y={296} width={4} height={80} fill={C.wood4} />
      <rect x={x + 26} y={296} width={4} height={80} fill={C.wood4} />
      <rect x={x - 2} y={328} width={4} height={48} fill={C.wood4} />
      <rect x={x - 30} y={344} width={60} height={4} fill={C.wood3} />
      {/* 相框 */}
      <Block x={x - 34} y={236} w={68} h={88} fill={C.wood1} />
      <rect x={x - 34} y={236} width={68} height={4} fill={C.woodHi} />
      <rect x={x - 26} y={244} width={52} height={72} fill={C.slate} />
      {/* 剪影 */}
      <rect x={x - 8} y={254} width={16} height={16} fill={C.silver} />
      <rect x={x - 4} y={270} width={8} height={6} fill={C.silver} />
      <rect x={x - 12} y={276} width={24} height={4} fill={C.silver} />
      <rect x={x - 18} y={280} width={36} height={36} fill={C.silver} />
      <rect x={x - 8} y={258} width={4} height={4} fill={C.silverHi} />
      {/* 黑纱：台阶状斜带 */}
      {ribbon.map((r, i) => <rect key={i} x={r.x} y={r.y} width={10} height={10} fill={C.ribbon} />)}
      {/* 白菊 */}
      <g transform={`translate(${x + 20} 300)`}>
        <rect x="4" y="0" width="8" height="4" fill={C.star} />
        <rect x="0" y="4" width="16" height="8" fill={C.star} />
        <rect x="4" y="12" width="8" height="4" fill={C.star} />
        <rect x="-4" y="6" width="4" height="4" fill={C.star} />
        <rect x="16" y="6" width="4" height="4" fill={C.star} />
        <rect x="6" y="6" width="4" height="4" fill={C.goldHi} />
        <rect x="6" y="16" width="4" height="8" fill={C.leaf1} />
      </g>
      {/* 名牌 */}
      {decedentName && (
        <g>
          <Block x={x - 30} y={328} w={60} h={16} fill={C.wood5} out={C.wood1} />
          <text x={x} y={340} textAnchor="middle" fontSize="10" fill={C.goldHi} letterSpacing="1" style={PIXEL_FONT}>
            {decedentName.length > 5 ? decedentName.slice(0, 5) : decedentName}
          </text>
        </g>
      )}
    </g>
  )
}

/** 星露谷风盆栽：陶盆 + 三层叶团 */
function Plant({ x }: { x: number }) {
  return (
    <g>
      {/* 叶团 */}
      <rect x={x - 12} y={296} width={24} height={8} fill={C.leaf1} />
      <rect x={x - 20} y={304} width={40} height={12} fill={C.leaf2} />
      <rect x={x - 24} y={316} width={48} height={16} fill={C.leaf1} />
      <rect x={x - 20} y={332} width={40} height={12} fill={C.leaf3} />
      <rect x={x - 12} y={308} width={8} height={4} fill={C.leafHi} />
      <rect x={x + 4} y={320} width={8} height={4} fill={C.leafHi} />
      <rect x={x - 16} y={324} width={4} height={4} fill={C.leafHi} />
      <rect x={x - 2} y={344} width={4} height={4} fill={C.wood4} />
      {/* 陶盆 */}
      <Block x={x - 18} y={348} w={36} h={8} fill={C.clay} />
      <rect x={x - 18} y={348} width={36} height={4} fill={C.clayHi} />
      <Block x={x - 14} y={356} w={28} h={16} fill={C.clayLo} />
      <rect x={x - 10} y={360} width={4} height={8} fill={C.clay} />
      <rect x={x - 12} y={372} width={24} height={4} fill={C.out} />
      <rect x={x - 14} y={376} width={28} height={4} fill={C.out} opacity=".35" />
    </g>
  )
}

/** 背景层：墙纸、窗、壁灯、徽章、护墙板、木地板、台阶、红毯、灵堂、盆栽。
 *  几百个 rect 完全静态，舞台每秒一次的时钟 tick 不应让它重新协调，所以 memo。 */
export const RoomBackground = memo(function RoomBackground({ decedentName }: { decedentName?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none" shapeRendering="crispEdges">
      <Wallpaper />
      <Sconce x={300} />
      <Sconce x={900} />
      <Window x={88} moon />
      <Window x={992} moon={false} />
      <WallClock x={468} y={72} />
      <Certificate x={712} y={64} />
      <Crest />
      <Signboard />
      <Paneling />
      <Floor />
      <Moonlight cx={148} />
      <Moonlight cx={1052} />
      <Dais />
      <Carpet />
      <Easel x={268} decedentName={decedentName} />
      <Plant x={68} />
      <Plant x={1132} />
    </svg>
  )
})

/* ─── 前景家具 ─────────────────────────────────────────────── */

function Bench() {
  const planks = Array.from({ length: 9 }, (_, i) => 430 + i * 40)
  return (
    <g>
      <Block x={410} y={232} w={380} h={74} fill={C.wood2} />
      {/* 台面 */}
      <rect x={410} y={232} width={380} height={12} fill={C.wood1} />
      <rect x={410} y={232} width={380} height={4} fill={C.woodHi} />
      <rect x={410} y={244} width={380} height={4} fill={C.wood5} />
      {/* 前板 */}
      <rect x={426} y={256} width={348} height={40} fill={C.wood3} />
      <rect x={426} y={256} width={348} height={4} fill={C.wood5} />
      {planks.map((x) => <rect key={x} x={x} y={260} width={4} height={36} fill={C.wood4} />)}
      {/* 名牌 */}
      <Block x={540} y={262} w={120} h={24} fill={C.gold} out={C.goldLo} />
      <rect x={540} y={262} width={120} height={4} fill={C.goldHi} />
      <text x="600" y="280" textAnchor="middle" fontSize="13" fill={C.wood5} letterSpacing="2" style={PIXEL_FONT}>遗嘱执行官</text>
      {/* 案卷 */}
      <rect x={456} y={224} width={32} height={8} fill="#8e2a22" />
      <rect x={460} y={216} width={28} height={8} fill="#23694b" />
      <rect x={454} y={208} width={32} height={8} fill="#4c3b8a" />
      <rect x={454} y={208} width={32} height={2} fill="#ffffff" opacity=".25" />
      {/* 法槌 */}
      <PixelGlyph icon={Gavel} x={708} y={200} cell={2} />
    </g>
  )
}

function Spot() {
  return (
    <g>
      <Rows rows={ellipseRows(600, 452, 120, 36, 8)} fill={C.goldHi} opacity={0.08} />
      <Rows rows={ellipseRows(600, 452, 88, 26, 8)} fill={C.goldHi} opacity={0.08} />
      <Rows rows={ellipseRows(600, 452, 56, 16, 8)} fill={C.goldHi} opacity={0.08} />
    </g>
  )
}

function Lectern() {
  return (
    <g>
      {/* 麦克风 */}
      <rect x={598} y={384} width={4} height={16} fill={C.silver} />
      <rect x={594} y={378} width={12} height={8} fill={C.silverHi} />
      <rect x={596} y={376} width={8} height={4} fill={C.silverHi} />
      <rect x={596} y={380} width={4} height={4} fill="#ffffff" opacity=".5" />
      {/* 台体 */}
      <Block x={566} y={408} w={68} h={48} fill={C.wood2} />
      <Block x={560} y={400} w={80} h={8} fill={C.wood1} />
      <rect x={560} y={400} width={80} height={4} fill={C.woodHi} />
      <rect x={574} y={418} width={52} height={30} fill={C.wood3} />
      <rect x={574} y={418} width={52} height={4} fill={C.wood5} />
      <rect x={574} y={418} width={4} height={30} fill={C.wood5} />
      <rect x={586} y={428} width={28} height={12} fill={C.gold} />
      <rect x={586} y={428} width={28} height={4} fill={C.goldHi} />
      <rect x={558} y={452} width={84} height={8} fill={C.wood4} />
      <rect x={554} y={460} width={92} height={4} fill={C.out} />
    </g>
  )
}

function Desk({ p }: { p: Pt }) {
  const x = snap(p.x)
  const y = snap(p.y)
  return (
    <g>
      <Block x={x - 52} y={y - 34} w={104} h={28} fill={C.wood3} />
      <rect x={x - 52} y={y - 34} width={104} height={8} fill={C.wood1} />
      <rect x={x - 52} y={y - 34} width={104} height={4} fill={C.woodHi} />
      <rect x={x - 44} y={y - 22} width={88} height={12} fill={C.wood4} />
      {/* 桌上的卷宗 */}
      <rect x={x - 20} y={y - 24} width={40} height={8} fill={C.paper} />
      <rect x={x - 16} y={y - 22} width={24} height={2} fill={C.paperLo} />
      <rect x={x - 16} y={y - 19} width={16} height={2} fill={C.paperLo} />
      <rect x={x + 24} y={y - 26} width={12} height={10} fill={C.gold} />
      <rect x={x + 24} y={y - 26} width={12} height={4} fill={C.goldHi} />
    </g>
  )
}

/** 前景层：会遮住人物腿部的家具（法官席台面、发言台、家属席桌子）。 */
export const RoomForeground = memo(function RoomForeground({ seats, speakerActive }: { seats: Pt[]; speakerActive: boolean }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" shapeRendering="crispEdges">
      <Bench />
      {speakerActive && <Spot />}
      <Lectern />
      {seats.map((p, i) => <Desk key={i} p={p} />)}
    </svg>
  )
})
