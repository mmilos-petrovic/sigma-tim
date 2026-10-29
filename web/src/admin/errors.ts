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
      // a free slot cannot be published or moved into the past (a row-level-security check)
      if (code === '42501' && (action === 'publishSlot' || action === 'updateLesson')) {
        return 'Slobodan termin mora biti u budućnosti.'
      }
      if (action === 'changeEmail' && /own email/i.test(message)) {
        return 'Ne možete da promenite sopstvenu email adresu.'
      }
      if (action === 'changeStudentEmail') {
        return 'Email adresu ove osobe može da promeni samo administrator.'
      }
      return FORBIDDEN
    case '23514':
      if (action === 'scheduleLesson' || action === 'updateLesson' || action === 'publishSlot') {
        return 'Vreme mora biti na svakih 15 minuta, a kraj posle početka.'
      }
      if (action === 'setNote') return 'Napomena je predugačka (najviše 2000 znakova).'
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
    case 'addStudent':
      if (code === 'PT409') return 'Ovaj učenik je već među vašim učenicima.'
      if (code === 'PT400') {
        if (/email/i.test(message)) return 'Email adresa nije ispravna.'
        if (/name/i.test(message)) return 'Ime i prezime su obavezni.'
      }
      break
    case 'changeStudentEmail':
      if (code === 'PT400') return 'Email adresa nije ispravna.'
      if (code === 'PT409') {
        if (/another teacher/i.test(message)) {
          return 'Ova osoba je povezana i sa drugim nastavnikom. Email adresu može da promeni administrator.'
        }
        return 'Ova adresa već pripada drugoj osobi.'
      }
      break
    case 'updateStudent':
      if (code === 'PT404') return 'Učenik više nije kod vas. Osvežite stranicu.'
      break
    case 'renamePerson':
      if (code === 'PT400') return 'Ime i prezime su obavezni (najviše 100 znakova).'
      break
    case 'addParent':
      if (code === 'PT409') return 'Učenik već ima dva roditelja.'
      if (code === 'PT400') {
        if (/email/i.test(message)) return 'Email adresa nije ispravna.'
        if (/name/i.test(message)) return 'Ime i prezime su obavezni.'
      }
      break
    case 'removeParent':
      if (code === 'PT404') return 'Roditelj više nije povezan sa ovim učenikom. Osvežite stranicu.'
      break
    case 'requestTakeover':
      if (code === 'PT409') {
        if (/pending request/i.test(message)) return 'Zahtev za ovog učenika je već poslat.'
        return 'Učenik je u međuvremenu dobio nastavnika. Osvežite stranicu.'
      }
      break
    case 'scheduleLesson':
    case 'updateLesson':
    case 'publishSlot':
      if (code === 'PT409' && action === 'updateLesson') {
        if (/outcome/i.test(message)) {
          return 'Čas ima upisan ishod i ne može da se menja. Prvo obrišite ishod.'
        }
        return 'Dan ovog časa je prošao: predmet, mesto i vreme se više ne menjaju.'
      }
      if (code === 'PT400') {
        if (/passed/i.test(message)) {
          return action === 'updateLesson'
            ? 'Čas ne može da se pomeri na dan koji je prošao.'
            : 'Čas ne može da počne na dan koji je prošao.'
        }
        if (/teach/i.test(message)) return 'Ne predajete taj predmet.'
        if (/at least one student/i.test(message)) return 'Izaberite bar jednog učenika.'
        if (/too many/i.test(message)) return 'U času može biti najviše 4 učenika.'
      }
      if (code === '23503') return 'Učionica ne pripada izabranoj lokaciji.'
      break
    case 'setLessonStudents':
      if (code === 'PT409') return 'Učenike možete da menjate samo kod potvrđenog časa.'
      if (code === 'PT400') {
        if (/too many/i.test(message)) return 'U času može biti najviše 4 učenika.'
        return 'Izaberite bar jednog učenika.'
      }
      break
    case 'cancelLesson':
      if (code === 'PT409') return 'Čas je već počeo i ne može da se otkaže.'
      break
    case 'confirmBooking':
    case 'declineBooking':
      if (code === 'PT409') {
        if (/started/i.test(message)) {
          return 'Čas je već počeo, pa se zahtev više ne može odbiti. Potvrdite ga.'
        }
        return 'Zahtev više nije na čekanju. Osvežite stranicu.'
      }
      break
    case 'setOutcome':
      if (code === 'PT400') return 'Ishod se upisuje tek kada se potvrđen čas završi.'
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
