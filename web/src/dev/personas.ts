// Local test accounts for the five roles of the "done when" criterion, plus a Google account the school has not approved.
// They exist only in the local database (supabase/seed.sql + scripts/dev-setup.mjs, which imports this file),
// and the development sign-in panel that lists them is not part of the production build.
export const devPersonas = [
  { label: 'Admin', email: 'admin@example.test' },
  { label: 'Admin i nastavnik', email: 'admin.nastavnik@example.test' },
  { label: 'Nastavnik', email: 'ana.nikolic@example.test' },
  { label: 'Učenik', email: 'ucenik1@example.test' },
  { label: 'Roditelj', email: 'roditelj1@example.test' },
  { label: 'Stranac (bez profila)', email: 'stranac@example.test' },
] as const
