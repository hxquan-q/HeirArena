import { useFrame } from '@react-three/fiber'
import { gridToPixels } from '@pxlkit/core'
import { useMemo, useRef } from 'react'
import type { PxlKitData } from '@pxlkit/core'
import type { Group } from 'three'

interface VoxelIconProps {
  /** 任意 PxlKit 像素图标 —— 每个非透明像素渲染为一颗立体体素 */
  icon: PxlKitData
  /** 整组绕 Y 轴自转速度（弧度/秒），0 关闭自转 */
  spin?: number
  /** 整体轻微上下悬浮，0 关闭 */
  bob?: number
  /** 显示尺寸（约等于画布上的最大边长，px） */
  size?: number
}

/**
 * 把 PxlKit 像素图标的每个像素抬升成 3D 体素（Voxel），
 * 用 R3F + InstancedMesh 渲染，按像素原色着色。
 */
export default function VoxelIcon({ icon, spin = 0.5, bob = 0.06, size = 220 }: VoxelIconProps) {
  const group = useRef<Group>(null)
  const pixels = useMemo(() => gridToPixels(icon), [icon])
  const extent = useMemo(() => {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const p of pixels) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    if (!pixels.length) return { w: 1, h: 1 }
    return { w: maxX - minX + 1, h: maxY - minY + 1 }
  }, [pixels])

  useFrame((state, delta) => {
    const g = group.current
    if (!g) return
    if (spin) g.rotation.y += delta * spin
    if (bob) g.position.y = Math.sin(state.clock.elapsedTime * 1.6) * bob
  })

  return (
    <group ref={group} scale={size / Math.max(extent.w, extent.h)}>
      {pixels.map((p, i) => {
        // 图标坐标系：x 向右、y 向下 → 转为以中心为原点的 3D 坐标
        const x = (p.x + 0.5 - icon.size / 2) * 0.22
        const y = (icon.size / 2 - p.y - 0.5) * 0.22
        return (
          <mesh key={i} position={[x, y, 0]}>
            <boxGeometry args={[0.2, 0.2, 0.2]} />
            <meshStandardMaterial
              color={p.color}
              transparent={p.opacity !== undefined && p.opacity < 1}
              opacity={p.opacity ?? 1}
              roughness={0.42}
              metalness={0.28}
            />
          </mesh>
        )
      })}
    </group>
  )
}
