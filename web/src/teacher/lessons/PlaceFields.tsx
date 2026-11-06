import { SelectField } from '../../components/FormDialog'
import type { Reference } from '../teacherApi'
import type { PlaceState } from './usePlace'

export function PlaceFields({
  reference,
  place,
  disabled = false,
}: {
  reference: Reference
  place: PlaceState
  disabled?: boolean
}) {
  const rooms = reference.locations.find((l) => l.id === place.locationId)?.rooms ?? []
  // only where the teacher may teach; a lesson that is already somewhere else (the location was taken away later,
  // when it was over) keeps showing its own place
  const choices = reference.locations.filter(
    (l) => reference.ownLocationIds.includes(l.id) || l.id === place.locationId,
  )
  return (
    <>
      <SelectField
        label="Predmet"
        value={place.subjectId}
        onChange={place.setSubjectId}
        disabled={disabled}
      >
        {reference.subjects.map((subject) => (
          <option key={subject.id} value={subject.id}>
            {subject.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Lokacija"
        value={place.locationId}
        onChange={place.setLocationId}
        disabled={disabled}
      >
        {choices.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Učionica"
        value={place.roomId}
        onChange={place.setRoomId}
        disabled={disabled}
      >
        <option value="">Bez učionice</option>
        {rooms.map((room) => (
          <option key={room.id} value={room.id}>
            {room.name}
          </option>
        ))}
      </SelectField>
    </>
  )
}
