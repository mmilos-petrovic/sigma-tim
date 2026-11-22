import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './admin/admin.css'
import './teacher/teacher.css'
import './student/student.css'
import './cv/cv.css'
import './pages/landing.css'
import App from './App.tsx'
import { startMonitoring } from './monitoring'
import { registerServiceWorker } from './notifications/registerServiceWorker'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerServiceWorker()
void startMonitoring()
