import { AdminError, type ActionKey } from './adminApi'

const GENERIC = 'Došlo je do greške. Pokušajte ponovo.'
const FORBIDDEN = 'Nemate dozvolu za ovu radnju.'

/** The Serbian message for a failed action. The database's own messages are for developers and never shown. */
export function explainError(error: unknown, action: ActionKey): string {
  if (!(error instanceof AdminError)) return GENERIC
  const { code, message } = error

  switch (code) {
    case 'network':
      return 'Nema veze sa serverom. Proverite internet vezu i pokušajte ponovo.'
    case 'expired':
      return 'Sesija je istekla. Osvežite stranicu i prijavite se ponovo.'
    case 'photoType':
      return 'Fotografija mora biti JPEG, PNG ili WebP.'
    case 'photoTooLarge':
      return 'Fotografija je prevelika (najviše 20 MB).'
    case 'photoUnreadable':
      return 'Fotografija ne može da se pročita. Probajte drugu.'
    case 'photoStillTooLarge':
      return 'Fotografija je prevelika i posle smanjivanja. Probajte manju.'
    case 'photoLimit':
      return 'Lokacija već ima tri fotografije.'
    case 'PT404':
      return 'Podatak više ne postoji. Osvežite stranicu.'
    case 'PT403':
    case '42501':
      if (action === 'changeEmail' && /own email/i.test(message)) {
        return 'Ne možete da promenite sopstvenu email adresu.'
      }
      return FORBIDDEN
    case '23514':
      return 'Uneta vrednost nije ispravna.'
  }

  switch (action) {
    case 'createTeacher':
      if (code === 'PT409') return 'Ova osoba je već nastavnik.'
      if (code === 'PT400') {
        if (/email/i.test(message)) return 'Email adresa nije ispravna.'
        if (/name/i.test(message)) return 'Ime i prezime su obavezni.'
        if (/subject/i.test(message)) return 'Izaberite bar jedan predmet.'
      }
      break
    case 'setSubjects':
      if (code === 'PT409' && /subject/i.test(message))
        return 'Nastavnik mora da ima bar jedan predmet.'
      break
    case 'changeEmail':
      if (code === 'PT409') return 'Ova adresa već pripada drugoj osobi.'
      if (code === 'PT400') return 'Email adresa nije ispravna.'
      break
    case 'deactivateTeacher':
      if (code === 'PT409') return 'Nastavnik je već deaktiviran.'
      break
    case 'reactivateTeacher':
      if (code === 'PT409') return 'Nastavnik je već aktivan.'
      break
    case 'addSubject':
    case 'renameSubject':
      if (code === '23505') return 'Predmet sa tim nazivom već postoji.'
      break
    case 'deleteSubject':
      if (code === '23503')
        return 'Predmet se koristi (kod nastavnika ili u časovima) i ne može da se obriše.'
      break
    case 'addLocation':
    case 'updateLocation':
      if (code === '23505') return 'Lokacija sa tim nazivom već postoji.'
      break
    case 'deleteLocation':
      if (code === '23503')
        return 'Lokacija ima učionice ili časove i ne može da se obriše. Prvo obrišite učionice.'
      break
    case 'addRoom':
    case 'renameRoom':
      if (code === '23505') return 'Učionica sa tim nazivom već postoji na ovoj lokaciji.'
      break
    case 'deleteRoom':
      if (code === '23503') return 'Učionica se koristi u časovima i ne može da se obriše.'
      break
    case 'approveTakeover':
    case 'rejectTakeover':
      if (code === 'PT409') {
        if (/already resolved/i.test(message)) return 'Zahtev je već obrađen.'
        if (/already has a teacher/i.test(message)) return 'Učenik već ima nastavnika.'
        if (/not active/i.test(message)) return 'Nastavnik koji traži učenika više nije aktivan.'
        if (/already a student of/i.test(message)) return 'Ta osoba je već učenik tog nastavnika.'
      }
      break
  }
  return GENERIC
}
