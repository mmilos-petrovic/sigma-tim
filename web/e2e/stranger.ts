import type { APIRequestContext } from '@playwright/test'
import { rpc, sql, tokenFor } from './api.ts'

/** A Google account the school has no profile for (see web/src/dev/personas.ts). */
export const STRANGER = 'stranac@example.test'
export const TEACHER = 'ana.nikolic@example.test'

/** Puts the stranger back to what the other specs expect: an account the school has no profile for. */
export const forgetStranger = () =>
  sql(`
    -- the notices of the sign-up, also the ones the teacher got: the database tests count them
    delete from public.notifications where kind like 'enrolment_%';
    delete from public.enrolment_requests where applicant_id in (select id from public.profiles where email = '${STRANGER}');
    delete from public.students where profile_id in (select id from public.profiles where email = '${STRANGER}');
    delete from public.profiles where email = '${STRANGER}';
  `)

/** Notices of a kind that were queued for somebody, by email. */
export const noticesFor = (email: string): string[] =>
  sql(`
    select n.kind from public.notifications n join public.profiles p on p.id = n.recipient_id
     where p.email = '${email}' and n.kind like 'enrolment_%' order by n.id;
  `)
    .split('\n')
    .filter(Boolean)

/** The administrator sets the sign-up form (the database starts with it off). The numbers are the usual ones unless given. */
export async function setEnrolmentSettings(
  request: APIRequestContext,
  settings: { enabled: boolean },
) {
  await rpc(request, await tokenFor(request, 'admin@example.test'), 'set_enrolment_settings', {
    p_form_enabled: settings.enabled,
    p_daily_cap: 10,
  })
}

/** The teacher writes the text of the CV: without it no offer can be made. */
export async function giveTeacherACv(request: APIRequestContext) {
  await rpc(request, await tokenFor(request, TEACHER), 'save_my_cv', {
    p_about: 'E2E opis nastavnika.',
    p_show_public: false,
    p_show_members: false,
    p_experience: [],
    p_education: [],
    p_skills: [],
  })
}

export async function clearTeacherCv(request: APIRequestContext) {
  await rpc(request, await tokenFor(request, TEACHER), 'save_my_cv', {
    p_about: '',
    p_show_public: false,
    p_show_members: false,
    p_experience: [],
    p_education: [],
    p_skills: [],
  })
}

/** The stranger signs up for mathematics and finishes the profile, straight through the API (the screens are tested elsewhere). */
export async function signUp(request: APIRequestContext, first: string) {
  const token = await tokenFor(request, STRANGER)
  const subjects = await rpc<{ subjects: { id: string; name: string }[] }>(
    request,
    token,
    'enrolment_form_info',
    {},
  )
  const math = subjects.subjects.find((s) => s.name === 'Matematika')!.id
  const id = await rpc<string>(request, token, 'start_enrolment', {
    p_subject_id: math,
    p_role: 'student',
  })
  await rpc(request, token, 'complete_enrolment_profile', {
    p_request_id: id,
    p_first_name: first,
    p_last_name: 'Prijavljen',
    p_phone: '+381645551234',
    p_school: 'E2E gimnazija',
    p_grade: '2',
    p_city_part: null,
    p_situation: 'Treba mi pomoć iz matematike',
    p_consent: true,
  })
  return id
}
