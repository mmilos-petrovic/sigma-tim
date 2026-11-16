import { useQuery } from '@tanstack/react-query'
import { useEnrolmentApi } from './EnrolmentApiProvider'

const enrolment = ['enrolment'] as const

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
