import { useLocation } from 'react-router'

/** Shows the path the router is at, for tests to read with `where()` (see `renderPublic.tsx`). */
export function Where() {
  const { pathname } = useLocation()
  return <p data-testid="where">{pathname}</p>
}
