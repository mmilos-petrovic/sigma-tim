import { useRef, useState } from 'react'
import { explainError } from '../../admin/errors'
import { Loaded, Notice, PageHeader } from '../../components/Loaded'
import { COLOR_KEYS, COLORS, OWN_COLOR, type ColorKey } from '../colors'
import { useRefresh, useReference, useTeacherId } from '../queries'
import { useTeacherApi } from '../TeacherApiProvider'

function ColorForm({ saved }: { saved: ColorKey | null }) {
  const api = useTeacherApi()
  const refresh = useRefresh()
  const teacherId = useTeacherId()
  const [choice, setChoice] = useState<ColorKey | null>(saved)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const save = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setNotice(null)
    setError(null)
    try {
      await api.setColor(teacherId, choice)
      await refresh()
      setNotice('Boja je sačuvana.')
    } catch (failure) {
      setError(explainError(failure, 'setColor'))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <form
      className="settings"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <Notice message={notice} />
      <fieldset className="choice colors">
        <legend>Boja u kalendaru</legend>
        <p className="muted">
          Kolege vide ovu boju na vašim časovima. Menja se na svim vašim časovima, prošlim i
          budućim. Dva nastavnika mogu imati istu boju.
        </p>
        <label className="check color-option">
          <input
            type="radio"
            name="color"
            checked={choice === null}
            onChange={() => setChoice(null)}
          />
          <span
            className="swatch swatch--none"
            aria-hidden="true"
            style={{ borderColor: OWN_COLOR }}
          />
          <span>Bez izbora (podrazumevana boja)</span>
        </label>
        {COLOR_KEYS.map((key) => (
          <label key={key} className="check color-option">
            <input
              type="radio"
              name="color"
              checked={choice === key}
              onChange={() => setChoice(key)}
            />
            <span
              className="swatch"
              aria-hidden="true"
              style={{ backgroundColor: COLORS[key].hex }}
            />
            <span>{COLORS[key].label}</span>
          </label>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="button" disabled={busy || choice === saved}>
          Sačuvaj
        </button>
      </div>
    </form>
  )
}

/** What a teacher decides for themselves; for now the colour their lessons have in everybody's calendar. */
export function SettingsPage() {
  const reference = useReference()
  return (
    <>
      <PageHeader title="Podešavanja" />
      <Loaded query={reference}>{(ref) => <ColorForm saved={ref.color} />}</Loaded>
    </>
  )
}
