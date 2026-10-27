import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import {
  AdminError,
  MAX_LOCATION_PHOTOS,
  type AdminApi,
  type LocationRow,
  type Subject,
  type TakeoverRow,
  type TeacherRow,
} from './adminApi'

const BUCKET = 'location-photos'
const SIGNED_URL_SECONDS = 60 * 60
const byName = (a: string, b: string) => a.localeCompare(b, 'sr')

// Errors ---------------------------------------------------------------------------------------------------------

/** Keeps the PostgREST/Postgres code for the screens to translate; recognises a lost connection and a refused token. */
export function toAdminError(
  error: { code?: string; message?: string },
  status?: number,
): AdminError {
  const message = error.message ?? ''
  if (status === 401 || error.code === 'PGRST301') return new AdminError('expired', message)
  if (status === 0 || /failed to fetch|networkerror|load failed/i.test(message))
    return new AdminError('network', message)
  if (error.code) return new AdminError(error.code, message)
  return new AdminError('unknown', message)
}

interface Result<T> {
  data: T
  error: { code?: string; message?: string } | null
  status: number
  count?: number | null
}

async function run<T>(query: PromiseLike<Result<T>>): Promise<Result<T>> {
  let result: Result<T>
  try {
    result = await query
  } catch (error) {
    throw toAdminError({ message: error instanceof Error ? error.message : String(error) }, 0)
  }
  if (result.error) throw toAdminError(result.error, result.status)
  return result
}

/** An update or delete that matched no row means somebody else got there first. */
async function runOne(query: PromiseLike<Result<unknown[] | null>>): Promise<void> {
  const { data } = await run(query)
  if (!data || data.length === 0) throw new AdminError('PT404', 'no matching row')
}

// Photos ---------------------------------------------------------------------------------------------------------

/** The first free slot of the three, or null when the location is full. */
export function nextFreePosition(taken: number[]): number | null {
  for (let position = 1; position <= MAX_LOCATION_PHOTOS; position++) {
    if (!taken.includes(position)) return position
  }
  return null
}

export const photoPath = (locationId: string, fileId: string) => `${locationId}/${fileId}.jpg`

// Row mappers ----------------------------------------------------------------------------------------------------

export function mapSubject(row: {
  id: string
  name: string
  teachers: { count: number }[]
}): Subject {
  return { id: row.id, name: row.name, teacherCount: row.teachers[0]?.count ?? 0 }
}

export function mapTeacher(row: {
  profile_id: string
  is_active: boolean
  profile: { email: string; first_name: string; last_name: string; user_id: string | null }
  subjects: { subject_id: string }[]
}): TeacherRow {
  return {
    id: row.profile_id,
    email: row.profile.email,
    firstName: row.profile.first_name,
    lastName: row.profile.last_name,
    isActive: row.is_active,
    hasSignedIn: row.profile.user_id !== null,
    subjectIds: row.subjects.map((s) => s.subject_id),
  }
}

export function mapLocation(row: {
  id: string
  name: string
  address: string
  rooms: { id: string; name: string }[]
  location_photos: { id: string; storage_path: string; position: number }[]
}): LocationRow {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    // "Učionica 2" before "Učionica 10"
    rooms: [...row.rooms].sort((a, b) => a.name.localeCompare(b.name, 'sr', { numeric: true })),
    photos: row.location_photos
      .map((p) => ({ id: p.id, path: p.storage_path, position: p.position }))
      .sort((a, b) => a.position - b.position),
  }
}

export function mapTakeover(row: {
  id: string
  created_at: string
  student: {
    id: string
    school: string | null
    grade: string | null
    class_section: string | null
    profile: { first_name: string; last_name: string }
  }
  teacher: { profile_id: string; profile: { first_name: string; last_name: string } }
}): TakeoverRow {
  return {
    id: row.id,
    createdAt: row.created_at,
    student: {
      id: row.student.id,
      firstName: row.student.profile.first_name,
      lastName: row.student.profile.last_name,
      school: row.student.school,
      grade: row.student.grade,
      section: row.student.class_section,
    },
    teacher: {
      id: row.teacher.profile_id,
      firstName: row.teacher.profile.first_name,
      lastName: row.teacher.profile.last_name,
    },
  }
}

// The API --------------------------------------------------------------------------------------------------------

export function createSupabaseAdminApi(client: SupabaseClient<Database>): AdminApi {
  const storage = () => client.storage.from(BUCKET)
  const count = async (query: PromiseLike<Result<unknown>>) => (await run(query)).count ?? 0

  /** Storage reports its own error shape. */
  const storageError = (error: { message: string; statusCode?: string }) =>
    /row-level security|unauthorized|403/i.test(`${error.message} ${error.statusCode ?? ''}`)
      ? new AdminError('42501', error.message)
      : toAdminError(
          { message: error.message },
          error.statusCode ? Number(error.statusCode) : undefined,
        )

  const removeFiles = async (paths: string[]) => {
    if (paths.length === 0) return
    const { error } = await storage().remove(paths)
    if (error) throw storageError(error)
  }

  return {
    async listSubjects() {
      const { data } = await run(
        client.from('subjects').select('id, name, teachers:teacher_subjects(count)').order('name'),
      )
      return (data ?? []).map(mapSubject).sort((a, b) => byName(a.name, b.name))
    },
    async addSubject(name) {
      await run(client.from('subjects').insert({ name }))
    },
    async renameSubject(id, name) {
      await runOne(client.from('subjects').update({ name }).eq('id', id).select('id'))
    },
    async deleteSubject(id) {
      await runOne(client.from('subjects').delete().eq('id', id).select('id'))
    },

    async listTeachers() {
      const { data } = await run(
        client
          .from('teachers')
          .select(
            'profile_id, is_active, profile:profiles(email, first_name, last_name, user_id), subjects:teacher_subjects(subject_id)',
          ),
      )
      return (data ?? [])
        .map((row) => mapTeacher(row as unknown as Parameters<typeof mapTeacher>[0]))
        .sort((a, b) => byName(`${a.lastName} ${a.firstName}`, `${b.lastName} ${b.firstName}`))
    },
    async createTeacher({ email, firstName, lastName, subjectIds }) {
      await run(
        client.rpc('create_teacher', {
          p_email: email,
          p_first_name: firstName,
          p_last_name: lastName,
          p_subject_ids: subjectIds,
        }),
      )
    },
    async setTeacherSubjects(teacherId, subjectIds) {
      const { data } = await run(
        client.from('teacher_subjects').select('subject_id').eq('teacher_id', teacherId),
      )
      const current = (data ?? []).map((row) => row.subject_id)
      const added = subjectIds.filter((id) => !current.includes(id))
      const removed = current.filter((id) => !subjectIds.includes(id))
      // Add before removing, so the teacher never has no subject in between (the database refuses that).
      if (added.length > 0) {
        await run(
          client
            .from('teacher_subjects')
            .insert(added.map((subject_id) => ({ teacher_id: teacherId, subject_id }))),
        )
      }
      if (removed.length > 0) {
        await run(
          client
            .from('teacher_subjects')
            .delete()
            .eq('teacher_id', teacherId)
            .in('subject_id', removed),
        )
      }
    },
    async changeEmail(profileId, email) {
      await run(client.rpc('change_profile_email', { p_profile_id: profileId, p_new_email: email }))
    },
    async teacherImpact(teacherId) {
      const [futureLessons, students, pendingRequests] = await Promise.all([
        count(
          client
            .from('lessons')
            .select('id', { count: 'exact', head: true })
            .eq('teacher_id', teacherId)
            .gt('start_at', new Date().toISOString()),
        ),
        count(
          client
            .from('students')
            .select('id', { count: 'exact', head: true })
            .eq('teacher_id', teacherId),
        ),
        count(
          client
            .from('takeover_requests')
            .select('id', { count: 'exact', head: true })
            .eq('teacher_id', teacherId)
            .eq('status', 'pending'),
        ),
      ])
      return { futureLessons, students, pendingRequests }
    },
    async deactivateTeacher(teacherId) {
      await run(client.rpc('deactivate_teacher', { p_teacher_id: teacherId }))
    },
    async reactivateTeacher(teacherId) {
      await run(client.rpc('reactivate_teacher', { p_teacher_id: teacherId }))
    },

    async listLocations() {
      const { data } = await run(
        client
          .from('locations')
          .select(
            'id, name, address, rooms(id, name), location_photos(id, storage_path, position)',
          ),
      )
      return (data ?? []).map(mapLocation).sort((a, b) => byName(a.name, b.name))
    },
    async addLocation(input) {
      await run(client.from('locations').insert(input))
    },
    async updateLocation(id, input) {
      await runOne(client.from('locations').update(input).eq('id', id).select('id'))
    },
    async deleteLocation(id) {
      const { data } = await run(
        client.from('location_photos').select('storage_path').eq('location_id', id),
      )
      const paths = (data ?? []).map((row) => row.storage_path)
      // The row goes first: if rooms or lessons still use the location nothing is lost and the files stay.
      await runOne(client.from('locations').delete().eq('id', id).select('id'))
      try {
        await removeFiles(paths)
      } catch (error) {
        console.warn('The location was deleted but its photo files could not be removed', error)
      }
    },
    async addRoom(locationId, name) {
      await run(client.from('rooms').insert({ location_id: locationId, name }))
    },
    async renameRoom(id, name) {
      await runOne(client.from('rooms').update({ name }).eq('id', id).select('id'))
    },
    async deleteRoom(id) {
      await runOne(client.from('rooms').delete().eq('id', id).select('id'))
    },
    async addPhoto(locationId, image) {
      const { data } = await run(
        client.from('location_photos').select('position').eq('location_id', locationId),
      )
      const position = nextFreePosition((data ?? []).map((row) => row.position))
      if (position === null) throw new AdminError('photoLimit')

      const path = photoPath(locationId, crypto.randomUUID())
      const upload = await storage().upload(path, image, {
        contentType: 'image/jpeg',
        upsert: false,
      })
      if (upload.error) throw storageError(upload.error)

      try {
        await run(
          client
            .from('location_photos')
            .insert({ location_id: locationId, storage_path: path, position }),
        )
      } catch (error) {
        // Do not leave a file behind that nothing points to.
        await storage().remove([path])
        throw error
      }
    },
    async removePhoto(photo) {
      // File first: if that fails the row stays and the admin can try again; the other way round would leave a file nobody sees.
      await removeFiles([photo.path])
      await run(client.from('location_photos').delete().eq('id', photo.id))
    },
    async photoUrls(paths) {
      if (paths.length === 0) return {}
      const { data, error } = await storage().createSignedUrls(paths, SIGNED_URL_SECONDS)
      if (error) throw storageError(error)
      const urls: Record<string, string> = {}
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) urls[item.path] = item.signedUrl
      }
      return urls
    },

    async listTakeovers() {
      const { data } = await run(
        client
          .from('takeover_requests')
          .select(
            'id, created_at, student:students(id, school, grade, class_section, profile:profiles(first_name, last_name)), teacher:teachers(profile_id, profile:profiles(first_name, last_name))',
          )
          .eq('status', 'pending')
          .order('created_at'),
      )
      return (data ?? []).map((row) =>
        mapTakeover(row as unknown as Parameters<typeof mapTakeover>[0]),
      )
    },
    async approveTakeover(requestId) {
      await run(client.rpc('approve_takeover', { p_request_id: requestId }))
    },
    async rejectTakeover(requestId) {
      await run(client.rpc('reject_takeover', { p_request_id: requestId }))
    },
  }
}
