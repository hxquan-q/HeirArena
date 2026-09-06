import { gridToPixels, type PxlKitData } from '@pxlkit/core'

export interface VoxelDatum {
  x: number
  y: number
  color: string
}

export function iconToVoxelData(icon: PxlKitData, alphaCutoff = 0.35): VoxelDatum[] {
  return gridToPixels(icon)
    .filter((pixel) => (pixel.opacity ?? 1) >= alphaCutoff)
    .map((pixel) => ({
      x: pixel.x + 0.5 - icon.size / 2,
      y: icon.size / 2 - pixel.y - 0.5,
      color: pixel.color.toLowerCase(),
    }))
}
