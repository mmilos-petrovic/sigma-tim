import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './admin/admin.css'
import './teacher/teacher.css'
import './student/student.css'
import './cv/cv.css'
import './pages/landing.css'
import App from './App.tsx'
import { reloadForNewVersion } from './lib/staleVersion'
import { startMonitoring } from './monitoring'
import { registerServiceWorker } from './notifications/registerServiceWorker'

// Vite says so when a file of a screen loaded on demand is gone: the page is older than the latest version
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewVersion()) event.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerServiceWorker()
void startMonitoring()
