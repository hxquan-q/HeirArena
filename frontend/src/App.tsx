import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import CourtroomPage from './pages/CourtroomPage'
import SetupPage from './pages/SetupPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SetupPage />} />
        <Route path="/court/:id" element={<CourtroomPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
