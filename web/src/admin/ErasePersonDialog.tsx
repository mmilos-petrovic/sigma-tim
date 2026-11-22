import { useState } from 'react'
import { Field, FormDialog } from '../components/FormDialog'
import { sameName } from './names'

/**
 * Asks before everything about a person is erased on their request. It says what goes, what stays and what is out of
 * reach, and wants the person's name typed: there is no way back. The database refuses an administrator, a teacher and a
 * parent who still has a child, whatever the screen shows.
 */
export function ErasePersonDialog({
  name,
  upcoming = 0,
  held = 0,
  isStudent,
  onErase,
  onClose,
  onDone,
}: {
  name: string
  /** Lessons still to come that the person is on: they are cancelled or leave without the person. */
  upcoming?: number
  /** Lessons that took place with the person: they stay on the teacher's record, without the person. */
  held?: number
  isStudent: boolean
  onErase: () => Promise<void>
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [typed, setTyped] = useState('')

  return (
    <FormDialog
      title="Brisanje na zahtev"
      action="erasePerson"
      submitLabel="Obriši sve podatke"
      danger
      onClose={onClose}
      validate={() => (sameName(typed, name) ? null : 'Upišite ime i prezime radi potvrde.')}
      onSubmit={async () => {
        await onErase()
        onDone('Podaci osobe su obrisani.')
      }}
    >
      <p>
        Brišete sve podatke osobe <strong>{name}</strong>, na njen zahtev. Ovo ne može da se
        poništi.
      </p>
      <p>
        Briše se: nalog, broj telefona, uređaji za obaveštenja, prijave za časove, obaveštenja
        namenjena osobi i Google nalog za prijavu. Ime osobe se uklanja i iz tuđih obaveštenja.
        Email adresa se oslobađa i može ponovo da se doda.
      </p>
      {isStudent && (
        <>
          <p>
            Roditelji koji nemaju drugo dete gube pristup. Časovi koji nisu počeli otkazuju se ili
            idu dalje bez ove osobe, a ostali učesnici dobijaju obaveštenje
            {upcoming > 0 && (
              <>
                {' '}
                (časova: <strong>{upcoming}</strong>)
              </>
            )}
            .
          </p>
          <p>
            Održani časovi ostaju u evidenciji nastavnika, ali bez imena ove osobe
            {held > 0 && (
              <>
                {' '}
                (časova: <strong>{held}</strong>)
              </>
            )}
            . Oznaka da je čas plaćen briše se zajedno sa osobom.
          </p>
        </>
      )}
      <p className="muted">
        Poruke koje su već poslate emailom ostaju u poštanskim sandučićima primalaca, a tekst koji
        je nastavnik slobodno upisao u beleške časova ne pretražuje se.
      </p>
      <Field
        label={`Za potvrdu upišite ime i prezime: ${name}`}
        value={typed}
        onChange={setTyped}
        maxLength={200}
        autoComplete="off"
      />
    </FormDialog>
  )
}
