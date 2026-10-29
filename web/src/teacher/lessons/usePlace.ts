import { useState } from 'react'
import type { Reference } from '../teacherApi'

export interface PlaceState {
  subjectId: string
  locationId: string
  /** Empty for "no room". */
  roomId: string
  setSubjectId: (id: string) => void
  setLocationId: (id: string) => void
  setRoomId: (id: string) => void
}

/** The subject, location and room of a lesson or slot; the first subject and location unless told otherwise. */
export function usePlace(
  reference: Reference,
  initial?: { subjectId: string; locationId: string; roomId: string | null },
): PlaceState {
  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? reference.subjects[0]?.id ?? '')
  const [locationId, setLocationIdState] = useState(
    initial?.locationId ?? reference.locations[0]?.id ?? '',
  )
  const [roomId, setRoomId] = useState(initial?.roomId ?? '')
  return {
    subjectId,
    locationId,
    roomId,
    setSubjectId,
    // rooms belong to a location: a room of the old one cannot stay selected
    setLocationId: (id) => {
      setLocationIdState(id)
      setRoomId('')
    },
    setRoomId,
  }
}
