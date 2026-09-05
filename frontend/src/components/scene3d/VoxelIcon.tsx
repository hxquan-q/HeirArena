import { useFrame } from '@react-three/fiber'
import { Instance, Instances } from '@react-three/drei'
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
  /** 模型最大边的世界单位长度（画布可见高度约 3.6） */
  size?: number
}

/** 体素网格间距：略大于体素边长，留出细缝以显出方块感 */
const STEP = 0.22
/** 单颗体素边长：正方形横截面，Z 向更深，做出「浮雕徽章」的厚度 */
const FACE = 0.2
const DEPTH = 0.34
/** 边缘像素透明度阈值：低于此值的抗锯齿像素直接丢弃，换取干净的方块轮廓 */
const ALPHA_CUTOFF = 0.35

/**
 * 把 PxlKit 像素图标的每个像素抬升成 3D 体素（Voxel），
 * 用 R3F + drei <Instances> 单次绘制调用批量渲染，按像素原色着色。
 */
export default function VoxelIcon({ icon, spin = 0.5, bob = 0.06, size = 220 }: VoxelIconProps) {
  const group = useRef<Group>(null)
  const pixels = useMemo(
    () => gridToPixels(icon).filter((p) => (p.opacity ?? 1) >= ALPHA_CUTOFF),
    [icon],
  )
  const extent = useMemo(() => {
    if (!pixels.length) return { w: 1, h: 1 }
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
    return { w: maxX - minX + 1, h: maxY - minY + 1 }
  }, [pixels])

  useFrame((state, delta) => {
    const g = group.current
    if (!g) return
    if (spin) g.rotation.y += delta * spin
    if (bob) g.position.y = Math.sin(state.clock.elapsedTime * 1.6) * bob
  })

  return (
    <group ref={group} scale={size / (Math.max(extent.w, extent.h) * STEP)}>
      <Instances limit={Math.max(pixels.length, 1)} range={pixels.length}>
        <boxGeometry args={[FACE, FACE, DEPTH]} />
        <meshStandardMaterial roughness={0.34} metalness={0.42} envMapIntensity={0.9} />
        {pixels.map((p, i) => {
          // 图标坐标系：x 向右、y 向下 → 转为以中心为原点的 3D 坐标
          const x = (p.x + 0.5 - icon.size / 2) * STEP
          const y = (icon.size / 2 - p.y - 0.5) * STEP
          return <Instance key={i} position={[x, y, 0]} color={p.color} />
        })}
      </Instances>
    </group>
  )
}
