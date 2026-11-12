import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react'
import { explainError } from '../../admin/errors'
import { AddIcon, IconButton } from '../../components/ActionIcons'
import { SelectField } from '../../components/FormDialog'
import { Loaded, Loading, LoadError, PageHeader } from '../../components/Loaded'
import { Link } from 'react-router'
import { CONTEXT_LABEL, homePath } from '../../auth/roles'
import { chosenColor, OWN_COLOR } from '../colors'
import { useNow } from '../clock'
import { chooseLocation, readLastLocation, writeLastLocation } from '../locationFilter'
import { ConflictDialog } from '../lessons/ConflictDialog'
import { LessonFormDialog } from '../lessons/LessonFormDialog'
import { LessonViewer } from '../lessons/LessonViewer'
import { PendingBookings } from '../lessons/PendingBookings'
import { SlotDialog } from '../lessons/SlotDialog'
import {
  useBusy,
  useLessons,
  useMyPhone,
  usePending,
  useReference,
  useRefresh,
  useStudents,
  useTeacherId,
} from '../queries'
import { buildItems } from '../scheduleItems'
import { useTeacherApi } from '../TeacherApiProvider'
import { ownLocations, type Conflict, type TimeRange } from '../teacherApi'

// FullCalendar is large and only this page needs it.
const WeekCalendar = lazy(() =>
  import('../calendar/WeekCalendar').then((module) => ({ default: module.WeekCalendar })),
)

type Dialog =
  | { kind: 'new'; initial?: TimeRange }
  | { kind: 'slot' }
  | { kind: 'view'; lessonId: string }
  | null

/** The teacher's whole schedule: the weekly calendar, late bookings, and the dialogs to change them. */
export function SchedulePage() {
  const api = useTeacherApi()
  const refresh = useRefresh()
  const teacherId = useTeacherId()
  const now = useNow()
  const reference = useReference()
  const students = useStudents()
  const pending = usePending()
  const myPhone = useMyPhone()

  const [range, setRange] = useState<TimeRange | null>(null)
  const lessons = useLessons(range)
  const busy = useBusy(range)

  const [dialog, setDialog] = useState<Dialog>(null)
  const [error, setError] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null)
  // the location whose colleagues are shown; remembered by the browser
  const [chosenLocation, setChosenLocation] = useState(() => readLastLocation(teacherId))
  const pendingAnswer = useRef<((save: boolean) => void) | null>(null)

  const onRangeChange = useCallback(
    (next: TimeRange) =>
      setRange((current) =>
        current && current.start === next.start && current.end === next.end ? current : next,
      ),
    [],
  )

  // the own lessons are always shown; the filter only makes sense with a choice to make, and a location the teacher no
  // longer has is not a choice any more
  const myLocations = reference.data ? ownLocations(reference.data) : []
  const activeLocation = chooseLocation(myLocations, chosenLocation)
  const noLocation = reference.data !== undefined && myLocations.length === 0
  // known to be missing: a number that cannot be read does not stop the teacher
  const noPhone = myPhone.isSuccess && myPhone.data === null
  const cannotSchedule = noLocation || noPhone

  const items = useMemo(
    () =>
      reference.data && students.data
        ? buildItems({
            lessons: lessons.data ?? [],
            busy: busy.data ?? [],
            students: students.data,
            reference: reference.data,
            teacherId,
            now,
            colleaguesAt: activeLocation,
          })
        : [],
    [lessons.data, busy.data, students.data, reference.data, teacherId, now, activeLocation],
  )

  const done = () => setDialog(null)

  const askAbout = (found: Conflict[]) =>
    new Promise<boolean>((resolve) => {
      pendingAnswer.current = resolve
      setConflicts(found)
    })

  const respond = (save: boolean) => {
    pendingAnswer.current?.(save)
    pendingAnswer.current = null
    setConflicts(null)
  }

  /** A block was dragged or resized: warn about clashes, then save. Rejecting puts the block back. */
  const changeTime = async (id: string, next: TimeRange) => {
    const lesson = lessons.data?.find((l) => l.id === id)
    if (!lesson) throw new Error('unknown lesson')
    const start = new Date(next.start).toISOString()
    const end = new Date(next.end).toISOString()
    setError(null)
    try {
      const found = await api.findConflicts({
        teacherId,
        roomId: lesson.roomId,
        start,
        end,
        excludeLessonId: id,
      })
      if (found.length > 0 && !(await askAbout(found))) throw new DeclinedError()
      await api.updateLesson(id, { start, end })
      await refresh()
    } catch (failure) {
      if (!(failure instanceof DeclinedError)) setError(explainError(failure, 'updateLesson'))
      throw failure
    }
  }

  const viewed =
    dialog?.kind === 'view' ? lessons.data?.find((l) => l.id === dialog.lessonId) : undefined

  return (
    <>
      <PageHeader title={CONTEXT_LABEL.teacher}>
        {/* a round button in the colour of the teacher's lessons for a lesson, a plain round one for a free slot */}
        <IconButton
          label="Novi čas"
          large
          round
          solid
          color={chosenColor(reference.data?.color) ?? OWN_COLOR}
          disabled={cannotSchedule}
          onClick={() => setDialog({ kind: 'new' })}
        >
          <AddIcon />
        </IconButton>
        <IconButton
          label="Objavi slobodan termin"
          large
          round
          disabled={cannotSchedule}
          onClick={() => setDialog({ kind: 'slot' })}
        >
          <AddIcon />
        </IconButton>
      </PageHeader>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {noPhone && (
        <p role="note" className="warning">
          <strong>Nemate upisan broj telefona.</strong> Potreban je za obaveštenja. Upišite ga u{' '}
          <Link to={`${homePath('teacher')}/podesavanja`}>Podešavanja</Link>. Dok ga ne upišete, ne
          možete da zakazujete časove ni da objavljujete termine.
        </p>
      )}
      {noLocation && (
        <p className="muted">
          Nemate nijednu lokaciju na kojoj možete da držite časove. Obratite se administratoru.
        </p>
      )}

      <Loaded query={reference}>
        {(ref) => (
          <Loaded query={students}>
            {(people) => (
              <>
                <PendingBookings
                  bookings={pending.data ?? []}
                  reference={ref}
                  students={people}
                  onChange={() => setError(null)}
                  onError={setError}
                />

                {lessons.isError && (
                  <LoadError error={lessons.error} onRetry={() => void lessons.refetch()} />
                )}
                {myLocations.length > 1 && (
                  <div className="schedule-filter">
                    <SelectField
                      label="Prikaz po lokaciji"
                      value={activeLocation ?? ''}
                      onChange={(id) => {
                        setChosenLocation(id)
                        writeLastLocation(teacherId, id)
                      }}
                    >
                      {myLocations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </SelectField>
                    <p className="muted">
                      Svoje časove vidite uvek; ovde birate na kojoj lokaciji vidite kolege.
                    </p>
                  </div>
                )}
                <div className="schedule">
                  <Suspense fallback={<Loading />}>
                    <WeekCalendar
                      items={items}
                      onRangeChange={onRangeChange}
                      onOpen={(id) => {
                        // a colleague's block is only a block: there is nothing to open
                        if (!id.startsWith('busy:')) setDialog({ kind: 'view', lessonId: id })
                      }}
                      onCreate={(selected) => {
                        if (!cannotSchedule) setDialog({ kind: 'new', initial: selected })
                      }}
                      onChangeTime={changeTime}
                    />
                  </Suspense>
                </div>

                {dialog?.kind === 'new' && (
                  <LessonFormDialog
                    initial={dialog.initial}
                    reference={ref}
                    students={people}
                    onClose={() => setDialog(null)}
                    onDone={done}
                  />
                )}
                {dialog?.kind === 'slot' && (
                  <SlotDialog reference={ref} onClose={() => setDialog(null)} onDone={done} />
                )}
                {dialog?.kind === 'view' && viewed && (
                  <LessonViewer
                    lesson={viewed}
                    reference={ref}
                    students={people}
                    onClose={() => setDialog(null)}
                    onDone={done}
                  />
                )}
                {conflicts && (
                  <ConflictDialog
                    conflicts={conflicts}
                    teacherId={teacherId}
                    reference={ref}
                    onAnswer={respond}
                  />
                )}
              </>
            )}
          </Loaded>
        )}
      </Loaded>
    </>
  )
}

/** The teacher looked at the warning and chose not to move the lesson. */
class DeclinedError extends Error {
  constructor() {
    super('declined')
    this.name = 'DeclinedError'
  }
}
