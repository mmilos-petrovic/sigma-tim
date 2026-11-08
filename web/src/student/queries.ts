import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useMember } from '../components/guards'
import { useNow } from '../teacher/clock'
import { useStudentApi } from './StudentApiProvider'
import type { StudentContext } from './studentApi'

const student = ['student'] as const

/** The records the person looks at: their own (student) or their children's (parent). */
export function useRecords(context: StudentContext) {
  const api = useStudentApi()
  const profileId = useMember().roles.profileId
  return useQuery({
    queryKey: [...student, 'records', context, profileId],
    queryFn: () => api.listRecords(context, profileId),
  })
}

export function useUpcoming(studentId: string) {
  const api = useStudentApi()
  const now = useNow()
  return useQuery({
    queryKey: [...student, 'upcoming', studentId],
    queryFn: () => api.listUpcoming(studentId, now.toISOString()),
  })
}

/** The newest `limit` past lessons; asking for more keeps the ones already on screen while the rest load. */
export function usePast(studentId: string, limit: number) {
  const api = useStudentApi()
  const now = useNow()
  return useQuery({
    queryKey: [...student, 'past', studentId, limit],
    queryFn: () => api.listPast(studentId, now.toISOString(), limit),
    placeholderData: keepPreviousData,
  })
}

/** The teacher's free slots; nothing is asked for a student without a teacher. */
export function useSlots(teacherId: string | null) {
  const api = useStudentApi()
  const now = useNow()
  return useQuery({
    queryKey: [...student, 'slots', teacherId],
    queryFn: () => api.listSlots(teacherId as string, now.toISOString()),
    enabled: teacherId !== null,
  })
}

/** The teacher's number; a failure to read it only means it is not shown. */
export function useTeacherPhone(teacherId: string | null) {
  const api = useStudentApi()
  return useQuery({
    queryKey: [...student, 'phone', teacherId],
    queryFn: () => api.teacherPhone(teacherId as string),
    enabled: teacherId !== null,
  })
}

/** After a change: reload the lists, so they agree. Resolves when they are up to date. */
export function useRefresh() {
  const client = useQueryClient()
  return useCallback(
    () =>
      client.invalidateQueries({
        queryKey: student,
        predicate: (query) => query.queryKey[1] !== 'records' && query.queryKey[1] !== 'phone',
      }),
    [client],
  )
}
