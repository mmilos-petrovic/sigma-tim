import { useAuth } from '../../auth/AuthProvider'
import { Loaded } from '../../components/Loaded'
import { useMyEnrolmentRequests } from '../../enrolment/queries'
import { RequestsView } from '../../enrolment/RequestsView'
import type { StudentContext } from '../studentApi'

/**
 * The sign-ups of a student who waits for a teacher (one a teacher left behind, or added to the pool) and of a parent: the
 * profile, the offers and the choice, the same as on the page of somebody who is not a member yet.
 */
export function RequestsPanel({ context }: { context: StudentContext }) {
  const { state } = useAuth()
  const roles = state.status === 'ready' ? state.roles : null
  const requests = useMyEnrolmentRequests()
  return (
    <Loaded query={requests}>
      {(rows) => (
        <>
          {rows.length === 0 && (
            <p className="empty">
              {context === 'parent'
                ? 'Nemate otvorenih prijava za časove.'
                : 'Nema otvorenih prijava za časove.'}
            </p>
          )}
          <RequestsView
            requests={rows}
            defaults={{ firstName: roles?.firstName ?? '', lastName: roles?.lastName ?? '' }}
            canStartAnother={context === 'parent'}
          />
        </>
      )}
    </Loaded>
  )
}
