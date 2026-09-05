import { PxlKitSurfaceProvider, PxlKitToastProvider } from '@pxlkit/ui-kit'
import { MotionConfig, motion } from 'motion/react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import CourtroomPage from './pages/CourtroomPage'
import ImportPage from './pages/ImportPage'
import LobbyPage from './pages/LobbyPage'
import SetupPage from './pages/SetupPage'

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

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <PxlKitSurfaceProvider surface="pixel">
        <PxlKitToastProvider position="bottom-right" max={4}>
          <BrowserRouter>
            <ScreenWipe />
            <Routes>
              <Route path="/" element={<LobbyPage />} />
              <Route path="/setup" element={<SetupPage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/court/:id" element={<CourtroomPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </PxlKitToastProvider>
      </PxlKitSurfaceProvider>
    </MotionConfig>
  )
}
