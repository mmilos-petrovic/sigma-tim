import { useState } from 'react'
import { FormDialog } from '../../components/FormDialog'
import { ReasonField } from '../../components/ReasonField'
import { cleanReason } from '../../lib/reason'
import { formatDay, formatRange } from '../format'
import { useRefresh } from '../queries'
import { studentNames } from '../scheduleItems'
import { useTeacherApi } from '../TeacherApiProvider'
import type { LessonRow, Reference, StudentRow } from '../teacherApi'

/** Declines a late booking, which frees the slot. The reason is optional and goes to the student and the parents. */
export function DeclineDialog({
  booking,
  reference,
  students,
  onClose,
  onDone,
}: {
  booking: LessonRow
  reference: Reference
  students: StudentRow[]
  onClose: () => void
  onDone: () => void
}) {
  const api = useTeacherApi()
  const refresh = useRefresh()
  const [reason, setReason] = useState('')
  const subject = reference.subjects.find((s) => s.id === booking.subjectId)?.name ?? 'Čas'

  return (
    <FormDialog
      title="Odbijanje zahteva"
      action="declineBooking"
      submitLabel="Odbij zahtev"
      danger
      onClose={onClose}
      onSubmit={async () => {
        try {
          await api.declineBooking(booking.id, cleanReason(reason))
        } catch (failure) {
          // whatever went wrong, the lists may be out of date
          void refresh()
          throw failure
        }
        await refresh()
        onDone()
      }}
    >
      <p>
        <strong>{studentNames(booking, students)}</strong>, {subject}, {formatDay(booking.start)},{' '}
        {formatRange(booking.start, booking.end)}.
      </p>
      <p>Termin ponovo postaje slobodan.</p>
      <ReasonField
        value={reason}
        onChange={setReason}
        hint="Razlog dobijaju učenik i roditelji u obaveštenju."
      />
    </FormDialog>
  )
}
