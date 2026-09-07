import { PxlKitIcon, type PxlKitData } from '@pxlkit/core'
import { lazy, Suspense } from 'react'
import VoxelErrorBoundary from './VoxelErrorBoundary'

const VoxelStage = lazy(() => import('./VoxelStage'))

export interface SafeVoxelStageProps {
  icon: PxlKitData
  size?: number
  spin?: number
  glow?: string
  bob?: number
  snap?: number
  pixelate?: boolean
  loadingLabel?: string
  fallbackLabel?: string
}

export default function SafeVoxelStage({
  icon,
  size = 220,
  spin = 0.5,
  glow,
  bob = 0.06,
  snap,
  pixelate,
  loadingLabel = 'LOADING…',
  fallbackLabel = `${icon.name} 2D 图标`,
}: SafeVoxelStageProps) {
  const placeholder = (
    <span
      className="pixel-text flex shrink-0 items-center justify-center text-[11px] text-current"
      style={{ width: size, height: size }}
      aria-label="3D 图腾载入中"
    >
      {loadingLabel}
    </span>
  )
  const fallback = (
    <span
      className="flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-label={fallbackLabel}
    >
      <PxlKitIcon icon={icon} size={Math.max(24, Math.round(size * 0.55))} appearance="palette" />
    </span>
  )

  return (
    <VoxelErrorBoundary fallback={fallback}>
      <Suspense fallback={placeholder}>
        <VoxelStage icon={icon} size={size} spin={spin} glow={glow} bob={bob} snap={snap} pixelate={pixelate} />
      </Suspense>
    </VoxelErrorBoundary>
  )
}
