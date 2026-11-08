import { useOutletContext } from 'react-router'
import type { StudentContext, StudentRecord } from './studentApi'

/** What the layout passes down to the two tabs: whose lessons these are and in which role the person looks. */
export interface StudentView {
  context: StudentContext
  record: StudentRecord
  /** Where the lessons tab lives (`/ucenik` or `/roditelj`). */
  home: string
  /** The signed-in person (a parent is not the student whose record is shown). */
  profileId: string
}

export const useStudentView = () => useOutletContext<StudentView>()
