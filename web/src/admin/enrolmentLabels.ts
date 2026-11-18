import type { AdminState } from '../enrolment/enrolmentApi'

/** Where a request is, in the words of the administrator's list. */
export const STATE_LABEL: Record<AdminState, string> = {
  needs_approval: 'Čeka odobrenje',
  incomplete: 'Profil nije popunjen',
  open: 'Čeka ponude',
  choice_open: 'Izbor je otvoren',
  chosen: 'Čeka email deteta',
  assigned: 'Nastavnik je dodeljen',
  rejected: 'Odbijeno',
}
