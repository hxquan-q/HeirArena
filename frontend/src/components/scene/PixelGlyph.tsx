import type { PxlKitData } from '@pxlkit/core'

interface Props {
  icon: PxlKitData
  x: number
  y: number
  /** 每个像素在 SVG 坐标里的边长 */
  cell: number
  opacity?: number
}

/**
 * 把 PxlKit 像素图标铺进任意 SVG 场景：同一行相邻同色像素合并成一个 rect，
 * 数量少、边缘硬，适合当作舞台里的道具（法槌、天平……）。
 */
export default function PixelGlyph({ icon, x, y, cell, opacity }: Props) {
  const rects: { key: string; x: number; y: number; w: number; fill: string }[] = []
  icon.grid.forEach((row, ry) => {
    let cx = 0
    while (cx < row.length) {
      const ch = row[cx]
      const fill = icon.palette[ch]
      if (ch === '.' || !fill) { cx++; continue }
      let end = cx
      while (end + 1 < row.length && row[end + 1] === ch) end++
      rects.push({ key: `${ry}:${cx}`, x: x + cx * cell, y: y + ry * cell, w: (end - cx + 1) * cell, fill })
      cx = end + 1
    }
  })
  return (
    <g opacity={opacity} shapeRendering="crispEdges">
      {rects.map((r) => <rect key={r.key} x={r.x} y={r.y} width={r.w} height={cell} fill={r.fill} />)}
    </g>
  )
}
