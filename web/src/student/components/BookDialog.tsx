import { FormDialog } from '../../components/FormDialog'
import { useNow } from '../../teacher/clock'
import { formatDay, formatRange } from '../../teacher/format'
import { isLateBooking } from '../lessonList'
import { useRefresh, useTeacherPhone } from '../queries'
import { useStudentApi } from '../StudentApiProvider'
import type { LessonStatus, OpenSlot, StudentContext, StudentRecord } from '../studentApi'
import { PhoneLink } from '../../components/PhoneLink'

/** Asks before a slot is booked; a late booking says beforehand that the teacher has to confirm it. */
export function BookDialog({
  slot,
  context,
  record,
  onClose,
  onBooked,
}: {
  slot: OpenSlot
  context: StudentContext
  record: StudentRecord
  onClose: () => void
  onBooked: (status: LessonStatus) => void
}) {
  const api = useStudentApi()
  const refresh = useRefresh()
  const now = useNow()
  const phone = useTeacherPhone(record.teacherId)
  const late = isLateBooking(slot.start, now)

  return (
    <FormDialog
      title="Zauzmi termin"
      action="claimSlot"
      submitLabel="Zauzmi termin"
      onClose={onClose}
      onSubmit={async () => {
        let status: LessonStatus
        try {
          status = await api.claimSlot(slot.id, record.id)
        } catch (failure) {
          // somebody may have been faster: the list must show what is really free
          void refresh()
          throw failure
        }
        onBooked(status)
        await refresh()
        onClose()
      }}
    >
      <p>
        <strong>
          {formatDay(slot.start)}, {formatRange(slot.start, slot.end)}
        </strong>
        <br />
        {slot.subject} · {slot.location}
        {slot.room ? `, ${slot.room}` : ''}
      </p>
      {context === 'parent' && <p>Zauzimate termin za {record.name}.</p>}
      {late && (
        <p className="callout">
          Termin počinje za manje od 12 sati. Nastavnik mora da ga potvrdi.
          {phone.data && (
            <>
              {' '}
              Pozovite nastavnika: <PhoneLink phone={phone.data} />
            </>
          )}
        </p>
      )}
    </FormDialog>
  )
}
