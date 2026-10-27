import { describe, expect, it } from 'vitest'
import { AdminError, type ActionKey } from './adminApi'
import { explainError } from './errors'

const explain = (code: string, action: ActionKey, message = code) =>
  explainError(new AdminError(code, message), action)

describe('explainError', () => {
  it('says "no connection" for a network failure, whatever the action', () => {
    expect(explain('network', 'addSubject')).toBe(
      'Nema veze sa serverom. Proverite internet vezu i pokušajte ponovo.',
    )
    expect(explain('network', 'load')).toMatch(/^Nema veze/)
  })

  it('asks the person to sign in again when the session is gone', () => {
    expect(explain('expired', 'addSubject')).toBe(
      'Sesija je istekla. Osvežite stranicu i prijavite se ponovo.',
    )
  })

  it('has a generic message for anything unknown, including plain errors', () => {
    expect(explain('unknown', 'addSubject')).toBe('Došlo je do greške. Pokušajte ponovo.')
    expect(explain('XX000', 'addSubject')).toBe('Došlo je do greške. Pokušajte ponovo.')
    expect(explainError(new Error('boom'), 'addSubject')).toBe(
      'Došlo je do greške. Pokušajte ponovo.',
    )
    expect(explainError('nonsense', 'addSubject')).toBe('Došlo je do greške. Pokušajte ponovo.')
  })

  it('explains permission and missing-data errors the same way everywhere', () => {
    expect(explain('PT403', 'createTeacher', 'not allowed')).toBe('Nemate dozvolu za ovu radnju.')
    expect(explain('42501', 'addSubject')).toBe('Nemate dozvolu za ovu radnju.')
    expect(explain('PT404', 'deactivateTeacher')).toBe(
      'Podatak više ne postoji. Osvežite stranicu.',
    )
  })

  describe('teachers', () => {
    it('createTeacher', () => {
      expect(explain('PT409', 'createTeacher', 'this person is already a teacher')).toBe(
        'Ova osoba je već nastavnik.',
      )
      expect(explain('PT400', 'createTeacher', 'invalid email')).toBe('Email adresa nije ispravna.')
      expect(explain('PT400', 'createTeacher', 'first and last name are required')).toBe(
        'Ime i prezime su obavezni.',
      )
      expect(explain('PT400', 'createTeacher', 'a teacher needs at least one subject')).toBe(
        'Izaberite bar jedan predmet.',
      )
    })

    it('setSubjects keeps at least one subject', () => {
      expect(explain('PT409', 'setSubjects', 'a teacher needs at least one subject')).toBe(
        'Nastavnik mora da ima bar jedan predmet.',
      )
    })

    it('changeEmail', () => {
      expect(explain('PT409', 'changeEmail', 'this email already belongs to another person')).toBe(
        'Ova adresa već pripada drugoj osobi.',
      )
      expect(explain('PT403', 'changeEmail', 'you cannot change your own email')).toBe(
        'Ne možete da promenite sopstvenu email adresu.',
      )
      expect(explain('PT403', 'changeEmail', 'not allowed')).toBe('Nemate dozvolu za ovu radnju.')
      expect(explain('PT400', 'changeEmail', 'invalid email')).toBe('Email adresa nije ispravna.')
    })

    it('deactivate and reactivate', () => {
      expect(explain('PT409', 'deactivateTeacher')).toBe('Nastavnik je već deaktiviran.')
      expect(explain('PT409', 'reactivateTeacher')).toBe('Nastavnik je već aktivan.')
    })
  })

  describe('subjects, locations and rooms', () => {
    it('duplicate names', () => {
      expect(explain('23505', 'addSubject')).toBe('Predmet sa tim nazivom već postoji.')
      expect(explain('23505', 'renameSubject')).toBe('Predmet sa tim nazivom već postoji.')
      expect(explain('23505', 'addLocation')).toBe('Lokacija sa tim nazivom već postoji.')
      expect(explain('23505', 'updateLocation')).toBe('Lokacija sa tim nazivom već postoji.')
      expect(explain('23505', 'addRoom')).toBe(
        'Učionica sa tim nazivom već postoji na ovoj lokaciji.',
      )
      expect(explain('23505', 'renameRoom')).toBe(
        'Učionica sa tim nazivom već postoji na ovoj lokaciji.',
      )
    })

    it('things that are still in use cannot be deleted', () => {
      expect(explain('23503', 'deleteSubject')).toBe(
        'Predmet se koristi (kod nastavnika ili u časovima) i ne može da se obriše.',
      )
      expect(explain('23503', 'deleteLocation')).toBe(
        'Lokacija ima učionice ili časove i ne može da se obriše. Prvo obrišite učionice.',
      )
      expect(explain('23503', 'deleteRoom')).toBe(
        'Učionica se koristi u časovima i ne može da se obriše.',
      )
    })

    it('invalid values', () => {
      expect(explain('23514', 'addSubject')).toBe('Uneta vrednost nije ispravna.')
    })
  })

  describe('photos', () => {
    it('client-side problems', () => {
      expect(explain('photoType', 'addPhoto')).toBe('Fotografija mora biti JPEG, PNG ili WebP.')
      expect(explain('photoTooLarge', 'addPhoto')).toBe('Fotografija je prevelika (najviše 20 MB).')
      expect(explain('photoUnreadable', 'addPhoto')).toBe(
        'Fotografija ne može da se pročita. Probajte drugu.',
      )
      expect(explain('photoStillTooLarge', 'addPhoto')).toBe(
        'Fotografija je prevelika i posle smanjivanja. Probajte manju.',
      )
      expect(explain('photoLimit', 'addPhoto')).toBe('Lokacija već ima tri fotografije.')
    })

    it('a refused upload', () => {
      expect(explain('PT403', 'addPhoto')).toBe('Nemate dozvolu za ovu radnju.')
    })
  })

  describe('takeover requests', () => {
    it('explains why a request cannot be answered', () => {
      expect(explain('PT409', 'approveTakeover', 'the request is already resolved')).toBe(
        'Zahtev je već obrađen.',
      )
      expect(explain('PT409', 'rejectTakeover', 'the request is already resolved')).toBe(
        'Zahtev je već obrađen.',
      )
      expect(explain('PT409', 'approveTakeover', 'the student already has a teacher')).toBe(
        'Učenik već ima nastavnika.',
      )
      expect(explain('PT409', 'approveTakeover', 'the requesting teacher is not active')).toBe(
        'Nastavnik koji traži učenika više nije aktivan.',
      )
      expect(
        explain('PT409', 'approveTakeover', 'this person is already a student of that teacher'),
      ).toBe('Ta osoba je već učenik tog nastavnika.')
    })
  })
})
