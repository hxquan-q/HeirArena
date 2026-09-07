import { useFrame } from '@react-three/fiber'
import { Instance, Instances } from '@react-three/drei'
import { useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef } from 'react'
import type { PxlKitData } from '@pxlkit/core'
import type { Group } from 'three'
import { iconToVoxelData } from './voxelData'

interface VoxelIconProps {
  /** 任意 PxlKit 像素图标 —— 每个非透明像素渲染为一颗立体体素 */
  icon: PxlKitData
  /** 整组绕 Y 轴自转速度（弧度/秒），0 关闭自转 */
  spin?: number
  /** 整体轻微上下悬浮，0 关闭 */
  bob?: number
  /** 模型最大边的世界单位长度（画布可见高度约 3.6） */
  size?: number
  /**
   * 自转量化到多少个朝向：像素游戏里的角色转身只有 8 / 16 帧，
   * 这里默认 16 帧，体素会「咔、咔」地转而不是丝滑旋转；0 = 连续旋转。
   */
  snap?: number
}

/** 体素网格间距：略大于体素边长，留出细缝以显出方块感 */
const STEP = 0.22
/** 单颗体素边长：正方形横截面，Z 向更深，做出「浮雕徽章」的厚度 */
const FACE = 0.2
const DEPTH = 0.34
/** 悬浮高度也按格量化，避免亚像素漂移 */
const BOB_QUANT = 0.03

/**
 * 把 PxlKit 像素图标的每个像素抬升成 3D 体素（Voxel），
 * 用 R3F + drei <Instances> 单次绘制调用批量渲染，按像素原色着色。
 * 材质用 flatShading，避免体素表面出现平滑高光——保持色块分明的像素感。
 */
export default function VoxelIcon({ icon, spin = 0.5, bob = 0.06, size = 220, snap = 16 }: VoxelIconProps) {
  const group = useRef<Group>(null)
  const angle = useRef(0)
  const reducedMotion = useReducedMotion()
  const voxels = useMemo(() => iconToVoxelData(icon), [icon])
  const extent = useMemo(() => {
    if (!voxels.length) return { w: 1, h: 1 }
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const voxel of voxels) {
      if (voxel.x < minX) minX = voxel.x
      if (voxel.x > maxX) maxX = voxel.x
      if (voxel.y < minY) minY = voxel.y
      if (voxel.y > maxY) maxY = voxel.y
    }
    return { w: maxX - minX + 1, h: maxY - minY + 1 }
  }, [voxels])

  useEffect(() => {
    if (!reducedMotion || !group.current) return
    group.current.rotation.y = 0
    group.current.position.y = 0
  }, [reducedMotion])

  useFrame((state, delta) => {
    const g = group.current
    if (!g || reducedMotion) return
    if (spin) {
      angle.current = (angle.current + delta * spin) % (Math.PI * 2)
      const quantum = snap > 0 ? (Math.PI * 2) / snap : 0
      g.rotation.y = quantum ? Math.round(angle.current / quantum) * quantum : angle.current
    }
    if (bob) {
      const raw = Math.sin(state.clock.elapsedTime * 1.6) * bob
      g.position.y = Math.round(raw / BOB_QUANT) * BOB_QUANT
    }
  })

  return (
    <group ref={group} scale={size / (Math.max(extent.w, extent.h) * STEP)}>
      <Instances limit={Math.max(voxels.length, 1)} range={voxels.length}>
        <boxGeometry args={[FACE, FACE, DEPTH]} />
        <meshStandardMaterial roughness={0.62} metalness={0.12} flatShading />
        {voxels.map((voxel, index) => (
          <Instance
            key={`${voxel.x}:${voxel.y}:${index}`}
            position={[voxel.x * STEP, voxel.y * STEP, 0]}
            color={voxel.color}
          />
        ))}
      </Instances>
    </group>
  )
}
