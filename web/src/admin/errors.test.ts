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

  it('says which limit was reached when there were too many requests', () => {
    for (const action of ['addStudent', 'addUnassignedStudent'] as const) {
      expect(explain('PT429', action, 'too many requests, try again later')).toBe(
        'Dodali ste najveći dozvoljen broj učenika za 24 sata (30). Pokušajte ponovo sutra.',
      )
    }
    for (const action of ['scheduleLesson', 'publishSlot'] as const) {
      expect(explain('PT429', action, 'too many lessons created in an hour')).toBe(
        'Za poslednjih sat vremena napravljeno je najviše dozvoljenih 100 časova. Pokušajte ponovo kasnije.',
      )
    }
    expect(explain('PT429', 'addSubject')).toBe(
      'Previše zahteva u kratkom roku. Pokušajte ponovo kasnije.',
    )
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

    it('erase, and what an erased record cannot do any more', () => {
      expect(explain('PT404', 'eraseTeacher')).toBe('Nastavnik više ne postoji. Osvežite stranicu.')
      expect(explain('PT409', 'eraseTeacher', 'an administrator cannot be erased')).toBe(
        'Administrator se ne briše ovde. Prvo mu oduzmite ulogu administratora.',
      )
      expect(explain('PT409', 'eraseTeacher', 'this person was already erased')).toBe(
        'Nalog je već obrisan. Osvežite stranicu.',
      )
      expect(explain('PT409', 'reactivateTeacher', 'this person was erased')).toBe(
        'Obrisani nalog ne može da se vrati. Osvežite stranicu.',
      )
      expect(explain('PT409', 'changeEmail', 'this person was erased')).toBe(
        'Obrisani nalog ne može da dobije novu email adresu.',
      )
    })
  })

  describe('the teacher’s own screens', () => {
    it('say when the student or the parent link is already gone', () => {
      expect(explain('PT404', 'updateStudent')).toBe('Učenik više nije kod vas. Osvežite stranicu.')
      expect(explain('PT404', 'removeParent')).toBe(
        'Roditelj više nije povezan sa ovim učenikom. Osvežite stranicu.',
      )
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

  describe('signing up for lessons', () => {
    it('explains why the person cannot sign up', () => {
      expect(explain('PT403', 'startEnrolment')).toBe(
        'Prijava za časove trenutno nije dostupna. Pozovite nas na 064 4994 235.',
      )
      expect(explain('PT400', 'startEnrolment', 'nobody teaches this subject')).toBe(
        'Za izabrani predmet trenutno nema nastavnika. Izaberite drugi.',
      )
      expect(
        explain('PT409', 'startEnrolment', 'this person is already a member of the school'),
      ).toBe('Ovaj nalog već pripada školi. Prijavite se na početnoj strani.')
      expect(explain('PT409', 'startEnrolment', 'this person was erased')).toBe(
        'Ovaj nalog ne može da se prijavi za časove.',
      )
    })

    it('explains what is wrong with the profile', () => {
      const profile = (message: string) => explain('PT400', 'completeEnrolmentProfile', message)
      expect(profile('first and last name are required')).toBe('Upišite ime i prezime učenika.')
      expect(profile('a valid phone number is required')).toContain('Broj telefona nije ispravan')
      expect(profile('the school is required')).toBe('Upišite školu.')
      expect(profile('the grade is required')).toBe('Upišite razred.')
      expect(profile('the privacy policy has to be accepted')).toBe(
        'Prihvatite politiku privatnosti da biste nastavili.',
      )
      expect(profile('the text is too long')).toBe('Neki tekst je predugačak.')
      expect(explain('PT409', 'completeEnrolmentProfile')).toBe(
        'Nastavnik je već izabran, pa se profil više ne menja.',
      )
    })

    it('explains why a choice is refused', () => {
      expect(explain('PT409', 'chooseTeacher', 'the choice is not open yet')).toBe(
        'Izbor još nije otvoren.',
      )
      expect(explain('PT409', 'chooseTeacher', 'a teacher was already chosen')).toBe(
        'Nastavnik je već izabran. Osvežite stranicu.',
      )
      expect(
        explain('PT409', 'chooseTeacher', 'this person is already a student of that teacher'),
      ).toBe('Već ste učenik ovog nastavnika.')
      expect(explain('PT400', 'chooseTeacher', 'this teacher has not offered')).toBe(
        'Taj nastavnik više ne nudi časove. Izaberite drugog.',
      )
      expect(explain('PT400', 'setEnrolmentSubject', 'nobody teaches this subject')).toBe(
        'Za izabrani predmet trenutno nema nastavnika. Izaberite drugi.',
      )
      expect(explain('PT409', 'setEnrolmentSubject')).toBe('Predmet se više ne menja.')
    })

    it('tells a teacher what an offer needs', () => {
      expect(explain('PT409', 'offerEnrolment', 'write the about text of your CV first')).toBe(
        'Prvo napišite opis u svom CV-u (odeljak „O meni“), jer po njemu učenik bira nastavnika.',
      )
      expect(explain('PT409', 'offerEnrolment', 'this person is already your student')).toBe(
        'Ova osoba je već vaš učenik.',
      )
      expect(explain('PT404', 'offerEnrolment', 'request not found')).toBe(
        'Prijava više nije dostupna. Osvežite stranicu.',
      )
      expect(explain('PT409', 'withdrawOffer', 'a teacher was already chosen')).toBe(
        'Nastavnik je već izabran. Osvežite stranicu.',
      )
    })

    it("tells a teacher what is wrong with the child's email", () => {
      const complete = (message: string) => explain('PT400', 'completeChosenEnrolment', message)
      expect(complete('the child needs an email of their own')).toBe(
        'Dete mora da ima svoju email adresu, različitu od roditeljeve.',
      )
      expect(complete('invalid email')).toBe('Email adresa nije ispravna.')
      expect(complete("the child's email is required")).toBe('Upišite email adresu deteta.')
      expect(
        explain('PT409', 'completeChosenEnrolment', 'this request is not waiting for an email'),
      ).toBe('Ova prijava više ne čeka email adresu. Osvežite stranicu.')
      expect(
        explain(
          'PT409',
          'completeChosenEnrolment',
          'this person is already a student of that teacher',
        ),
      ).toBe('Ta osoba je već vaš učenik.')
    })

    it('explains why a student cannot be added to the pool', () => {
      const add = (code: string, message: string) => explain(code, 'addUnassignedStudent', message)
      expect(add('PT409', 'this person is already waiting for a teacher')).toBe(
        'Ovaj učenik već čeka nastavnika.',
      )
      expect(add('PT400', 'nobody teaches this subject')).toBe(
        'Za izabrani predmet trenutno nema nastavnika.',
      )
      expect(add('PT400', 'a valid phone number is required')).toContain(
        'Broj telefona nije ispravan',
      )
      expect(add('PT400', 'invalid email')).toBe('Email adresa nije ispravna.')
      expect(add('PT400', 'school and grade are required')).toBe('Upišite školu i razred.')
      expect(add('PT400', 'first and last name are required')).toBe('Ime i prezime su obavezni.')
    })

    it('explains what the administrator cannot do', () => {
      expect(explain('PT400', 'saveEnrolmentSettings', 'invalid settings')).toBe(
        'Neka vrednost je van dozvoljenih granica.',
      )
      expect(explain('PT404', 'approveEnrolment', 'request not found')).toContain('već obrađena')
      expect(explain('PT404', 'rejectEnrolment', 'request not found')).toContain(
        'već ima svoj zapis',
      )
      expect(explain('PT409', 'assignEnrolment', 'the profile is not complete yet')).toBe(
        'Profil još nije popunjen, pa nastavnik ne može da se dodeli.',
      )
      expect(
        explain('PT409', 'assignEnrolment', 'this person is already a student of that teacher'),
      ).toBe('Ta osoba je već učenik tog nastavnika.')
      expect(explain('PT409', 'assignEnrolment', 'the student already has a teacher')).toBe(
        'Učenik već ima nastavnika. Osvežite stranicu.',
      )
      expect(explain('PT400', 'assignEnrolment', 'unknown teacher')).toBe(
        'Izabrani nastavnik nije aktivan.',
      )
      expect(explain('PT400', 'assignEnrolment', 'the child needs an email of their own')).toBe(
        'Dete mora da ima svoju email adresu, različitu od roditeljeve.',
      )
      expect(explain('PT400', 'assignEnrolment', 'invalid email')).toBe(
        'Email adresa nije ispravna.',
      )
      expect(explain('PT404', 'assignEnrolment', 'request not found')).toBe(
        'Prijava više ne postoji. Osvežite stranicu.',
      )
    })
  })

  describe('a reason for cancelling', () => {
    it('says that a reason is too long, for every way of cancelling', () => {
      for (const action of ['cancelLesson', 'declineBooking'] as const) {
        expect(explain('PT400', action, 'the reason is too long')).toBe(
          'Razlog je predugačak (najviše 200 znakova).',
        )
      }
    })
  })

  describe('paid', () => {
    it('says what is wrong when a mark cannot be set', () => {
      expect(explain('PT404', 'setPaid')).toBe('Čas ili učenik više ne postoji. Osvežite stranicu.')
      expect(explain('PT403', 'setPaid')).toBe('Nemate dozvolu za ovu radnju.')
    })
  })

  describe('deleting a student', () => {
    it('says that a student who has a held lesson stays', () => {
      expect(
        explain(
          'PT409',
          'deleteStudent',
          'a student with a lesson that took place cannot be deleted',
        ),
      ).toBe('Učenik ima održan čas i ne može da se obriše.')
    })

    it('says when the student is gone already, or the person may not delete them', () => {
      expect(explain('PT404', 'deleteStudent')).toBe('Učenik više ne postoji. Osvežite stranicu.')
      expect(explain('PT403', 'deleteStudent')).toBe('Nemate dozvolu za ovu radnju.')
    })
  })
})
