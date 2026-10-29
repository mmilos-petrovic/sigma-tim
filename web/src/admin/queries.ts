import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useAdminApi } from './AdminApiProvider'

const admin = ['admin'] as const

export function useSubjects() {
  const api = useAdminApi()
  return useQuery({ queryKey: [...admin, 'subjects'], queryFn: () => api.listSubjects() })
}

export function useTeachers() {
  const api = useAdminApi()
  return useQuery({ queryKey: [...admin, 'teachers'], queryFn: () => api.listTeachers() })
}

export function useLocations() {
  const api = useAdminApi()
  return useQuery({ queryKey: [...admin, 'locations'], queryFn: () => api.listLocations() })
}

export function useTakeovers() {
  const api = useAdminApi()
  return useQuery({ queryKey: [...admin, 'takeovers'], queryFn: () => api.listTakeovers() })
}

/** Always fresh: the numbers are shown right before a decision. */
export function useTeacherImpact(teacherId: string) {
  const api = useAdminApi()
  return useQuery({
    queryKey: [...admin, 'impact', teacherId],
    queryFn: () => api.teacherImpact(teacherId),
    gcTime: 0,
    staleTime: 0,
  })
}

/** Signed links last an hour; they are renewed well before that. */
export function usePhotoUrls(paths: string[]) {
  const api = useAdminApi()
  return useQuery({
    queryKey: [...admin, 'photoUrls', ...paths],
    queryFn: () => api.photoUrls(paths),
    enabled: paths.length > 0,
    staleTime: 30 * 60 * 1000,
  })
}

/** After a change: reload every admin list, so counts and tables agree. Resolves when they are up to date. */
export function useRefresh() {
  const client = useQueryClient()
  return useCallback(() => client.invalidateQueries({ queryKey: admin }), [client])
}
