import { useState } from 'react'
import { FormDialog } from '../../components/FormDialog'
import { ReasonField } from '../../components/ReasonField'
import { cleanReason } from '../../lib/reason'
import { isLateBooking } from '../lessonList'
import { useRefresh, useTeacherPhone } from '../queries'
import { useStudentApi } from '../StudentApiProvider'
import type { MyLesson } from '../studentApi'
import { PhoneLink } from '../../components/PhoneLink'
import { cancelLabel } from './labels'

/** Says what cancelling does, and inside the last 12 hours asks the person to call the teacher too. */
export function CancelDialog({
  lesson,
  now,
  onClose,
  onCancelled,
}: {
  lesson: MyLesson
  now: Date
  onClose: () => void
  onCancelled: (lesson: MyLesson) => void
}) {
  const api = useStudentApi()
  const refresh = useRefresh()
  const phone = useTeacherPhone(lesson.teacherId)
  const [reason, setReason] = useState('')
  const label = cancelLabel(lesson)
  const isSlot = lesson.origin === 'slot'
  const late = isLateBooking(lesson.start, now)

  return (
    <FormDialog
      title={label}
      action="cancelLesson"
      submitLabel={label}
      danger
      onClose={onClose}
      onSubmit={async () => {
        try {
          await api.cancelLesson(lesson.id, cleanReason(reason))
        } catch (failure) {
          // whatever went wrong, the lists may be out of date
          void refresh()
          throw failure
        }
        onCancelled(lesson)
        await refresh()
        onClose()
      }}
    >
      <p>
        {isSlot
          ? 'Otkazujete rezervaciju. Termin će ponovo postati slobodan.'
          : 'Otkazujete čas. Ako na času ima još učenika, za njih čas ostaje.'}
      </p>
      {late && (
        <p className="callout">
          {isSlot ? 'Termin' : 'Čas'} počinje za manje od 12 sati.
          {phone.data && (
            <>
              {' '}
              Pozovite nastavnika pre otkazivanja: <PhoneLink phone={phone.data} />
            </>
          )}
        </p>
      )}
      <ReasonField
        value={reason}
        onChange={setReason}
        hint="Razlog dobija nastavnik u obaveštenju."
      />
    </FormDialog>
  )
}
