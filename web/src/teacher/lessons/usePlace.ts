import { useState } from 'react'
import { ownLocations, type Reference } from '../teacherApi'

export interface PlaceState {
  subjectId: string
  locationId: string
  /** Empty for "no room". */
  roomId: string
  setSubjectId: (id: string) => void
  setLocationId: (id: string) => void
  setRoomId: (id: string) => void
}

/** The room of a location that has just one: the form does not ask for it, so the lesson is held there. */
export function soleRoomId(reference: Reference, locationId: string): string {
  const rooms = reference.locations.find((location) => location.id === locationId)?.rooms ?? []
  return rooms.length === 1 ? rooms[0].id : ''
}

/**
 * The subject, location and room of a lesson or slot; the first subject and the first location the teacher may use unless
 * told otherwise. A new one in a location with a single room is held in that room.
 */
export function usePlace(
  reference: Reference,
  initial?: { subjectId: string; locationId: string; roomId: string | null },
): PlaceState {
  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? reference.subjects[0]?.id ?? '')
  const [locationId, setLocationIdState] = useState(
    initial?.locationId ?? ownLocations(reference)[0]?.id ?? '',
  )
  const [roomId, setRoomId] = useState(
    initial ? (initial.roomId ?? '') : soleRoomId(reference, locationId),
  )
  return {
    subjectId,
    locationId,
    roomId,
    setSubjectId,
    // rooms belong to a location: a room of the old one cannot stay selected
    setLocationId: (id) => {
      setLocationIdState(id)
      setRoomId(soleRoomId(reference, id))
    },
    setRoomId,
  }
}
