import { FormDialog } from './FormDialog'

/**
 * Asks before a student record is deleted, and says what that costs: the person and the parents who have no other
 * child go with it, and the lessons still to come are cancelled. Shared by the teacher's and the administrator's screens;
 * the database refuses a student who has a lesson recorded as held, whatever the screen shows.
 */
export function DeleteStudentDialog({
  name,
  upcoming,
  onDelete,
  onClose,
  onDone,
}: {
  name: string
  /** Lessons that have not started yet and would be cancelled. */
  upcoming: number
  onDelete: () => Promise<void>
  onClose: () => void
  onDone: (message: string) => void
}) {
  return (
    <FormDialog
      title="Brisanje učenika"
      action="deleteStudent"
      submitLabel="Obriši"
      danger
      onClose={onClose}
      onSubmit={async () => {
        await onDelete()
        onDone('Učenik je obrisan.')
      }}
    >
      <p>
        Brišete učenika <strong>{name}</strong>. Učenik nestaje iz sistema, a sa njim i roditelji
        koji nemaju drugo dete. Ovo ne može da se poništi.
      </p>
      {upcoming > 0 && (
        <p>
          Zakazani časovi koji će biti otkazani: <strong>{upcoming}</strong>. Ostali učesnici tih
          časova dobijaju obaveštenje.
        </p>
      )}
    </FormDialog>
  )
}
