import { BrowserRouter } from 'react-router'
import { AppRoutes } from './AppRoutes'
import { AuthProvider } from './auth/AuthProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ConfigErrorScreen } from './components/Status'
import { createAppAuthApi } from './lib/supabase'

const authApi = createAppAuthApi()

export default function App() {
  return (
    <ErrorBoundary>
      {authApi ? (
        <AuthProvider api={authApi}>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      ) : (
        <ConfigErrorScreen />
      )}
    </ErrorBoundary>
  )
}
