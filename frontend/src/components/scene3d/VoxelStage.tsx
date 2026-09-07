import { Canvas } from '@react-three/fiber'
import { ContactShadows, Float } from '@react-three/drei'
import { useReducedMotion } from 'motion/react'
import { Suspense } from 'react'
import type { PxlKitData } from '@pxlkit/core'
import VoxelIcon from './VoxelIcon'

interface VoxelStageProps {
  icon: PxlKitData
  /** 显示尺寸（px），画布为正方形 */
  size?: number
  /** 绕 Y 轴自转速度，0 静止 */
  spin?: number
  /** 背景光晕色，默认暗金 */
  glow?: string
  /** 传给 VoxelIcon 的悬浮幅度 */
  bob?: number
  /** 自转量化帧数（见 VoxelIcon.snap） */
  snap?: number
  /**
   * 低分辨率渲染再放大：画布只按 ~0.45 倍像素密度绘制，
   * 交给 CSS `image-rendering: pixelated` 拉伸，3D 体素也带上马赛克颗粒。
   */
  pixelate?: boolean
}

/** 像素圆：按 4 格一行切片，宽度取整到 8 格，叠三层得到台阶状的柔光 */
const GLOW_GRID = 64
const GLOW_RINGS = [30, 22, 14].map((r) => {
  const rows: { x: number; y: number; w: number }[] = []
  for (let y = -r; y < r; y += 4) {
    const t = (y + 2) / r
    const w = Math.round((2 * r * Math.sqrt(Math.max(0, 1 - t * t))) / 8) * 8
    if (w > 0) rows.push({ x: GLOW_GRID / 2 - w / 2, y: GLOW_GRID / 2 + y, w })
  }
  return rows
})

/**
 * 3D 体素展示台：Canvas + 三点布光 + drei Float 悬浮，
 * 把任意 PxlKit 像素图标立体化。背景光晕是三层台阶状的像素圆，而不是模糊圆。
 */
export default function VoxelStage({ icon, size = 220, spin = 0.5, glow = 'rgba(214,162,78,.24)', bob = 0.06, snap = 16, pixelate = true }: VoxelStageProps) {
  const reducedMotion = useReducedMotion()
  const dpr = pixelate ? Math.max(0.35, Math.min(0.6, 96 / size)) : [1, 2] as [number, number]

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${GLOW_GRID} ${GLOW_GRID}`} shapeRendering="crispEdges">
        {GLOW_RINGS.map((rows, i) => (
          <g key={i} fill={glow} opacity={0.5 + i * 0.25}>
            {rows.map((r) => <rect key={r.y} x={r.x} y={r.y + 4} width={r.w} height={4} />)}
          </g>
        ))}
      </svg>
      <Canvas
        aria-hidden
        dpr={dpr}
        gl={{ alpha: true, antialias: !pixelate }}
        camera={{ position: [0, 0.3, 5.2], fov: 38 }}
        style={{ width: size, height: size, imageRendering: 'pixelated' }}
      >
        <ambientLight intensity={0.55} />
        {/* 主光：右上暖白，塑造体素受光面 */}
        <directionalLight position={[3, 4, 5]} intensity={1.7} />
        {/* 补光：左后暗金，勾出侧缘 */}
        <directionalLight position={[-4, 2, -3]} intensity={0.55} color="#e9be6f" />
        {/* 轮廓光：正后方冷紫，把体素从暗背景里剥离出来 */}
        <spotLight position={[0, 1.5, -6]} angle={0.7} penumbra={1} intensity={0.9} color="#b39bff" />
        <pointLight position={[0, -3, 2]} intensity={0.3} color="#a78bfa" />
        <Suspense fallback={null}>
          <Float speed={reducedMotion ? 0 : 1.6} rotationIntensity={0} floatIntensity={reducedMotion ? 0 : 0.35} floatingRange={[-0.08, 0.08]}>
            <VoxelIcon icon={icon} spin={reducedMotion ? 0 : spin} bob={reducedMotion ? 0 : bob} size={2.6} snap={snap} />
          </Float>
          <ContactShadows position={[0, -1.55, 0]} scale={7} blur={pixelate ? 0.8 : 2.6} far={4} opacity={0.45} color="#000000" />
        </Suspense>
      </Canvas>
    </div>
  )
}
