import { homePath } from '../auth/roles'

const BASE = homePath('admin')

export interface NavItem {
  to: string
  label: string
  /** Only the exact path counts as "current" (for the overview). */
  end?: boolean
}

export const ADMIN_NAV: NavItem[] = [
  { to: BASE, label: 'Pregled', end: true },
  { to: `${BASE}/nastavnici`, label: 'Nastavnici' },
  { to: `${BASE}/predmeti`, label: 'Predmeti' },
  { to: `${BASE}/lokacije`, label: 'Lokacije' },
  { to: `${BASE}/zahtevi`, label: 'Zahtevi za preuzimanje' },
]
