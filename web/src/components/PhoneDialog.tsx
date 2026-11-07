import { useState } from 'react'
import { normalizePhone, PHONE_EXAMPLE, phoneProblem } from '../lib/phone'
import { Field, FormDialog } from './FormDialog'

/**
 * Sets or changes somebody's phone number. A number that is required (a teacher's, a parent's) cannot be emptied; an
 * optional one (a student's) is taken away by emptying the field. `current` is the number as stored.
 */
export function PhoneDialog({
  personName,
  current,
  required,
  save,
  onClose,
  onDone,
}: {
  personName: string
  current: string | null
  required: boolean
  /** Saves the number in the international form, or null to take it away. */
  save: (phone: string | null) => Promise<void>
  onClose: () => void
  onDone: (message: string | null) => void
}) {
  const [typed, setTyped] = useState(current ?? '')

  return (
    <FormDialog
      title="Broj telefona"
      action="setPhone"
      submitLabel="Sačuvaj"
      onClose={onClose}
      validate={() => phoneProblem(typed, required)}
      onSubmit={async () => {
        const next = typed.trim() === '' ? null : normalizePhone(typed)
        if (next === current) {
          onDone(null)
          return
        }
        await save(next)
        onDone(next === null ? 'Broj telefona je uklonjen.' : 'Broj telefona je sačuvan.')
      }}
    >
      <p>
        Za: <strong>{personName}</strong>. Upišite broj sa pozivnim brojem države, na primer{' '}
        {PHONE_EXAMPLE}.{!required && ' Ostavite prazno da uklonite broj.'}
      </p>
      <Field
        label={required ? 'Broj telefona' : 'Broj telefona (nije obavezan)'}
        type="tel"
        value={typed}
        onChange={setTyped}
        maxLength={30}
        autoComplete="off"
      />
    </FormDialog>
  )
}

/** A number under a name, or the mark that a person who should have one has none. */
export function PhoneLine({ phone, required }: { phone: string | null; required: boolean }) {
  if (phone) return <div className="muted">{phone}</div>
  return required ? (
    <div>
      <span className="badge badge--warn">nedostaje broj</span>
    </div>
  ) : null
}
