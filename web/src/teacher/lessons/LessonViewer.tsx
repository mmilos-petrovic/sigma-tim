import { useState } from 'react'
import type { LessonRow, Reference, StudentRow } from '../teacherApi'
import { LessonDialog } from './LessonDialog'
import { LessonFormDialog } from './LessonFormDialog'

/**
 * One lesson as the teacher works with it, wherever it was picked: the dialog with its details (outcome, payment, notes,
 * cancelling), and from there the form to change it. Both the calendar and the list of lessons use it.
 */
export function LessonViewer({
  lesson,
  reference,
  students,
  onClose,
  onDone,
}: {
  lesson: LessonRow
  reference: Reference
  students: StudentRow[]
  onClose: () => void
  /** The lesson is gone, changed or answered; the message is shown on the page. */
  onDone: (message: string | null) => void
}) {
  const [editing, setEditing] = useState(false)

  return editing ? (
    <LessonFormDialog
      lesson={lesson}
      reference={reference}
      students={students}
      onClose={onClose}
      onDone={onDone}
    />
  ) : (
    <LessonDialog
      lesson={lesson}
      reference={reference}
      students={students}
      onClose={onClose}
      onEdit={() => setEditing(true)}
      onDone={onDone}
    />
  )
}
