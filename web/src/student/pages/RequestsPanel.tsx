import { useAuth } from '../../auth/AuthProvider'
import { Loaded } from '../../components/Loaded'
import { useMyEnrolmentRequests } from '../../enrolment/queries'
import { RequestsView } from '../../enrolment/RequestsView'
import { useMyProfile } from '../queries'
import type { StudentContext } from '../studentApi'
import { useStudentView } from '../view'

/**
 * The sign-ups of a student who waits for a teacher (one a teacher left behind, or added to the pool) and of a parent: the
 * profile, the offers and the choice, the same as on the page of somebody who is not a member yet.
 */
export function RequestsPanel({ context }: { context: StudentContext }) {
  const { state } = useAuth()
  const roles = state.status === 'ready' ? state.roles : null
  const requests = useMyEnrolmentRequests()
  // a parent may ask for another subject for a child who is a student already
  const profile = useMyProfile(useStudentView().profileId)
  const childOptions = (profile.data?.people ?? [])
    .filter((person) => !person.self)
    .map((person) => ({ id: person.profileId, name: `${person.firstName} ${person.lastName}` }))
  return (
    <Loaded query={requests}>
      {(all) => {
        // a request that is over (a teacher was placed) is not a request any more: its lessons are in the list
        const rows = all.filter((request) => request.status !== 'assigned')
        return (
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
              canStartAnother
              startAs={context}
              childOptions={childOptions}
            />
          </>
        )
      }}
    </Loaded>
  )
}
