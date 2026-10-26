import { Route, Routes } from 'react-router'
import { CHOOSER_PATH, CONTEXTS, homePath, LOGIN_PATH, NOT_MEMBER_PATH } from './auth/roles'
import { RequireMember } from './components/guards'
import { NotFoundContent } from './components/NotFound'
import { ChooserPage } from './pages/ChooserPage'
import { ContextPage } from './pages/ContextPage'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { NotMemberPage } from './pages/NotMemberPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path={LOGIN_PATH} element={<LoginPage />} />
      <Route path={NOT_MEMBER_PATH} element={<NotMemberPage />} />

      <Route element={<RequireMember />}>
        <Route path={CHOOSER_PATH} element={<ChooserPage />} />
        {CONTEXTS.map((context) => (
          <Route
            key={context}
            path={`${homePath(context)}/*`}
            element={<ContextPage context={context} />}
          />
        ))}
      </Route>

      <Route
        path="*"
        element={
          <main className="screen">
            <div className="screen__card">
              <NotFoundContent homeTo="/" homeLabel="Na početnu" />
            </div>
          </main>
        }
      />
    </Routes>
  )
}
