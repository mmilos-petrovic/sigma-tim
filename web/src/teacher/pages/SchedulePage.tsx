import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react'
import { explainError } from '../../admin/errors'
import { Loaded, Loading, LoadError, Notice, PageHeader } from '../../components/Loaded'
import { CONTEXT_LABEL } from '../../auth/roles'
import { useNow } from '../clock'
import { ConflictDialog } from '../lessons/ConflictDialog'
import { LessonDialog } from '../lessons/LessonDialog'
import { LessonFormDialog } from '../lessons/LessonFormDialog'
import { PendingBookings } from '../lessons/PendingBookings'
import { SlotDialog } from '../lessons/SlotDialog'
import {
  useBusy,
  useLessons,
  usePending,
  useReference,
  useRefresh,
  useStudents,
  useTeacherId,
} from '../queries'
import { buildItems } from '../scheduleItems'
import { useTeacherApi } from '../TeacherApiProvider'
import type { Conflict, TimeRange } from '../teacherApi'

// FullCalendar is large and only this page needs it.
const WeekCalendar = lazy(() =>
  import('../calendar/WeekCalendar').then((module) => ({ default: module.WeekCalendar })),
)

type Dialog =
  | { kind: 'new'; initial?: TimeRange }
  | { kind: 'slot' }
  | { kind: 'view'; lessonId: string }
  | { kind: 'edit'; lessonId: string }
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

  const [range, setRange] = useState<TimeRange | null>(null)
  const lessons = useLessons(range)
  const busy = useBusy(range)

  const [dialog, setDialog] = useState<Dialog>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null)
  const pendingAnswer = useRef<((save: boolean) => void) | null>(null)

  const onRangeChange = useCallback(
    (next: TimeRange) =>
      setRange((current) =>
        current && current.start === next.start && current.end === next.end ? current : next,
      ),
    [],
  )

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
          })
        : [],
    [lessons.data, busy.data, students.data, reference.data, teacherId, now],
  )

  const done = (message: string | null) => {
    setDialog(null)
    setNotice(message)
  }

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
    setNotice(null)
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
      setNotice('Čas je pomeren.')
    } catch (failure) {
      if (!(failure instanceof DeclinedError)) setError(explainError(failure, 'updateLesson'))
      throw failure
    }
  }

  const viewed =
    dialog && (dialog.kind === 'view' || dialog.kind === 'edit')
      ? lessons.data?.find((l) => l.id === dialog.lessonId)
      : undefined

  return (
    <>
      <PageHeader title={CONTEXT_LABEL.teacher}>
        <button type="button" className="button" onClick={() => setDialog({ kind: 'new' })}>
          Novi čas
        </button>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => setDialog({ kind: 'slot' })}
        >
          Objavi slobodan termin
        </button>
      </PageHeader>
      <Notice message={notice} />
      {error && (
        <p role="alert" className="form-error">
          {error}
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
                  onNotice={(message) => {
                    setError(null)
                    setNotice(message)
                  }}
                  onError={(message) => {
                    setNotice(null)
                    setError(message)
                  }}
                />

                {lessons.isError && (
                  <LoadError error={lessons.error} onRetry={() => void lessons.refetch()} />
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
                      onCreate={(selected) => setDialog({ kind: 'new', initial: selected })}
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
                  <LessonDialog
                    lesson={viewed}
                    reference={ref}
                    students={people}
                    onClose={() => setDialog(null)}
                    onEdit={() => setDialog({ kind: 'edit', lessonId: viewed.id })}
                    onDone={done}
                  />
                )}
                {dialog?.kind === 'edit' && viewed && (
                  <LessonFormDialog
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
