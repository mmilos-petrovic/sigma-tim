import { vi, type Mock } from 'vitest'
import { AdminError } from '../admin/adminApi'
import type { CvData } from '../cv/cvApi'
import type {
  AdminEnrolmentRow,
  ApplicantRole,
  ChosenRow,
  EnrolmentApi,
  EnrolmentFormInfo,
  EnrolmentSettings,
  MyEnrolmentRequest,
  OfferRow,
  PoolRow,
} from '../enrolment/enrolmentApi'

export interface FakeEnrolmentState {
  form: EnrolmentFormInfo
  /** The requests of the signed-in person. */
  requests: MyEnrolmentRequest[]
  /** The teachers who offered, by request. */
  offers: Record<string, OfferRow[]>
  /** The CVs of the teachers who offered, by teacher (a teacher with none has no entry). */
  cvs: Record<string, CvData>
  /** What a teacher sees. */
  pool: PoolRow[]
  chosen: ChosenRow[]
  /** False: the calling teacher has no CV text yet, so an offer is refused. */
  teacherHasCv: boolean
  /** What the administrator sees. */
  settings: EnrolmentSettings
  all: AdminEnrolmentRow[]
}

export type FakeEnrolmentApi = { [K in keyof EnrolmentApi]: Mock<EnrolmentApi[K]> } & {
  state: FakeEnrolmentState
}

export const FIXTURE_FORM: EnrolmentFormInfo = {
  enabled: true,
  // most teachers first, the way the database sorts them
  subjects: [
    { id: 'sub-mat', name: 'Matematika' },
    { id: 'sub-fiz', name: 'Fizika' },
    { id: 'sub-hem', name: 'Hemija' },
  ],
}

export function makeRequest(overrides: Partial<MyEnrolmentRequest> = {}): MyEnrolmentRequest {
  return {
    id: 'req-1',
    role: 'student',
    source: 'signup',
    status: 'open',
    subjectId: 'sub-mat',
    subjectName: 'Matematika',
    profileCompleted: false,
    waitingForApproval: false,
    studentFirstName: null,
    studentLastName: null,
    contactPhone: null,
    school: null,
    grade: null,
    cityPart: null,
    situation: null,
    offersCount: 0,
    choiceOpen: false,
    chosenTeacherId: null,
    ...overrides,
  }
}

/** A request with a finished profile. */
export function makeCompleted(overrides: Partial<MyEnrolmentRequest> = {}): MyEnrolmentRequest {
  return makeRequest({
    profileCompleted: true,
    studentFirstName: 'Luka',
    studentLastName: 'Lukić',
    contactPhone: '+381641234567',
    school: 'Gimnazija',
    grade: '3. razred',
    ...overrides,
  })
}

export function makeOffer(overrides: Partial<OfferRow> = {}): OfferRow {
  return {
    teacherId: 't-ana',
    firstName: 'Ana',
    lastName: 'Anić',
    phone: '+381641111222',
    subjects: ['Matematika', 'Fizika'],
    cvSlug: 'ana-anic',
    photoPath: null,
    offeredAt: '2026-11-14T10:00:00Z',
    isChosen: false,
    ...overrides,
  }
}

export function makePoolRow(overrides: Partial<PoolRow> = {}): PoolRow {
  return {
    requestId: 'req-1',
    role: 'student',
    source: 'signup',
    subjectId: 'sub-mat',
    subjectName: 'Matematika',
    firstName: 'Luka',
    lastName: 'Lukić',
    email: 'luka@example.test',
    phone: '+381641234567',
    school: 'Gimnazija',
    grade: '3. razred',
    cityPart: null,
    situation: null,
    listedAt: '2026-11-13T10:00:00Z',
    daysWaiting: 2,
    offered: false,
    ...overrides,
  }
}

export function makeAdminRow(overrides: Partial<AdminEnrolmentRow> = {}): AdminEnrolmentRow {
  return {
    requestId: 'req-1',
    role: 'student',
    source: 'signup',
    state: 'open',
    subjectName: 'Matematika',
    firstName: 'Luka',
    lastName: 'Lukić',
    email: 'luka@example.test',
    phone: '+381641234567',
    school: 'Gimnazija',
    grade: '3. razred',
    cityPart: null,
    situation: null,
    createdAt: '2026-11-13T09:00:00Z',
    listedAt: '2026-11-13T10:00:00Z',
    daysWaiting: 2,
    restarts: 0,
    choiceOpenedAt: null,
    chosenTeacherId: null,
    offers: [],
    ...overrides,
  }
}

/**
 * An in-memory stand-in for the sign-up. It keeps the few rules the screens depend on (an offer needs a CV, only a parent's
 * choice waits for an email, the administrator's actions move a request on); the database tests prove the real ones.
 */
export function createFakeEnrolmentApi(
  initial: Partial<FakeEnrolmentState> = {},
): FakeEnrolmentApi {
  const state: FakeEnrolmentState = {
    form: FIXTURE_FORM,
    requests: [],
    offers: {},
    cvs: {},
    pool: [],
    chosen: [],
    teacherHasCv: true,
    settings: { formEnabled: true, dailyCap: 10, choiceAfterDays: 3, choiceAfterOffers: 3 },
    all: [],
    ...initial,
  }
  const patchRequest = (id: string, change: Partial<MyEnrolmentRequest>) => {
    state.requests = state.requests.map((r) => (r.id === id ? { ...r, ...change } : r))
  }
  const patchAll = (id: string, change: Partial<AdminEnrolmentRow>) => {
    state.all = state.all.map((r) => (r.requestId === id ? { ...r, ...change } : r))
  }

  return {
    state,
    getFormInfo: vi.fn(async () => state.form),
    startEnrolment: vi.fn(async (subjectId: string, role: ApplicantRole) => {
      // a student has one request; a parent one for each subject
      const existing = state.requests.find(
        (request) =>
          request.role === role && (role === 'student' || request.subjectId === subjectId),
      )
      if (existing) return existing.id
      const subject = state.form.subjects.find((s) => s.id === subjectId)
      const request = makeRequest({
        id: `req-${state.requests.length + 1}`,
        role,
        subjectId,
        subjectName: subject?.name ?? null,
      })
      state.requests = [...state.requests, request]
      return request.id
    }),
    myRequests: vi.fn(async () => state.requests),
    completeProfile: vi.fn(async (requestId, input) => {
      patchRequest(requestId, {
        profileCompleted: true,
        studentFirstName: input.firstName,
        studentLastName: input.lastName,
        contactPhone: input.phone,
        school: input.school,
        grade: input.grade,
        cityPart: input.cityPart || null,
        situation: input.situation || null,
      })
    }),

    myOffers: vi.fn(async (requestId) => state.offers[requestId] ?? []),
    getOfferedCv: vi.fn(async (_requestId, teacherId) => state.cvs[teacherId] ?? null),
    chooseTeacher: vi.fn(async (requestId, teacherId) => {
      const request = state.requests.find((r) => r.id === requestId)
      const waits = request?.role === 'parent'
      patchRequest(requestId, {
        status: waits ? 'chosen' : 'assigned',
        chosenTeacherId: teacherId,
      })
      return waits ? 'chosen' : 'assigned'
    }),
    setSubject: vi.fn(async (requestId, subjectId) => {
      const subject = state.form.subjects.find((s) => s.id === subjectId)
      patchRequest(requestId, { subjectId, subjectName: subject?.name ?? null })
    }),

    listPool: vi.fn(async () => state.pool),
    offer: vi.fn(async (requestId) => {
      if (!state.teacherHasCv) {
        throw new AdminError('PT409', 'write the about text of your CV first')
      }
      state.pool = state.pool.map((row) =>
        row.requestId === requestId ? { ...row, offered: true } : row,
      )
    }),
    withdrawOffer: vi.fn(async (requestId) => {
      state.pool = state.pool.map((row) =>
        row.requestId === requestId ? { ...row, offered: false } : row,
      )
    }),
    listChosen: vi.fn(async () => state.chosen),
    completeChosen: vi.fn(async (requestId) => {
      state.chosen = state.chosen.filter((row) => row.requestId !== requestId)
    }),
    addUnassignedStudent: vi.fn(async (input) => {
      const subject = state.form.subjects.find((s) => s.id === input.subjectId)
      const row = makePoolRow({
        requestId: `req-new-${state.pool.length + 1}`,
        source: 'teacher',
        subjectId: input.subjectId,
        subjectName: subject?.name ?? null,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        school: input.school,
        grade: input.grade,
        daysWaiting: 0,
      })
      state.pool = [row, ...state.pool]
      return row.requestId
    }),

    getSettings: vi.fn(async () => state.settings),
    saveSettings: vi.fn(async (settings) => {
      state.settings = settings
    }),
    listAll: vi.fn(async () => state.all),
    approve: vi.fn(async (requestId) => {
      patchAll(requestId, { state: 'open' })
    }),
    reject: vi.fn(async (requestId) => {
      patchAll(requestId, { state: 'rejected' })
    }),
    assign: vi.fn(async (requestId, teacherId, childEmail) => {
      const row = state.all.find((r) => r.requestId === requestId)
      const waits = row?.role === 'parent' && !childEmail
      patchAll(requestId, {
        state: waits ? 'chosen' : 'assigned',
        chosenTeacherId: teacherId,
      })
      return waits ? 'chosen' : 'assigned'
    }),
  }
}
