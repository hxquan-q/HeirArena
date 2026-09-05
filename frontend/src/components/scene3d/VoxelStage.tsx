import { Canvas } from '@react-three/fiber'
import { ContactShadows, Float } from '@react-three/drei'
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
}

/**
 * 3D 体素展示台：Canvas + 三点布光 + drei Float 悬浮，
 * 把任意 PxlKit 像素图标立体化。配合 CSS 径向渐变做金晕背景。
 */
export default function VoxelStage({ icon, size = 220, spin = 0.5, glow = 'rgba(214,162,78,.24)', bob = 0.06 }: VoxelStageProps) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full blur-2xl"
        style={{ background: `radial-gradient(circle, ${glow}, transparent 68%)` }}
      />
      <Canvas
        aria-hidden
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, 0.3, 5.2], fov: 38 }}
        style={{ width: size, height: size }}
      >
        <ambientLight intensity={0.45} />
        {/* 主光：右上暖白，塑造体素受光面 */}
        <directionalLight position={[3, 4, 5]} intensity={1.6} />
        {/* 补光：左后暗金，勾出金属侧缘 */}
        <directionalLight position={[-4, 2, -3]} intensity={0.5} color="#e9be6f" />
        {/* 轮廓光：正后方冷紫，把体素从暗背景里剥离出来 */}
        <spotLight position={[0, 1.5, -6]} angle={0.7} penumbra={1} intensity={0.9} color="#b39bff" />
        <pointLight position={[0, -3, 2]} intensity={0.3} color="#a78bfa" />
        <Suspense fallback={null}>
          <Float speed={1.6} rotationIntensity={0} floatIntensity={0.35} floatingRange={[-0.08, 0.08]}>
            <VoxelIcon icon={icon} spin={spin} bob={bob} size={2.6} />
          </Float>
          <ContactShadows position={[0, -1.55, 0]} scale={7} blur={2.6} far={4} opacity={0.4} color="#000000" />
        </Suspense>
      </Canvas>
    </div>
  )
}
