// @vitest-environment jsdom

import type { PxlKitData } from '@pxlkit/core'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import SafeVoxelStage from './SafeVoxelStage'

vi.mock('./VoxelStage', () => ({
  default: function BrokenVoxelStage() {
    throw new Error('WebGL unavailable')
  },
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const icon: PxlKitData = {
  name: 'fallback-test',
  size: 8,
  category: 'test',
  grid: ['........', '..AAAA..', '..A..A..', '..AAAA..', '..A..A..', '..A..A..', '........', '........'],
  palette: { A: '#e2b25a' },
  tags: ['test'],
}

it('falls back to the same PxlKit icon when the 3D renderer fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  render(<SafeVoxelStage icon={icon} size={80} fallbackLabel="测试图标" />)

  expect(await screen.findByLabelText('测试图标')).toBeTruthy()
})
