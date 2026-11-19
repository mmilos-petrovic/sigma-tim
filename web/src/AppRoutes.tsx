import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import {
  CHOOSER_PATH,
  CONTEXTS,
  ENROLMENT_PATH,
  homePath,
  LOGIN_PATH,
  NOT_MEMBER_PATH,
} from './auth/roles'
import { RequireMember } from './components/guards'
import { NotFoundContent } from './components/NotFound'
import { PublicCvPage } from './cv/PublicCvPage'
import { LoadingScreen } from './components/Status'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { NotMemberPage } from './pages/NotMemberPage'

// The screens of signed-in people (the three roles with the calendar, the sign-up page) are loaded when somebody opens one:
// a visitor of the front page or of a CV page gets only what those pages need.
const ChooserPage = lazy(() =>
  import('./pages/ChooserPage').then((m) => ({ default: m.ChooserPage })),
)
const ContextPage = lazy(() =>
  import('./pages/ContextPage').then((m) => ({ default: m.ContextPage })),
)
const EnrolmentPage = lazy(() =>
  import('./enrolment/EnrolmentPage').then((m) => ({ default: m.EnrolmentPage })),
)

export function AppRoutes() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path={LOGIN_PATH} element={<LoginPage />} />
        <Route path={NOT_MEMBER_PATH} element={<NotMemberPage />} />
        <Route path={ENROLMENT_PATH} element={<EnrolmentPage />} />
        <Route path="/nastavnici" element={<Navigate to="/" replace />} />
        <Route path="/nastavnici/:slug" element={<PublicCvPage />} />

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
    </Suspense>
  )
}
