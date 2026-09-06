import { PxlKitSurfaceProvider, PxlKitToastProvider } from '@pxlkit/ui-kit'
import { MotionConfig, motion } from 'motion/react'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'

const LobbyPage = lazy(() => import('./pages/LobbyPage'))
const SetupPage = lazy(() => import('./pages/SetupPage'))
const ImportPage = lazy(() => import('./pages/ImportPage'))
const CourtroomPage = lazy(() => import('./pages/CourtroomPage'))

/* 8 档步进：像素游戏切场景的幕布，不是丝滑渐变 */
const stepped = (t: number) => Math.min(1, Math.floor(t * 8) / 8)

/** 每次路由变化，一块深色幕布从上方揭开，露出新场景。 */
function ScreenWipe() {
  const { pathname } = useLocation()
  return (
    <motion.div
      key={pathname}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[9990] origin-top bg-ink-950"
      initial={{ scaleY: 1 }}
      animate={{ scaleY: 0 }}
      transition={{ duration: 0.36, ease: stepped }}
    />
  )
}

function RouteFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-950" aria-label="场景载入中">
      <div className="panel-elevated flex items-center gap-3 px-5 py-4">
        <span className="h-2 w-2 animate-blink-step bg-gold-400" aria-hidden />
        <span className="pixel-text text-[13px] tracking-[0.12em] text-gold-300">LOADING SCENE · 场景载入中</span>
      </div>
    </main>
  )
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <PxlKitSurfaceProvider surface="pixel">
        <PxlKitToastProvider position="bottom-right" max={4}>
          <BrowserRouter>
            <ScreenWipe />
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<LobbyPage />} />
                <Route path="/setup" element={<SetupPage />} />
                <Route path="/import" element={<ImportPage />} />
                <Route path="/court/:id" element={<CourtroomPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </PxlKitToastProvider>
      </PxlKitSurfaceProvider>
    </MotionConfig>
  )
}
