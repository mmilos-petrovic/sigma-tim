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
  editable = true,
  onClose,
  onDone,
}: {
  lesson: LessonRow
  reference: Reference
  students: StudentRow[]
  /** Offers the form that changes the lesson (the calendar). The list of lessons has a button for it on each card. */
  editable?: boolean
  onClose: () => void
  /** The lesson is gone, changed or answered. */
  onDone: () => void
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
      onEdit={editable ? () => setEditing(true) : undefined}
      onDone={onDone}
    />
  )
}
