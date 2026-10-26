import { readLastContext } from './lastContext'
import { contextsOf, resolveDestination, type MyRoles } from './roles'

/** Where this account should be sent now, taking the remembered context into account. */
export function destinationFor(roles: MyRoles | null, returnTo: string | null): string {
  return resolveDestination({
    contexts: contextsOf(roles),
    lastContext: roles ? readLastContext(roles.profileId) : null,
    returnTo,
  })
}
