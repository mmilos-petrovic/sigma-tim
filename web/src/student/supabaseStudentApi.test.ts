import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { Database } from '../lib/database.types'
import {
  createSupabaseStudentApi,
  mapLesson,
  mapRecord,
  mapSlot,
  type LessonRowFromDb,
} from './supabaseStudentApi'

const names = new Map([['t1', 'Ana Nikolić']])

const row = (overrides: Partial<LessonRowFromDb> = {}): LessonRowFromDb => ({
  id: 'l1',
  teacher_id: 't1',
  start_at: '2026-11-05T16:00:00+00:00',
  end_at: '2026-11-05T17:00:00+00:00',
  status: 'confirmed',
  outcome: null,
  origin: 'teacher',
  subject: { name: 'Matematika' },
  location: { name: 'Centar', address: 'Knez Mihailova 1' },
  room: { name: 'Učionica 1' },
  mine: [{ note: 'Ponesite zbirku.', paid_at: null as string | null }],
  ...overrides,
})

describe('mapLesson', () => {
  it('turns a row into what the screens show', () => {
    expect(mapLesson(row(), names)).toEqual({
      id: 'l1',
      start: '2026-11-05T16:00:00.000Z',
      end: '2026-11-05T17:00:00.000Z',
      status: 'confirmed',
      outcome: null,
      origin: 'teacher',
      subject: 'Matematika',
      location: 'Centar',
      address: 'Knez Mihailova 1',
      room: 'Učionica 1',
      teacherId: 't1',
      teacherName: 'Ana Nikolić',
      note: 'Ponesite zbirku.',
      paid: false,
    })
  })

  it('has no room, note or teacher name when the database shows none', () => {
    const lesson = mapLesson(
      row({ room: null, mine: [{ note: null, paid_at: null }], teacher_id: 'gone' }),
      names,
    )
    expect(lesson.room).toBeNull()
    expect(lesson.note).toBeNull()
    expect(lesson.teacherName).toBeNull()
  })

  it('treats a blank note as none', () => {
    expect(mapLesson(row({ mine: [{ note: '   ', paid_at: null }] }), names).note).toBeNull()
  })

  it('knows whether the teacher marked the lesson as paid', () => {
    expect(
      mapLesson(row({ mine: [{ note: null, paid_at: '2026-11-06T09:00:00+00:00' }] }), names).paid,
    ).toBe(true)
    expect(mapLesson(row({ mine: [{ note: null, paid_at: null }] }), names).paid).toBe(false)
    expect(mapLesson(row({ mine: [] }), names).paid).toBe(false)
  })

  it('keeps the outcome the teacher recorded', () => {
    expect(mapLesson(row({ outcome: 'not_held' }), names).outcome).toBe('not_held')
  })
})

describe('mapSlot', () => {
  it('reads a free slot', () => {
    expect(
      mapSlot({
        id: 's1',
        start_at: '2026-11-06T08:00:00+00:00',
        end_at: '2026-11-06T09:00:00+00:00',
        subject: { name: 'Fizika' },
        location: { name: 'Zemun', address: 'Glavna 2' },
        room: null,
      }),
    ).toEqual({
      id: 's1',
      start: '2026-11-06T08:00:00.000Z',
      end: '2026-11-06T09:00:00.000Z',
      subject: 'Fizika',
      location: 'Zemun',
      address: 'Glavna 2',
      room: null,
    })
  })
})

describe('mapRecord', () => {
  it('names the student and the current teacher', () => {
    expect(
      mapRecord(
        { id: 's1', teacher_id: 't1', profile: { first_name: 'Marko', last_name: 'Marković' } },
        names,
      ),
    ).toEqual({ id: 's1', name: 'Marko Marković', teacherId: 't1', teacherName: 'Ana Nikolić' })
  })

  it('has no teacher for a student nobody teaches', () => {
    const record = mapRecord(
      { id: 's1', teacher_id: null, profile: { first_name: 'Marko', last_name: 'Marković' } },
      names,
    )
    expect(record.teacherId).toBeNull()
    expect(record.teacherName).toBeNull()
  })
})

/** A client that records every call of a query and answers with the rows it was given. */
function stubClient(answers: Record<string, unknown[]>) {
  const log: { table: string; calls: [string, unknown[]][] }[] = []
  const client = {
    from(table: string) {
      const entry = { table, calls: [] as [string, unknown[]][] }
      log.push(entry)
      const builder: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'in', 'gt', 'lte', 'order', 'limit']) {
        builder[method] = (...args: unknown[]) => {
          entry.calls.push([method, args])
          return builder
        }
      }
      builder.maybeSingle = () => {
        entry.calls.push(['maybeSingle', []])
        return Promise.resolve({
          data: (answers[table] ?? [])[0] ?? null,
          error: null,
          status: 200,
        })
      }
      builder.then = (resolve: (value: unknown) => unknown) =>
        resolve({ data: answers[table] ?? [], error: null, status: 200 })
      return builder
    },
    rpc(name: string, args: unknown) {
      log.push({ table: `rpc:${name}`, calls: [['args', [args]]] })
      return Promise.resolve({ data: 'pending', error: null, status: 200 })
    },
  }
  return { api: createSupabaseStudentApi(client as unknown as SupabaseClient<Database>), log }
}

const lessonQuery = (log: ReturnType<typeof stubClient>['log']) =>
  log.find((entry) => entry.table === 'lessons')?.calls ?? []

describe('the queries', () => {
  it('read lessons only through the student’s own participation', async () => {
    const { api, log } = stubClient({
      lessons: [row()],
      profiles: [{ id: 't1', first_name: 'Ana', last_name: 'Nikolić' }],
    })
    await api.listUpcoming('st1', '2026-11-04T10:00:00.000Z')
    const calls = lessonQuery(log)
    expect(calls).toContainEqual(['eq', ['mine.student_id', 'st1']])
    expect(calls).toContainEqual(['gt', ['end_at', '2026-11-04T10:00:00.000Z']])
    expect(calls).toContainEqual(['order', ['start_at', { ascending: true }]])
    const select = calls.find(([method]) => method === 'select')?.[1][0] as string
    expect(select).toContain('lesson_students!inner')
  })

  it('ask for one lesson more than the limit to know whether there are older ones', async () => {
    const rows = Array.from({ length: 4 }, (_, i) => row({ id: `l${i}` }))
    const { api, log } = stubClient({
      lessons: rows,
      profiles: [{ id: 't1', first_name: 'Ana', last_name: 'Nikolić' }],
    })
    const page = await api.listPast('st1', '2026-11-04T10:00:00.000Z', 3)
    expect(lessonQuery(log)).toContainEqual(['limit', [4]])
    expect(lessonQuery(log)).toContainEqual(['lte', ['end_at', '2026-11-04T10:00:00.000Z']])
    expect(lessonQuery(log)).toContainEqual(['order', ['start_at', { ascending: false }]])
    expect(page.lessons).toHaveLength(3)
    expect(page.hasMore).toBe(true)
  })

  it('say there is nothing older when the limit is not reached', async () => {
    const { api } = stubClient({
      lessons: [row()],
      profiles: [{ id: 't1', first_name: 'Ana', last_name: 'Nikolić' }],
    })
    expect((await api.listPast('st1', '2026-11-04T10:00:00.000Z', 3)).hasMore).toBe(false)
  })

  it('read the free slots of one teacher that have not started', async () => {
    const { api, log } = stubClient({ lessons: [] })
    await api.listSlots('t1', '2026-11-04T10:00:00.000Z')
    const calls = lessonQuery(log)
    expect(calls).toContainEqual(['eq', ['teacher_id', 't1']])
    expect(calls).toContainEqual(['eq', ['status', 'open']])
    expect(calls).toContainEqual(['gt', ['start_at', '2026-11-04T10:00:00.000Z']])
  })

  it('read a student’s records by the profile, and a parent’s by their children', async () => {
    const own = stubClient({ students: [] })
    await own.api.listRecords('student', 'p1')
    expect(own.log[0].calls).toContainEqual(['eq', ['profile_id', 'p1']])

    const children = stubClient({ parent_students: [] })
    await children.api.listRecords('parent', 'p2')
    expect(children.log[0].table).toBe('parent_students')
    expect(children.log[0].calls).toContainEqual(['eq', ['parent_id', 'p2']])
  })

  it('book one student at a time through the booking function', async () => {
    const { api, log } = stubClient({})
    expect(await api.claimSlot('slot1', 'st1')).toBe('pending')
    expect(log[0]).toEqual({
      table: 'rpc:claim_slot',
      calls: [['args', [{ p_lesson_id: 'slot1', p_student_ids: ['st1'] }]]],
    })
  })

  it('cancel through the cancelling function', async () => {
    const { api, log } = stubClient({})
    await api.cancelLesson('l1')
    expect(log[0].table).toBe('rpc:cancel_lesson')
    expect(log[0].calls).toEqual([['args', [{ p_lesson_id: 'l1', p_note: undefined }]]])
  })

  it('send the reason with the cancellation', async () => {
    const { api, log } = stubClient({})
    await api.cancelLesson('l1', 'Bolestan sam')
    expect(log[0].calls).toEqual([['args', [{ p_lesson_id: 'l1', p_note: 'Bolestan sam' }]]])
  })

  it('read the teacher’s number from the phone table', async () => {
    const { api } = stubClient({ person_phones: [{ phone: '+381641110000' }] })
    expect(await api.teacherPhone('t1')).toBe('+381641110000')
    expect(await stubClient({ person_phones: [] }).api.teacherPhone('t1')).toBeNull()
  })
})
