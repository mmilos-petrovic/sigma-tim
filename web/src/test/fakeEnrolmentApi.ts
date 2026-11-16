import { vi } from 'vitest'
import type {
  ApplicantRole,
  EnrolmentApi,
  EnrolmentFormInfo,
  EnrolmentProfileInput,
  MyEnrolmentRequest,
} from '../enrolment/enrolmentApi'

export interface FakeEnrolmentApi extends EnrolmentApi {
  state: { form: EnrolmentFormInfo; requests: MyEnrolmentRequest[] }
  getFormInfo: ReturnType<typeof vi.fn<() => Promise<EnrolmentFormInfo>>>
  startEnrolment: ReturnType<
    typeof vi.fn<(subjectId: string, role: ApplicantRole) => Promise<string>>
  >
  myRequests: ReturnType<typeof vi.fn<() => Promise<MyEnrolmentRequest[]>>>
  completeProfile: ReturnType<
    typeof vi.fn<(requestId: string, input: EnrolmentProfileInput) => Promise<void>>
  >
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
    ...overrides,
  }
}

/** An in-memory stand-in for the sign-up: the form of the front page and the requests of the signed-in person. */
export function createFakeEnrolmentApi(
  initial: { form?: EnrolmentFormInfo; requests?: MyEnrolmentRequest[] } = {},
): FakeEnrolmentApi {
  const state = { form: initial.form ?? FIXTURE_FORM, requests: initial.requests ?? [] }
  return {
    state,
    getFormInfo: vi.fn(async () => state.form),
    startEnrolment: vi.fn(async (subjectId: string, role: ApplicantRole) => {
      const existing = state.requests.find((request) => request.role === role)
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
    completeProfile: vi.fn(async (requestId: string, input: EnrolmentProfileInput) => {
      state.requests = state.requests.map((request) =>
        request.id === requestId
          ? {
              ...request,
              profileCompleted: true,
              studentFirstName: input.firstName,
              studentLastName: input.lastName,
              contactPhone: input.phone,
              school: input.school,
              grade: input.grade,
              cityPart: input.cityPart || null,
              situation: input.situation || null,
            }
          : request,
      )
    }),
  }
}
