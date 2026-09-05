import type { PxlKitData } from '@pxlkit/core'

/** 法槌：HeirArena 的核心符号，Pxlkit 图标包里没有，按同规格（16×16）手绘 */
export const Gavel: PxlKitData = {
  name: 'gavel',
  size: 16,
  category: 'heirarena',
  grid: [
    '................',
    '....HHHHHHHH....',
    '...HLLLLLLLLH...',
    '...HLGGLLGGLH...',
    '...HLLLLLLLLH...',
    '....HHHHHHHH....',
    '.......DD.......',
    '.......DD.......',
    '.......DD.......',
    '.......DD.......',
    '.......DD.......',
    '.......DD.......',
    '......GDDG......',
    '.....SSSSSS.....',
    '....SSSSSSSS....',
    '................',
  ],
  palette: {
    H: '#5c3a21',
    L: '#b8794a',
    G: '#e9be6f',
    D: '#8a5a34',
    S: '#3a2414',
  },
  tags: ['gavel', 'court', 'verdict'],
}

/** 天平：法定份额 / 法条依据 */
export const Balance: PxlKitData = {
  name: 'balance',
  size: 16,
  category: 'heirarena',
  grid: [
    '.......GG.......',
    '.......GG.......',
    '..GGGGGGGGGGGG..',
    '.G.....GG.....G.',
    '.G.....GG.....G.',
    'G.G....GG....G.G',
    'G.G....GG....G.G',
    '.GGG...GG...GGG.',
    'GGGGG..GG..GGGGG',
    '.......GG.......',
    '.......GG.......',
    '.......GG.......',
    '......GGGG......',
    '.....DDDDDD.....',
    '....DDDDDDDD....',
    '................',
  ],
  palette: {
    G: '#e9be6f',
    D: '#8a5a34',
  },
  tags: ['balance', 'scale', 'law'],
}
