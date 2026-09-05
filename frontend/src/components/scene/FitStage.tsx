import { useEffect, useRef, useState, type ReactNode } from 'react'
import { H, W } from './layout'

/**
 * 把 1200×700 的舞台塞进任意大小的容器：以高度和宽度中更紧的一边为准等比缩放，
 * 让法庭页在桌面端不需要滚动就能完整看到舞台。
 */
export default function FitStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width: cw, height: ch } = e.contentRect
      setWidth(Math.floor(Math.min(cw, (ch * W) / H)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} className="flex min-h-0 flex-1 items-center justify-center">
      <div style={{ width: width || '100%' }}>{children}</div>
    </div>
  )
}
