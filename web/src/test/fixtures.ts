import type { MyRoles } from '../auth/roles'

export function makeRoles(overrides: Partial<MyRoles> = {}): MyRoles {
  return {
    profileId: 'profile-1',
    email: 'person@example.test',
    firstName: 'Test',
    lastName: 'Osoba',
    avatarUrl: null,
    isAdmin: false,
    isTeacher: false,
    isStudent: false,
    isParent: false,
    ...overrides,
  }
}

/** The five test accounts of the "done when" criterion, plus an approved profile with no role in force. */
export const personas = {
  admin: makeRoles({
    profileId: 'p-admin',
    email: 'admin@example.test',
    firstName: 'Ada',
    isAdmin: true,
  }),
  adminTeacher: makeRoles({
    profileId: 'p-boss',
    email: 'boss@example.test',
    firstName: 'Boris',
    isAdmin: true,
    isTeacher: true,
  }),
  teacher: makeRoles({
    profileId: 'p-teacher',
    email: 'teacher@example.test',
    firstName: 'Tara',
    isTeacher: true,
  }),
  student: makeRoles({
    profileId: 'p-student',
    email: 'student@example.test',
    firstName: 'Sava',
    isStudent: true,
  }),
  parent: makeRoles({
    profileId: 'p-parent',
    email: 'parent@example.test',
    firstName: 'Petra',
    isParent: true,
  }),
  deactivatedTeacher: makeRoles({
    profileId: 'p-gone',
    email: 'gone@example.test',
    firstName: 'Goran',
  }),
}
