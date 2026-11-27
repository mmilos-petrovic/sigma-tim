import { Link } from 'react-router'
import { homePath } from '../../auth/roles'
import { PlusIcon } from '../../components/icons'
import { useMyEnrolmentRequests } from '../../enrolment/queries'
import type { StudentContext } from '../studentApi'

/**
 * The way to the requests for lessons, in the header of a student and of a parent. The number is that of the requests with an
 * offer to accept.
 */
export function RequestsLink({ context }: { context: StudentContext }) {
  const requests = useMyEnrolmentRequests()
  const offers = (requests.data ?? []).filter(
    (request) => request.status === 'open' && request.offersCount > 0,
  ).length
  return (
    <Link
      className="button button--secondary button--icon shell__requests"
      to={`${homePath(context)}/prijava`}
      aria-label={offers > 0 ? `Prijava za časove (ponude: ${offers})` : 'Prijava za časove'}
      title="Prijava za časove"
    >
      <PlusIcon />
      {offers > 0 && (
        <span className="shell__badge" aria-hidden="true">
          {offers}
        </span>
      )}
    </Link>
  )
}
