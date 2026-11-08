import type { MyLesson } from '../studentApi'

/** The text of the cancel button and dialog: a booked slot is cancelled as a booking. */
export const cancelLabel = (lesson: Pick<MyLesson, 'origin'>) =>
  lesson.origin === 'slot' ? 'Otkaži rezervaciju' : 'Otkaži čas'
