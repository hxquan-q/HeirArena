import type { PxlKitData } from '@pxlkit/core'
import { describe, expect, it } from 'vitest'
import { iconToVoxelData } from './voxelData'

const icon: PxlKitData = {
  name: 'voxel-test',
  size: 8,
  category: 'test',
  grid: [
    'A.......',
    '.B......',
    '........',
    '........',
    '........',
    '........',
    '........',
    '.......C',
  ],
  palette: {
    A: '#ff0000',
    B: '#00ff0040',
    C: '#0000ff',
  },
  tags: ['test'],
}

describe('iconToVoxelData', () => {
  it('filters transparent edge pixels and centers opaque voxels', () => {
    expect(iconToVoxelData(icon)).toEqual([
      { x: -3.5, y: 3.5, color: '#ff0000' },
      { x: 3.5, y: -3.5, color: '#0000ff' },
    ])
  })

  it('allows callers to lower the alpha cutoff', () => {
    expect(iconToVoxelData(icon, 0.2)).toContainEqual({ x: -2.5, y: 2.5, color: '#00ff00' })
  })
})
