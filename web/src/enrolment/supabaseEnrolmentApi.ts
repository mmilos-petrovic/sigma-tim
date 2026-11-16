import type { SupabaseClient } from '@supabase/supabase-js'
import { run } from '../admin/supabaseAdminApi'
import type { Database } from '../lib/database.types'
import type {
  EnrolmentApi,
  EnrolmentFormInfo,
  MyEnrolmentRequest,
  RequestStatus,
} from './enrolmentApi'

/** `enrolment_form_info()` answers with one JSON object; a broken answer closes the form rather than showing a half form. */
export function mapFormInfo(value: unknown): EnrolmentFormInfo {
  if (value === null || typeof value !== 'object') return { enabled: false, subjects: [] }
  const json = value as Record<string, unknown>
  const subjects = Array.isArray(json.subjects) ? (json.subjects as unknown[]) : []
  return {
    enabled: json.enabled === true,
    subjects: subjects.flatMap((item) => {
      const subject = (item ?? {}) as Record<string, unknown>
      return typeof subject.id === 'string' && typeof subject.name === 'string'
        ? [{ id: subject.id, name: subject.name }]
        : []
    }),
  }
}

type RequestRow = Database['public']['Functions']['my_enrolment_requests']['Returns'][number]

export function mapRequest(row: RequestRow): MyEnrolmentRequest {
  return {
    id: row.id,
    role: row.applicant_role,
    status: row.status as RequestStatus,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    profileCompleted: row.profile_completed,
    waitingForApproval: row.waiting_for_approval,
    studentFirstName: row.student_first_name ?? null,
    studentLastName: row.student_last_name ?? null,
    contactPhone: row.contact_phone ?? null,
    school: row.school ?? null,
    grade: row.grade ?? null,
    cityPart: row.city_part ?? null,
    situation: row.situation ?? null,
  }
}

export function createSupabaseEnrolmentApi(client: SupabaseClient<Database>): EnrolmentApi {
  return {
    async getFormInfo() {
      const { data } = await run(client.rpc('enrolment_form_info'))
      return mapFormInfo(data)
    },

    async startEnrolment(subjectId, role) {
      const { data } = await run(
        client.rpc('start_enrolment', { p_subject_id: subjectId, p_role: role }),
      )
      return data as string
    },

    async myRequests() {
      const { data } = await run(client.rpc('my_enrolment_requests'))
      return (data ?? []).map(mapRequest)
    },

    async completeProfile(requestId, input) {
      await run(
        client.rpc('complete_enrolment_profile', {
          p_request_id: requestId,
          p_first_name: input.firstName,
          p_last_name: input.lastName,
          p_phone: input.phone,
          p_school: input.school,
          p_grade: input.grade,
          p_city_part: input.cityPart,
          p_situation: input.situation,
          p_consent: input.consent,
        }),
      )
    },
  }
}
