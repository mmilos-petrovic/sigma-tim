import { createContext, useContext, type ReactNode } from 'react'
import type { TeacherApi } from './teacherApi'

const TeacherApiContext = createContext<TeacherApi | null>(null)

export function TeacherApiProvider({ api, children }: { api: TeacherApi; children: ReactNode }) {
  return <TeacherApiContext.Provider value={api}>{children}</TeacherApiContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTeacherApi(): TeacherApi {
  const api = useContext(TeacherApiContext)
  if (!api) throw new Error('useTeacherApi must be used inside <TeacherApiProvider>')
  return api
}
