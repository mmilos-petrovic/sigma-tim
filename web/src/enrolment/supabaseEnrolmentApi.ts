import type { SupabaseClient } from '@supabase/supabase-js'
import { AdminError } from '../admin/adminApi'
import { run } from '../admin/supabaseAdminApi'
import { mapCv } from '../cv/supabaseCvApi'
import type { Database } from '../lib/database.types'
import type {
  AdminEnrolmentRow,
  AdminState,
  ApplicantRole,
  ChooseResult,
  ChosenRow,
  EnrolmentApi,
  EnrolmentFormInfo,
  EnrolmentSettings,
  MyEnrolmentRequest,
  OfferRow,
  PoolRow,
  RequestSource,
  RequestStatus,
} from './enrolmentApi'

type Functions = Database['public']['Functions']

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

export function mapRequest(
  row: Functions['my_enrolment_requests']['Returns'][number],
): MyEnrolmentRequest {
  return {
    id: row.id,
    role: row.applicant_role,
    source: row.source as RequestSource,
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
    schoolTeacher: row.school_teacher ?? null,
    situation: row.situation ?? null,
    offersCount: row.offers_count,
    choiceOpen: row.choice_open,
    chosenTeacherId: row.chosen_teacher_id ?? null,
  }
}

export function mapOffer(row: Functions['my_enrolment_offers']['Returns'][number]): OfferRow {
  return {
    teacherId: row.teacher_id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone ?? null,
    subjects: row.subjects ?? [],
    cvSlug: row.cv_slug ?? null,
    photoPath: row.photo_path ?? null,
    offeredAt: row.offered_at,
    isChosen: row.is_chosen,
  }
}

export function mapPool(row: Functions['list_enrolment_pool']['Returns'][number]): PoolRow {
  return {
    requestId: row.request_id,
    role: row.applicant_role,
    source: row.source as RequestSource,
    subjectId: row.subject_id ?? null,
    subjectName: row.subject_name ?? null,
    firstName: row.student_first_name,
    lastName: row.student_last_name,
    email: row.applicant_email,
    phone: row.phone,
    school: row.school,
    grade: row.grade,
    cityPart: row.city_part ?? null,
    schoolTeacher: row.school_teacher ?? null,
    situation: row.situation ?? null,
    listedAt: row.listed_at,
    daysWaiting: row.days_waiting,
    offered: row.offered,
  }
}

export function mapChosen(row: Functions['list_chosen_enrolments']['Returns'][number]): ChosenRow {
  return {
    requestId: row.request_id,
    subjectName: row.subject_name ?? null,
    firstName: row.student_first_name,
    lastName: row.student_last_name,
    email: row.applicant_email,
    phone: row.phone,
    school: row.school,
    grade: row.grade,
    chosenAt: row.chosen_at,
  }
}

/** `get_enrolment_settings()` answers with one JSON object; anything missing is a broken answer, not a default. */
export function mapSettings(value: unknown): EnrolmentSettings {
  const json = (value ?? {}) as Record<string, unknown>
  const number = (key: string) => {
    if (typeof json[key] !== 'number')
      throw new AdminError('unknown', `settings: ${key} is missing`)
    return json[key] as number
  }
  if (typeof json.form_enabled !== 'boolean') {
    throw new AdminError('unknown', 'settings: form_enabled is missing')
  }
  return {
    formEnabled: json.form_enabled,
    dailyCap: number('daily_cap'),
    choiceAfterDays: number('choice_after_days'),
    choiceAfterOffers: number('choice_after_offers'),
  }
}

export function mapAdminRow(
  row: Functions['admin_list_enrolments']['Returns'][number],
): AdminEnrolmentRow {
  const offers = Array.isArray(row.offers) ? (row.offers as unknown[]) : []
  return {
    requestId: row.request_id,
    role: row.applicant_role,
    source: row.source as RequestSource,
    state: row.state as AdminState,
    subjectName: row.subject_name ?? null,
    firstName: row.student_first_name ?? null,
    lastName: row.student_last_name ?? null,
    email: row.applicant_email,
    phone: row.phone ?? null,
    school: row.school ?? null,
    grade: row.grade ?? null,
    cityPart: row.city_part ?? null,
    schoolTeacher: row.school_teacher ?? null,
    situation: row.situation ?? null,
    createdAt: row.created_at,
    listedAt: row.listed_at ?? null,
    daysWaiting: row.days_waiting,
    restarts: row.restarts,
    choiceOpenedAt: row.choice_opened_at ?? null,
    chosenTeacherId: row.chosen_teacher_id ?? null,
    offers: offers.flatMap((item) => {
      const offer = (item ?? {}) as Record<string, unknown>
      return typeof offer.teacher_id === 'string' &&
        typeof offer.name === 'string' &&
        typeof offer.offered_at === 'string'
        ? [{ teacherId: offer.teacher_id, name: offer.name, offeredAt: offer.offered_at }]
        : []
    }),
  }
}

const placed = (value: unknown): ChooseResult => (value === 'chosen' ? 'chosen' : 'assigned')

export function createSupabaseEnrolmentApi(client: SupabaseClient<Database>): EnrolmentApi {
  return {
    async getFormInfo() {
      const { data } = await run(client.rpc('enrolment_form_info'))
      return mapFormInfo(data)
    },

    async startEnrolment(subjectId, role: ApplicantRole, childId) {
      const { data } = await run(
        client.rpc('start_enrolment', {
          p_subject_id: subjectId,
          p_role: role,
          p_child_id: childId,
        }),
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
          p_school_teacher: input.schoolTeacher,
        }),
      )
    },

    async myOffers(requestId) {
      const { data } = await run(client.rpc('my_enrolment_offers', { p_request_id: requestId }))
      return (data ?? []).map(mapOffer)
    },

    async getOfferedCv(requestId, teacherId) {
      const { data } = await run(
        client.rpc('get_offered_cv', { p_request_id: requestId, p_teacher_id: teacherId }),
      )
      return mapCv(data)
    },

    async chooseTeacher(requestId, teacherId) {
      const { data } = await run(
        client.rpc('choose_enrolment_teacher', {
          p_request_id: requestId,
          p_teacher_id: teacherId,
        }),
      )
      return placed(data)
    },

    async setSubject(requestId, subjectId) {
      await run(
        client.rpc('set_enrolment_subject', { p_request_id: requestId, p_subject_id: subjectId }),
      )
    },

    async listPool() {
      const { data } = await run(client.rpc('list_enrolment_pool'))
      return (data ?? []).map(mapPool)
    },

    async offer(requestId) {
      await run(client.rpc('offer_enrolment', { p_request_id: requestId }))
    },

    async withdrawOffer(requestId) {
      await run(client.rpc('withdraw_enrolment_offer', { p_request_id: requestId }))
    },

    async listChosen() {
      const { data } = await run(client.rpc('list_chosen_enrolments'))
      return (data ?? []).map(mapChosen)
    },

    async completeChosen(requestId, childEmail) {
      await run(
        client.rpc('complete_chosen_enrolment', {
          p_request_id: requestId,
          p_child_email: childEmail,
        }),
      )
    },

    async addUnassignedStudent(input) {
      const { data } = await run(
        client.rpc('add_unassigned_student', {
          p_email: input.email,
          p_first_name: input.firstName,
          p_last_name: input.lastName,
          p_phone: input.phone,
          p_subject_id: input.subjectId,
          p_school: input.school,
          p_grade: input.grade,
          p_city_part: input.cityPart || undefined,
          p_situation: input.situation || undefined,
        }),
      )
      return data as string
    },

    async getSettings() {
      const { data } = await run(client.rpc('get_enrolment_settings'))
      return mapSettings(data)
    },

    async saveSettings(settings) {
      await run(
        client.rpc('set_enrolment_settings', {
          p_form_enabled: settings.formEnabled,
          p_daily_cap: settings.dailyCap,
          p_choice_after_days: settings.choiceAfterDays,
          p_choice_after_offers: settings.choiceAfterOffers,
        }),
      )
    },

    async listAll() {
      const { data } = await run(client.rpc('admin_list_enrolments', {}))
      return (data ?? []).map(mapAdminRow)
    },

    async approve(requestId) {
      await run(client.rpc('approve_enrolment', { p_request_id: requestId }))
    },

    async reject(requestId) {
      await run(client.rpc('reject_enrolment', { p_request_id: requestId }))
    },

    async assign(requestId, teacherId, childEmail) {
      const { data } = await run(
        client.rpc('admin_assign_enrolment', {
          p_request_id: requestId,
          p_teacher_id: teacherId,
          p_child_email: childEmail ?? undefined,
        }),
      )
      return placed(data)
    },
  }
}
