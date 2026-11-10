import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '../lib/database.types'
import { NOTIFICATION_PAGE_SIZE } from './adminApi'
import {
  createSupabaseAdminApi,
  mapLocation,
  mapNotificationLogRow,
  mapNotificationSettings,
  mapSubject,
  mapTakeover,
  mapTeacher,
  nextFreePosition,
  photoPath,
  toAdminError,
} from './supabaseAdminApi'

describe('toAdminError', () => {
  it('keeps the PostgREST and Postgres codes, which the screens translate', () => {
    expect(toAdminError({ code: 'PT409', message: 'slot is already taken' }, 409)).toMatchObject({
      name: 'AdminError',
      code: 'PT409',
      message: 'slot is already taken',
    })
    expect(toAdminError({ code: '23503', message: 'foreign key' }, 409).code).toBe('23503')
    expect(toAdminError({ code: '42501', message: 'denied' }, 403).code).toBe('42501')
  })

  it("keeps the database's detail, which names the lessons that stop a location from being taken away", () => {
    const details = '{"total":1,"lessons":[]}'
    expect(
      toAdminError({ code: 'PT409', message: 'still has lessons', details }, 409).details,
    ).toBe(details)
    expect(toAdminError({ code: 'PT409', message: 'no detail' }, 409).details).toBeUndefined()
    expect(
      toAdminError({ code: 'PT409', message: 'empty', details: '' }, 409).details,
    ).toBeUndefined()
  })

  it('recognises a lost connection', () => {
    expect(toAdminError({ message: 'TypeError: Failed to fetch' }, 0).code).toBe('network')
    expect(toAdminError({ message: 'Failed to fetch', code: '' }, 0).code).toBe('network')
    expect(
      toAdminError({ message: 'NetworkError when attempting to fetch resource.' }, 0).code,
    ).toBe('network')
  })

  it('recognises a session the server refuses', () => {
    expect(toAdminError({ code: 'PGRST301', message: 'JWT expired' }, 401).code).toBe('expired')
    expect(toAdminError({ message: 'Unauthorized' }, 401).code).toBe('expired')
  })

  it('has an unknown bucket for the rest', () => {
    expect(toAdminError({ message: 'oops', code: '' }, 500).code).toBe('unknown')
    expect(toAdminError({ message: 'oops' }, 500).code).toBe('unknown')
  })
})

describe('photo helpers', () => {
  it('fills the first free position of three', () => {
    expect(nextFreePosition([])).toBe(1)
    expect(nextFreePosition([1])).toBe(2)
    expect(nextFreePosition([1, 3])).toBe(2)
    expect(nextFreePosition([2, 3])).toBe(1)
    expect(nextFreePosition([1, 2, 3])).toBeNull()
  })

  it('names the object after its location', () => {
    expect(photoPath('loc-1', 'abc')).toBe('loc-1/abc.jpg')
  })
})

describe('row mappers', () => {
  it('maps a subject with its teacher count', () => {
    expect(mapSubject({ id: 's1', name: 'Fizika', teachers: [{ count: 2 }] })).toEqual({
      id: 's1',
      name: 'Fizika',
      teacherCount: 2,
    })
    expect(mapSubject({ id: 's2', name: 'Hemija', teachers: [] }).teacherCount).toBe(0)
  })

  it('maps a teacher, and knows whether they have signed in yet', () => {
    const row = {
      profile_id: 't1',
      is_active: true,
      profile: {
        email: 'ana@example.test',
        first_name: 'Ana',
        last_name: 'Nikolić',
        user_id: null,
        is_admin: false,
        erased_at: null,
      },
      subjects: [{ subject_id: 's1' }, { subject_id: 's2' }],
      locations: [{ location_id: 'l1' }],
    }
    expect(mapTeacher(row)).toEqual({
      id: 't1',
      email: 'ana@example.test',
      firstName: 'Ana',
      lastName: 'Nikolić',
      isActive: true,
      hasSignedIn: false,
      isAdmin: false,
      erased: false,
      subjectIds: ['s1', 's2'],
      locationIds: ['l1'],
      phone: null,
    })
    expect(mapTeacher(row, new Map([['t1', '+381641234567']])).phone).toBe('+381641234567')
    expect(mapTeacher(row, new Map([['other', '+381641234567']])).phone).toBeNull()
    expect(mapTeacher({ ...row, profile: { ...row.profile, user_id: 'u1' } }).hasSignedIn).toBe(
      true,
    )
  })

  it('knows an administrator who teaches and an erased record', () => {
    const profile = {
      email: 'ana@example.test',
      first_name: 'Ana',
      last_name: 'Nikolić',
      user_id: null,
      is_admin: false,
      erased_at: null,
    }
    const row = { profile_id: 't1', is_active: false, profile, subjects: [], locations: [] }
    expect(mapTeacher({ ...row, profile: { ...profile, is_admin: true } })).toMatchObject({
      isAdmin: true,
      erased: false,
    })
    expect(
      mapTeacher({ ...row, profile: { ...profile, erased_at: '2026-11-06T10:00:00Z' } }),
    ).toMatchObject({ isAdmin: false, erased: true })
  })

  it('maps a location with its rooms and photos in a sensible order', () => {
    const location = mapLocation({
      id: 'l1',
      name: 'Glavna',
      address: 'Ulica 1',
      rooms: [
        { id: 'r2', name: 'Učionica 2' },
        { id: 'r10', name: 'Učionica 10' },
        { id: 'r1', name: 'Učionica 1' },
      ],
      location_photos: [
        { id: 'p3', storage_path: 'l1/c.jpg', position: 3 },
        { id: 'p1', storage_path: 'l1/a.jpg', position: 1 },
      ],
    })
    expect(location.rooms.map((room) => room.name)).toEqual([
      'Učionica 1',
      'Učionica 2',
      'Učionica 10',
    ])
    expect(location.photos).toEqual([
      { id: 'p1', path: 'l1/a.jpg', position: 1 },
      { id: 'p3', path: 'l1/c.jpg', position: 3 },
    ])
  })

  it('maps a takeover request with names of the student and the teacher', () => {
    expect(
      mapTakeover({
        id: 'q1',
        created_at: '2026-10-26T10:00:00Z',
        student: {
          id: 'st1',
          school: 'OŠ Vuk',
          grade: '7',
          class_section: 'a',
          profile: { first_name: 'Luka', last_name: 'Ilić' },
        },
        teacher: { profile_id: 't1', profile: { first_name: 'Ana', last_name: 'Nikolić' } },
      }),
    ).toEqual({
      id: 'q1',
      createdAt: '2026-10-26T10:00:00Z',
      student: {
        id: 'st1',
        firstName: 'Luka',
        lastName: 'Ilić',
        school: 'OŠ Vuk',
        grade: '7',
        section: 'a',
      },
      teacher: { id: 't1', firstName: 'Ana', lastName: 'Nikolić' },
    })
  })
})

describe('notification settings', () => {
  const answer = {
    quiet_hours_enabled: true,
    quiet_start: '22:00',
    quiet_end: '07:00',
    reminder_enabled: true,
    reminder_minutes: 60,
    welcome_text: 'Dobro došli',
    school_contact: 'Tel 011',
    kinds: [
      {
        kind: 'lesson_moved',
        email_fallback: true,
        always_email: false,
        ignores_quiet_hours: false,
      },
      { kind: 'welcome', email_fallback: true, always_email: true, ignores_quiet_hours: true },
    ],
  }

  it('maps the database answer', () => {
    expect(mapNotificationSettings(answer)).toEqual({
      quietHoursEnabled: true,
      quietStart: '22:00',
      quietEnd: '07:00',
      reminderEnabled: true,
      reminderMinutes: 60,
      welcomeText: 'Dobro došli',
      schoolContact: 'Tel 011',
      kinds: [
        { kind: 'lesson_moved', emailFallback: true, alwaysEmail: false, ignoresQuietHours: false },
        { kind: 'welcome', emailFallback: true, alwaysEmail: true, ignoresQuietHours: true },
      ],
    })
  })

  it.each([
    ['nothing', null],
    ['a missing flag', { ...answer, quiet_hours_enabled: undefined }],
    ['a missing time', { ...answer, quiet_start: undefined }],
    ['a reminder time that is not a number', { ...answer, reminder_minutes: '60' }],
    ['no kinds', { ...answer, kinds: null }],
  ])('refuses an answer with %s instead of inventing a value', (_name, value) => {
    expect(() => mapNotificationSettings(value)).toThrow(/settings/)
  })

  it('maps a line of the log, with the times as instants and the channel only when it is known', () => {
    const row = {
      id: 7,
      kind: 'lesson_moved',
      recipient_name: 'Luka Ilić',
      recipient_email: 'luka@example.test',
      created_at: '2026-11-09T10:00:00+00:00',
      deliver_after: '2026-11-09T10:00:00+00:00',
      sent_at: null,
      channel: null,
      attempts: 0,
      last_error: null,
      state: 'queued',
    }
    expect(mapNotificationLogRow(row)).toEqual({
      id: 7,
      kind: 'lesson_moved',
      recipientName: 'Luka Ilić',
      recipientEmail: 'luka@example.test',
      createdAt: '2026-11-09T10:00:00.000Z',
      deliverAfter: '2026-11-09T10:00:00.000Z',
      sentAt: null,
      channel: null,
      attempts: 0,
      lastError: null,
      state: 'queued',
    })
    expect(
      mapNotificationLogRow({ ...row, sent_at: '2026-11-09T10:00:05+00:00', channel: 'push' }),
    ).toMatchObject({ sentAt: '2026-11-09T10:00:05.000Z', channel: 'push' })
    expect(mapNotificationLogRow({ ...row, channel: 'carrier-pigeon' }).channel).toBeNull()
  })

  /** A client whose `rpc` answers with `data` and remembers what it was asked. */
  const clientAnswering = (
    data: unknown,
    error: { code?: string; message?: string } | null = null,
  ) => {
    const rpc = vi.fn(async () => ({ data, error, status: error ? 400 : 200 }))
    return { rpc, api: createSupabaseAdminApi({ rpc } as unknown as SupabaseClient<Database>) }
  }

  it('asks the database for the settings and saves them with the names it expects', async () => {
    const { rpc, api } = clientAnswering(answer)
    expect((await api.getNotificationSettings()).reminderMinutes).toBe(60)
    expect(rpc).toHaveBeenLastCalledWith('get_notification_settings')

    await api.saveNotificationSettings({
      quietHoursEnabled: true,
      quietStart: '21:30',
      quietEnd: '06:00',
      reminderEnabled: false,
      reminderMinutes: 45,
      welcomeText: 'Zdravo',
      schoolContact: 'Kontakt',
    })
    expect(rpc).toHaveBeenLastCalledWith('set_notification_settings', {
      p_quiet_hours_enabled: true,
      p_quiet_start: '21:30',
      p_quiet_end: '06:00',
      p_reminder_enabled: false,
      p_reminder_minutes: 45,
      p_welcome_text: 'Zdravo',
      p_school_contact: 'Kontakt',
    })
  })

  it('switches an email fallback, resends and tests', async () => {
    const { rpc, api } = clientAnswering(null)
    await api.setEmailFallback('lesson_moved', false)
    expect(rpc).toHaveBeenLastCalledWith('set_email_fallback', {
      p_kind: 'lesson_moved',
      p_enabled: false,
    })
    await api.resendNotification(42)
    expect(rpc).toHaveBeenLastCalledWith('admin_resend_notification', { p_id: 42 })
    await api.sendTestNotification()
    expect(rpc).toHaveBeenLastCalledWith('admin_send_test_notification')
  })

  it('lists the log a page at a time, sending the cursor and the state only when there are some', async () => {
    const { rpc, api } = clientAnswering([])
    expect(await api.listNotifications({})).toEqual([])
    expect(rpc).toHaveBeenLastCalledWith('admin_list_notifications', {
      p_limit: NOTIFICATION_PAGE_SIZE,
    })
    await api.listNotifications({ before: 120, state: 'failed' })
    expect(rpc).toHaveBeenLastCalledWith('admin_list_notifications', {
      p_limit: NOTIFICATION_PAGE_SIZE,
      p_before: 120,
      p_state: 'failed',
    })
    // a cursor of 0 is still a cursor
    await api.listNotifications({ before: 0, state: null })
    expect(rpc).toHaveBeenLastCalledWith('admin_list_notifications', {
      p_limit: NOTIFICATION_PAGE_SIZE,
      p_before: 0,
    })
  })

  it('keeps the code of a refusal for the screen to explain', async () => {
    const { api } = clientAnswering(null, {
      code: 'PT409',
      message: 'only a failed notice can be sent again',
    })
    await expect(api.resendNotification(1)).rejects.toMatchObject({
      name: 'AdminError',
      code: 'PT409',
    })
  })
})
