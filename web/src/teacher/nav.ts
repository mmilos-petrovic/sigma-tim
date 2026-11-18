import { useMemo } from 'react'
import type { NavItem } from '../admin/nav'
import { homePath } from '../auth/roles'
import { usePool } from '../enrolment/queries'

const BASE = homePath('teacher')
export const POOL_PATH = `${BASE}/neraspodeljeni`

export const TEACHER_NAV: NavItem[] = [
  { to: BASE, label: 'Raspored', end: true },
  { to: `${BASE}/ucenici`, label: 'Učenici' },
  { to: POOL_PATH, label: 'Neraspoređeni učenici' },
  { to: `${BASE}/casovi`, label: 'Časovi' },
  { to: `${BASE}/moj-cv`, label: 'Moj CV' },
  { to: `${BASE}/podesavanja`, label: 'Podešavanja' },
]

/** The menu of a teacher, with the number of students who look for a teacher of their subjects next to the link to them. */
export function useTeacherNav(enabled: boolean): NavItem[] {
  const waiting = usePool(enabled).data?.length ?? 0
  return useMemo(
    () =>
      waiting === 0
        ? TEACHER_NAV
        : TEACHER_NAV.map((item) =>
            item.to === POOL_PATH ? { ...item, label: `${item.label} (${waiting})` } : item,
          ),
    [waiting],
  )
}
