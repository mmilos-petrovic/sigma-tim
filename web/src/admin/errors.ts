import { INVALID_PHONE } from '../lib/phone'
import { AdminError, type ActionKey } from './adminApi'

const GENERIC = 'Došlo je do greške. Pokušajte ponovo.'
const FORBIDDEN = 'Nemate dozvolu za ovu radnju.'
const TOO_LONG_REASON = 'Razlog je predugačak (najviše 200 znakova).'

/** A refused phone number: not a number, or missing for somebody who needs one (`who`: "nastavnika", "roditelja"). */
const phoneMessage = (message: string, who: string) =>
  /invalid/i.test(message) ? INVALID_PHONE : `Unesite broj telefona ${who}.`

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
    case 'PT429':
      // a limit of the database was reached (supabase/README.md, "Limits")
      if (action === 'addStudent' || action === 'addUnassignedStudent') {
        return 'Dodali ste najveći dozvoljen broj učenika za 24 sata (30). Pokušajte ponovo sutra.'
      }
      if (action === 'scheduleLesson' || action === 'publishSlot') {
        return 'Za poslednjih sat vremena napravljeno je najviše dozvoljenih 100 časova. Pokušajte ponovo kasnije.'
      }
      return 'Previše zahteva u kratkom roku. Pokušajte ponovo kasnije.'
    case 'PT404':
      if (action === 'eraseTeacher' || action === 'grantAdmin') {
        return 'Nastavnik više ne postoji. Osvežite stranicu.'
      }
      if (action === 'revokeAdmin') return 'Osoba više ne postoji. Osvežite stranicu.'
      if (action === 'erasePerson') return 'Osoba više ne postoji. Osvežite stranicu.'
      if (action === 'updateStudent') return 'Učenik više nije kod vas. Osvežite stranicu.'
      if (action === 'removeParent') {
        return 'Roditelj više nije povezan sa ovim učenikom. Osvežite stranicu.'
      }
      if (action === 'cancelLesson') return 'Čas više ne postoji. Osvežite stranicu.'
      if (action === 'setPaid') return 'Čas ili učenik više ne postoji. Osvežite stranicu.'
      if (action === 'deleteStudent') return 'Učenik više ne postoji. Osvežite stranicu.'
      if (action === 'claimSlot') return 'Termin više ne postoji. Izaberite drugi.'
      if (action === 'offerEnrolment') return 'Prijava više nije dostupna. Osvežite stranicu.'
      if (action === 'approveEnrolment') {
        return 'Prijava više ne postoji ili je već obrađena. Osvežite stranicu.'
      }
      if (action === 'rejectEnrolment') {
        return 'Prijava ne može da se odbije: ne postoji, ili učenik već ima svoj zapis.'
      }
      if (action === 'assignEnrolment') return 'Prijava više ne postoji. Osvežite stranicu.'
      return 'Podatak više ne postoji. Osvežite stranicu.'
    case 'PT403':
    case '42501':
      // a free slot cannot be published or moved into the past (a row-level-security check)
      if (code === '42501' && (action === 'publishSlot' || action === 'updateLesson')) {
        return 'Slobodan termin mora biti u budućnosti.'
      }
      if (action === 'startEnrolment') {
        return 'Prijava za časove trenutno nije dostupna. Pozovite nas na 064 4994 235.'
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
      if (action === 'setColor') return 'Ta boja nije na spisku. Izaberite drugu.'
      if (action === 'saveCv') {
        return 'Neko polje je prazno ili predugačko. Poslodavac, pozicija, ustanova i veštine ne smeju biti prazni.'
      }
      return 'Uneta vrednost nije ispravna.'
  }

  switch (action) {
    case 'createTeacher':
      if (code === 'PT409') return 'Ova osoba je već nastavnik.'
      if (code === 'PT400') {
        if (/phone/i.test(message)) return phoneMessage(message, 'nastavnika')
        if (/email/i.test(message)) return 'Email adresa nije ispravna.'
        if (/name/i.test(message)) return 'Ime i prezime su obavezni.'
        if (/subject/i.test(message)) return 'Izaberite bar jedan predmet.'
        if (/at least one location/i.test(message)) return 'Izaberite bar jednu lokaciju.'
        if (/location/i.test(message)) return 'Lokacija više ne postoji. Osvežite stranicu.'
      }
      break
    case 'setLocations':
      if (code === 'PT400') {
        if (/at least one location/i.test(message)) return 'Izaberite bar jednu lokaciju.'
        if (/location/i.test(message)) return 'Lokacija više ne postoji. Osvežite stranicu.'
      }
      if (code === 'PT409') {
        if (/erased/i.test(message)) return 'Nalog je obrisan. Osvežite stranicu.'
        return 'Nastavnik još ima buduće časove ili slobodne termine na lokaciji koja se uklanja.'
      }
      break
    case 'setSubjects':
      if (code === 'PT409' && /subject/i.test(message))
        return 'Nastavnik mora da ima bar jedan predmet.'
      break
    case 'changeEmail':
      if (code === 'PT409') {
        if (/erased/i.test(message)) return 'Obrisani nalog ne može da dobije novu email adresu.'
        return 'Ova adresa već pripada drugoj osobi.'
      }
      if (code === 'PT400') return 'Email adresa nije ispravna.'
      break
    case 'deactivateTeacher':
      if (code === 'PT409') return 'Nastavnik je već deaktiviran.'
      break
    case 'reactivateTeacher':
      if (code === 'PT409') {
        if (/erased/i.test(message)) return 'Obrisani nalog ne može da se vrati. Osvežite stranicu.'
        return 'Nastavnik je već aktivan.'
      }
      break
    case 'eraseTeacher':
      if (code === 'PT409') {
        if (/administrator/i.test(message)) {
          return 'Administrator se ne briše ovde. Prvo mu oduzmite ulogu administratora.'
        }
        return 'Nalog je već obrisan. Osvežite stranicu.'
      }
      break
    case 'grantAdmin':
      if (code === 'PT409') {
        if (/already/i.test(message)) return 'Ova osoba je već administrator. Osvežite stranicu.'
        if (/erased/i.test(message)) return 'Obrisani nalog ne može da postane administrator.'
        return 'Samo aktivan nastavnik može da postane administrator.'
      }
      break
    case 'revokeAdmin':
      if (code === 'PT409') {
        if (/main/i.test(message)) return 'Glavnom administratoru se uloga ne oduzima.'
        return 'Osoba više nije administrator. Osvežite stranicu.'
      }
      break
    case 'erasePerson':
      if (code === 'PT409') {
        if (/children/i.test(message)) {
          return 'Roditelj je još povezan sa učenikom. Prvo obrišite učenika ili uklonite roditelja sa učenika.'
        }
        if (/administrator/i.test(message)) {
          return 'Administrator se ne briše ovde. Prvo mu oduzmite ulogu administratora.'
        }
        if (/teacher/i.test(message)) {
          return 'Nastavnik se briše na stranici Nastavnici.'
        }
        return 'Nalog je već obrisan. Osvežite stranicu.'
      }
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
      if (code === 'PT409') {
        return 'Ovo je jedina lokacija nekog nastavnika. Prvo tom nastavniku dodajte drugu lokaciju (stranica Nastavnici).'
      }
      break
    case 'addRoom':
    case 'renameRoom':
      if (code === '23505') return 'Učionica sa tim nazivom već postoji na ovoj lokaciji.'
      break
    case 'deleteRoom':
      if (code === '23503') return 'Učionica se koristi u časovima i ne može da se obriše.'
      break
    case 'saveNotificationSettings':
      if (code === 'PT400') {
        if (/same time/i.test(message)) {
          return 'Tihi sati ne mogu da počnu i završe se u isto vreme.'
        }
        if (/reminder/i.test(message)) return 'Vreme podsetnika mora biti između 5 i 720 minuta.'
        if (/too long/i.test(message)) return 'Tekst je predugačak.'
      }
      break
    case 'setEmailFallback':
      if (code === 'PT409') return 'Ovo obaveštenje se uvek šalje emailom.'
      break
    case 'resendNotification':
      if (code === 'PT409') {
        return 'Samo obaveštenje koje nije uspelo može ponovo da se pošalje. Osvežite stranicu.'
      }
      break
    case 'addStudent':
      if (code === 'PT409') return 'Ovaj učenik je već među vašim učenicima.'
      if (code === 'PT400') {
        if (/phone/i.test(message)) return INVALID_PHONE
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
    case 'setPhone':
      if (code === 'PT400') return INVALID_PHONE
      if (code === 'PT409') {
        if (/erased/i.test(message)) return 'Nalog je obrisan. Osvežite stranicu.'
        return 'Nastavnik i roditelj moraju da imaju broj telefona.'
      }
      break
    case 'renamePerson':
      if (code === 'PT400') return 'Ime i prezime su obavezni (najviše 100 znakova).'
      break
    case 'addParent':
      if (code === 'PT409') return 'Učenik već ima dva roditelja.'
      if (code === 'PT400') {
        if (/phone/i.test(message)) return phoneMessage(message, 'roditelja')
        if (/email/i.test(message)) return 'Email adresa nije ispravna.'
        if (/name/i.test(message)) return 'Ime i prezime su obavezni.'
      }
      break
    case 'saveCv':
      if (code === 'PT409') return 'Upišite tekst „O meni“ da bi CV mogao da bude vidljiv.'
      if (code === 'PT400') {
        return 'CV ima previše stavki (najviše 20 radnih iskustava, 20 obrazovanja i 50 veština).'
      }
      break
    case 'startEnrolment':
      if (code === 'PT400') return 'Za izabrani predmet trenutno nema nastavnika. Izaberite drugi.'
      if (code === 'PT409') {
        if (/erased/i.test(message)) return 'Ovaj nalog ne može da se prijavi za časove.'
        return 'Ovaj nalog već pripada školi. Prijavite se na početnoj strani.'
      }
      break
    case 'completeEnrolmentProfile':
      if (code === 'PT409') return 'Nastavnik je već izabran, pa se profil više ne menja.'
      if (code === 'PT400') {
        if (/first and last name/i.test(message)) return 'Upišite ime i prezime učenika.'
        if (/phone/i.test(message)) return INVALID_PHONE
        if (/school/i.test(message)) return 'Upišite školu.'
        if (/grade/i.test(message)) return 'Upišite razred.'
        if (/privacy/i.test(message)) return 'Prihvatite politiku privatnosti da biste nastavili.'
        if (/too long/i.test(message)) return 'Neki tekst je predugačak.'
      }
      break
    case 'setCvPhoto':
      if (code === '42501')
        return 'Fotografija ne može da se sačuva. Osvežite stranicu i pokušajte ponovo.'
      break
    case 'setEnrolmentSubject':
      if (code === 'PT400') return 'Za izabrani predmet trenutno nema nastavnika. Izaberite drugi.'
      if (code === 'PT409') return 'Predmet se više ne menja.'
      break
    case 'chooseTeacher':
      if (code === 'PT409') {
        if (/not open/i.test(message)) return 'Izbor još nije otvoren.'
        if (/already a student/i.test(message)) return 'Već ste učenik ovog nastavnika.'
        return 'Nastavnik je već izabran. Osvežite stranicu.'
      }
      if (code === 'PT400') return 'Taj nastavnik više ne nudi časove. Izaberite drugog.'
      break
    case 'offerEnrolment':
      if (code === 'PT409') {
        if (/about text/i.test(message)) {
          return 'Prvo napišite opis u svom CV-u (odeljak „O meni“), jer po njemu učenik bira nastavnika.'
        }
        return 'Ova osoba je već vaš učenik.'
      }
      break
    case 'withdrawOffer':
      if (code === 'PT409') return 'Nastavnik je već izabran. Osvežite stranicu.'
      break
    case 'completeChosenEnrolment':
      if (code === 'PT400') {
        if (/\bown\b/i.test(message))
          return 'Dete mora da ima svoju email adresu, različitu od roditeljeve.'
        if (/invalid email/i.test(message)) return 'Email adresa nije ispravna.'
        return 'Upišite email adresu deteta.'
      }
      if (code === 'PT409') {
        if (/already a student/i.test(message)) return 'Ta osoba je već vaš učenik.'
        return 'Ova prijava više ne čeka email adresu. Osvežite stranicu.'
      }
      break
    case 'addUnassignedStudent':
      if (code === 'PT409') return 'Ovaj učenik već čeka nastavnika.'
      if (code === 'PT400') {
        if (/subject/i.test(message)) return 'Za izabrani predmet trenutno nema nastavnika.'
        if (/phone/i.test(message)) return INVALID_PHONE
        if (/invalid email/i.test(message)) return 'Email adresa nije ispravna.'
        if (/school and grade/i.test(message)) return 'Upišite školu i razred.'
        if (/name/i.test(message)) return 'Ime i prezime su obavezni.'
      }
      break
    case 'saveEnrolmentSettings':
      if (code === 'PT400') return 'Neka vrednost je van dozvoljenih granica.'
      break
    case 'assignEnrolment':
      if (code === 'PT409') {
        if (/not complete/i.test(message)) {
          return 'Profil još nije popunjen, pa nastavnik ne može da se dodeli.'
        }
        if (/already a student/i.test(message)) return 'Ta osoba je već učenik tog nastavnika.'
        return 'Učenik već ima nastavnika. Osvežite stranicu.'
      }
      if (code === 'PT400') {
        if (/\bown\b/i.test(message))
          return 'Dete mora da ima svoju email adresu, različitu od roditeljeve.'
        if (/invalid email/i.test(message)) return 'Email adresa nije ispravna.'
        return 'Izabrani nastavnik nije aktivan.'
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
        // before "teach": the message of the location rule says "the teacher may not hold lessons"
        if (/location/i.test(message)) {
          return 'Na toj lokaciji ne možete da držite časove. Izaberite drugu lokaciju.'
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
      if (code === 'PT400') return TOO_LONG_REASON
      break
    case 'claimSlot':
      if (code === 'PT409') {
        if (/started/i.test(message)) return 'Termin je već počeo. Izaberite drugi.'
        return 'Termin je upravo zauzet. Izaberite drugi.'
      }
      if (code === 'PT400') return 'Izaberite učenika za koga zauzimate termin.'
      break
    case 'confirmBooking':
    case 'declineBooking':
      if (code === 'PT400' && action === 'declineBooking') return TOO_LONG_REASON
      if (code === 'PT409') {
        if (/started/i.test(message)) {
          return 'Čas je već počeo, pa se zahtev više ne može odbiti. Potvrdite ga.'
        }
        return 'Zahtev više nije na čekanju. Osvežite stranicu.'
      }
      break
    case 'deleteStudent':
      if (code === 'PT409') return 'Učenik ima održan čas i ne može da se obriše.'
      break
    case 'setOutcome':
      if (code === 'PT400') return 'Ishod se upisuje tek kada se potvrđen čas završi.'
      break
  }
  return GENERIC
}
