import { describe, expect, it } from 'vitest'
import { mapFormInfo, mapRequest } from './supabaseEnrolmentApi'

describe('mapFormInfo', () => {
  it('reads the switch and the subjects in the order the database gave them', () => {
    expect(
      mapFormInfo({
        enabled: true,
        subjects: [
          { id: 'a', name: 'Matematika' },
          { id: 'b', name: 'Fizika' },
        ],
      }),
    ).toEqual({
      enabled: true,
      subjects: [
        { id: 'a', name: 'Matematika' },
        { id: 'b', name: 'Fizika' },
      ],
    })
  })

  it('treats anything but a plain true as off, so a broken answer never opens the form', () => {
    for (const enabled of [false, null, 'true', 1, undefined]) {
      expect(mapFormInfo({ enabled, subjects: [{ id: 'a', name: 'Matematika' }] }).enabled).toBe(
        false,
      )
    }
  })

  it('drops a subject that is not one, and copes with a missing or broken answer', () => {
    expect(
      mapFormInfo({
        enabled: true,
        subjects: [
          { id: 'a' },
          null,
          { name: 'x' },
          { id: 1, name: 'y' },
          { id: 'b', name: 'Fizika' },
        ],
      }).subjects,
    ).toEqual([{ id: 'b', name: 'Fizika' }])
    expect(mapFormInfo({ enabled: true })).toEqual({ enabled: true, subjects: [] })
    expect(mapFormInfo(null)).toEqual({ enabled: false, subjects: [] })
    expect(mapFormInfo('x')).toEqual({ enabled: false, subjects: [] })
  })
})

describe('mapRequest', () => {
  const row = {
    id: 'r1',
    applicant_role: 'parent' as const,
    source: 'signup',
    status: 'open' as const,
    subject_id: 's1',
    subject_name: 'Fizika',
    student_first_name: 'Mina',
    student_last_name: 'Ilić',
    contact_phone: '+381641234567',
    school: 'Gimnazija',
    grade: '3',
    city_part: 'Centar',
    school_teacher: 'Jelena Marić',
    situation: 'Treba mi pomoć',
    profile_completed: true,
    waiting_for_approval: true,
    listed: false,
    days_waiting: 0,
    offers_count: 2,
    choice_open: true,
    chosen_teacher_id: null,
    student_id: null,
  } as unknown as Parameters<typeof mapRequest>[0]

  it('takes what the screen of the applicant needs', () => {
    expect(mapRequest(row)).toEqual({
      id: 'r1',
      role: 'parent',
      source: 'signup',
      status: 'open',
      subjectId: 's1',
      subjectName: 'Fizika',
      profileCompleted: true,
      waitingForApproval: true,
      studentFirstName: 'Mina',
      studentLastName: 'Ilić',
      contactPhone: '+381641234567',
      school: 'Gimnazija',
      grade: '3',
      cityPart: 'Centar',
      schoolTeacher: 'Jelena Marić',
      situation: 'Treba mi pomoć',
      offersCount: 2,
      choiceOpen: true,
      chosenTeacherId: null,
    })
  })

  it('has no profile text before the profile is filled in', () => {
    const empty = mapRequest({
      ...row,
      profile_completed: false,
      student_first_name: null,
      student_last_name: null,
      contact_phone: null,
      school: null,
      grade: null,
      city_part: null,
      situation: null,
    } as unknown as Parameters<typeof mapRequest>[0])
    expect(empty).toMatchObject({
      profileCompleted: false,
      studentFirstName: null,
      contactPhone: null,
      school: null,
      cityPart: null,
    })
  })
})
