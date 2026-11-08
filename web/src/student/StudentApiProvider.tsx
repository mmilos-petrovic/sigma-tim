import { createContext, useContext, type ReactNode } from 'react'
import type { StudentApi } from './studentApi'

const StudentApiContext = createContext<StudentApi | null>(null)

export function StudentApiProvider({ api, children }: { api: StudentApi; children: ReactNode }) {
  return <StudentApiContext.Provider value={api}>{children}</StudentApiContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStudentApi(): StudentApi {
  const api = useContext(StudentApiContext)
  if (!api) throw new Error('useStudentApi must be used inside <StudentApiProvider>')
  return api
}
