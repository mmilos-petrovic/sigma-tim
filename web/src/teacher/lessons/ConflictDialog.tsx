import { Dialog } from '../../components/Dialog'
import { describeConflict } from '../scheduleItems'
import type { Conflict, Reference } from '../teacherApi'

/** Asked when a dragged lesson would overlap another one. Answering "no" puts the lesson back. */
export function ConflictDialog({
  conflicts,
  teacherId,
  reference,
  onAnswer,
}: {
  conflicts: Conflict[]
  teacherId: string
  reference: Reference
  onAnswer: (save: boolean) => void
}) {
  return (
    <Dialog title="Preklapanje" onClose={() => onAnswer(false)}>
      <ul>
        {conflicts.map((conflict) => (
          <li key={`${conflict.teacherId}${conflict.start}`}>
            {describeConflict(conflict, teacherId, reference)}
          </li>
        ))}
      </ul>
      <p>Možete da sačuvate čas i pored upozorenja.</p>
      <div className="actions actions--end">
        <button type="button" className="button button--secondary" onClick={() => onAnswer(false)}>
          Ne pomeraj
        </button>
        <button type="button" className="button" onClick={() => onAnswer(true)}>
          Sačuvaj i pored upozorenja
        </button>
      </div>
    </Dialog>
  )
}
