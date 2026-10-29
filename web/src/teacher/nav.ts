import type { NavItem } from '../admin/nav'
import { homePath } from '../auth/roles'

const BASE = homePath('teacher')

export const TEACHER_NAV: NavItem[] = [
  { to: BASE, label: 'Raspored', end: true },
  { to: `${BASE}/ucenici`, label: 'Učenici' },
]
