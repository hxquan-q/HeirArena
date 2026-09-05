import { PxlKitSurfaceProvider, PxlKitToastProvider } from '@pxlkit/ui-kit'
import { MotionConfig } from 'motion/react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import CourtroomPage from './pages/CourtroomPage'
import SetupPage from './pages/SetupPage'

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <PxlKitSurfaceProvider surface="linear">
        <PxlKitToastProvider position="bottom-right" max={4}>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<SetupPage />} />
              <Route path="/court/:id" element={<CourtroomPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </PxlKitToastProvider>
      </PxlKitSurfaceProvider>
    </MotionConfig>
  )
}
