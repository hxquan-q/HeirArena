// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import VoxelErrorBoundary from './VoxelErrorBoundary'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('renders a 2D fallback when the voxel scene throws', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const BrokenScene = () => {
    throw new Error('WebGL unavailable')
  }

  render(
    <VoxelErrorBoundary fallback={<span>2D 奖杯</span>}>
      <BrokenScene />
    </VoxelErrorBoundary>,
  )

  expect(screen.getByText('2D 奖杯')).toBeTruthy()
})
