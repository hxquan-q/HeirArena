// 从字符网格生成像素鼠标指针 SVG：X = 描边，O = 填充，. = 透明。每格 2px。
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = resolve(import.meta.dirname, '../public')
const CELL = 2
const PALETTE = { X: '#1e130b', O: '#f6ecd3', G: '#e2b25a' }

const ARROW = [
  'X...........',
  'XX..........',
  'XOX.........',
  'XOOX........',
  'XOOOX.......',
  'XOOOOX......',
  'XOOOOOX.....',
  'XOOOOOOX....',
  'XOOOOOOOX...',
  'XOOOOXXXXX..',
  'XOOXOX......',
  'XOX.XOX.....',
  'XX..XOX.....',
  '.....XOX....',
  '.....XX.....',
]

const HAND = [
  '....XX......',
  '...XOOX.....',
  '...XOOX.....',
  '...XOOXXX...',
  '...XOOXOOXX.',
  '.XXXOOXOOXOX',
  'XOOXOOOOOOOX',
  'XOOOOOOOOOOX',
  '.XOOOOOOOOX.',
  '.XOOOOOOOOX.',
  '..XOOOOOOX..',
  '..XOOOOOOX..',
  '...XGGGGX...',
  '...XXXXXX...',
]

function toSvg(grid) {
  const h = grid.length
  const w = Math.max(...grid.map((r) => r.length))
  const rects = []
  grid.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const ch = row[x]
      if (!PALETTE[ch]) { x++; continue }
      let end = x
      while (end + 1 < row.length && row[end + 1] === ch) end++
      rects.push(`<rect x="${x * CELL}" y="${y * CELL}" width="${(end - x + 1) * CELL}" height="${CELL}" fill="${PALETTE[ch]}"/>`)
      x = end + 1
    }
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * CELL}" height="${h * CELL}" viewBox="0 0 ${w * CELL} ${h * CELL}" shape-rendering="crispEdges">${rects.join('')}</svg>\n`
}

writeFileSync(resolve(OUT, 'cursor-arrow.svg'), toSvg(ARROW))
writeFileSync(resolve(OUT, 'cursor-hand.svg'), toSvg(HAND))
console.log('cursors written to', OUT)
