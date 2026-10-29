import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { ActionKey } from '../admin/adminApi'
import { explainError } from '../admin/errors'
import { Dialog } from './Dialog'

/**
 * A dialog with a form (or just a question). It checks the input first (`validate` returns a message), then runs
 * `onSubmit`; if that throws, the failure is explained in Serbian and the form stays as it was. It cannot be sent twice.
 */
export function FormDialog({
  title,
  action,
  submitLabel,
  onSubmit,
  onClose,
  validate,
  disabled = false,
  danger = false,
  children,
}: {
  title: string
  action: ActionKey
  submitLabel: string
  onSubmit: () => Promise<void>
  onClose: () => void
  validate?: () => string | null
  /** Blocks sending, for example while the consequences are still being loaded. */
  disabled?: boolean
  danger?: boolean
  children?: ReactNode
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (inFlight.current) return
    const problem = validate?.() ?? null
    if (problem) {
      setError(problem)
      return
    }
    inFlight.current = true
    setError(null)
    setBusy(true)
    try {
      await onSubmit()
    } catch (failure) {
      setError(explainError(failure, action))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <Dialog title={title} onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} noValidate>
        {children}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="actions actions--end">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Odustani
          </button>
          <button
            type="submit"
            className={`button${danger ? ' button--danger' : ''}`}
            disabled={busy || disabled}
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export function Field({
  label,
  value,
  onChange,
  maxLength,
  type = 'text',
  autoComplete = 'off',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  maxLength?: number
  type?: string
  autoComplete?: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

export function SubjectChoice({
  subjects,
  selected,
  onChange,
}: {
  subjects: { id: string; name: string }[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  return (
    <fieldset className="choice">
      <legend>Predmeti</legend>
      {subjects.map((subject) => (
        <label key={subject.id} className="check">
          <input
            type="checkbox"
            checked={selected.includes(subject.id)}
            onChange={(event) =>
              // keeps the order of choosing; what is shown to the admin is sorted by name anyway
              onChange(
                event.target.checked
                  ? [...selected, subject.id]
                  : selected.filter((id) => id !== subject.id),
              )
            }
          />
          <span>{subject.name}</span>
        </label>
      ))}
    </fieldset>
  )
}
