import { MAX_REASON } from '../lib/reason'

/** The optional reason for cancelling or declining. `hint` says who gets it: it travels only in the notification. */
export function ReasonField({
  value,
  onChange,
  hint,
}: {
  value: string
  onChange: (value: string) => void
  hint: string
}) {
  return (
    <>
      <label className="field">
        <span>Razlog (nije obavezan)</span>
        <textarea
          value={value}
          rows={2}
          maxLength={MAX_REASON}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <p className="muted">{hint}</p>
    </>
  )
}
