import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEnrolmentApi } from './EnrolmentApiProvider'

const enrolment = ['enrolment'] as const

/** Everything about sign-ups that is on a screen right now: after a change, all of it is read again. */
export function useRefreshEnrolment() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: enrolment })
}

export function useEnrolmentFormInfo() {
  const api = useEnrolmentApi()
  return useQuery({ queryKey: [...enrolment, 'form'], queryFn: () => api.getFormInfo() })
}

/** `enabled: false` for a person who has not signed in: the answer would be an error, not an empty list. */
export function useMyEnrolmentRequests(enabled = true) {
  const api = useEnrolmentApi()
  return useQuery({
    queryKey: [...enrolment, 'mine'],
    queryFn: () => api.myRequests(),
    enabled,
  })
}

/** The teachers who offered for a request, the first one first. */
export function useOffers(requestId: string) {
  const api = useEnrolmentApi()
  return useQuery({
    queryKey: [...enrolment, 'offers', requestId],
    queryFn: () => api.myOffers(requestId),
  })
}

export function useOfferedCv(requestId: string, teacherId: string) {
  const api = useEnrolmentApi()
  return useQuery({
    queryKey: [...enrolment, 'offered-cv', requestId, teacherId],
    queryFn: () => api.getOfferedCv(requestId, teacherId),
  })
}

/** The requests a teacher sees. `enabled: false` for those who are not teachers. */
export function usePool(enabled = true) {
  const api = useEnrolmentApi()
  return useQuery({ queryKey: [...enrolment, 'pool'], queryFn: () => api.listPool(), enabled })
}

export function useChosen() {
  const api = useEnrolmentApi()
  return useQuery({ queryKey: [...enrolment, 'chosen'], queryFn: () => api.listChosen() })
}

export function useEnrolmentSettings() {
  const api = useEnrolmentApi()
  return useQuery({ queryKey: [...enrolment, 'settings'], queryFn: () => api.getSettings() })
}

/** Every request, for the administrator. */
export function useAllEnrolments() {
  const api = useEnrolmentApi()
  return useQuery({ queryKey: [...enrolment, 'all'], queryFn: () => api.listAll() })
}
