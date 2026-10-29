import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useMember } from '../components/guards'
import { useTeacherApi } from './TeacherApiProvider'
import type { TimeRange } from './teacherApi'

const teacher = ['teacher'] as const

/** The signed-in teacher's profile id. */
export function useTeacherId(): string {
  return useMember().roles.profileId
}

export function useStudents() {
  const api = useTeacherApi()
  const teacherId = useTeacherId()
  return useQuery({
    queryKey: [...teacher, 'students', teacherId],
    queryFn: () => api.listStudents(teacherId),
  })
}

export function useUnassigned() {
  const api = useTeacherApi()
  const teacherId = useTeacherId()
  return useQuery({
    queryKey: [...teacher, 'unassigned', teacherId],
    queryFn: () => api.listUnassigned(teacherId),
  })
}

/** After a change: reload everything of the teacher's, so lists agree. Resolves when they are up to date. */
export function useRefresh() {
  const client = useQueryClient()
  return useCallback(() => client.invalidateQueries({ queryKey: teacher }), [client])
}

const FIVE_MINUTES = 5 * 60 * 1000

/** Subjects, locations and colleagues change rarely: the forms and the calendar share one copy. */
export function useReference() {
  const api = useTeacherApi()
  const teacherId = useTeacherId()
  return useQuery({
    queryKey: [...teacher, 'reference', teacherId],
    queryFn: () => api.reference(teacherId),
    staleTime: FIVE_MINUTES,
  })
}

/** The teacher's lessons and slots in the visible week. The previous week stays on screen while the next one loads. */
export function useLessons(range: TimeRange | null) {
  const api = useTeacherApi()
  const teacherId = useTeacherId()
  return useQuery({
    queryKey: [...teacher, 'lessons', teacherId, range?.start, range?.end],
    queryFn: () => api.listLessons(range as TimeRange, teacherId),
    enabled: range !== null,
    placeholderData: keepPreviousData,
  })
}

/** When colleagues are busy in the visible week. */
export function useBusy(range: TimeRange | null) {
  const api = useTeacherApi()
  const teacherId = useTeacherId()
  return useQuery({
    queryKey: [...teacher, 'busy', teacherId, range?.start, range?.end],
    queryFn: () => api.listBusy(range as TimeRange, teacherId),
    enabled: range !== null,
    placeholderData: keepPreviousData,
  })
}

/** Late bookings that wait for an answer, in any week. */
export function usePending() {
  const api = useTeacherApi()
  const teacherId = useTeacherId()
  return useQuery({
    queryKey: [...teacher, 'pending', teacherId],
    queryFn: () => api.listPending(teacherId),
  })
}
