# Test lista za vlasnika (produkcija)

Lista za samostalno testiranje na produkciji posle Faze 8. Pišem je na srpskom jer je čitaš ti; kod i ostala tehnička dokumentacija ostaju na engleskom. Svaka stavka kaže **šta uraditi** i **šta treba da vidiš**. Ako nešto ne izgleda ovako, zapiši koji je korak i pošalji mi snimak ekrana.

Šta ti treba pre početka:
- tvoj administratorski nalog (`petrovicmilos@gmail.com`),
- dva dodatna Google naloga kojima možeš da se prijaviš (nazovimo ih **Učenik** i **Roditelj**), pa nastavnik kome ćeš ih dodati (može tvoj nastavnički nalog),
- telefon sa instaliranom aplikacijom (push) i desktop pregledač.

Sve što napraviš za test na kraju obriši (poslednji odeljak ti pokazuje kako, a to je ujedno test brisanja).

---

## 1. Tri stvari iz Faze 7 koje nikad nisu proverene na produkciji

### 1.1 Cela prijava za časove (sa uključenom formom)
- [ ] Pročitaj stranicu „Politika privatnosti” (`sigmatim.com/politika-privatnosti`, link u dnu početne strane): proveri da se slaže sa onim što radiš. Posebno odeljak 6 (rokovi čuvanja i brisanje na zahtev) i odeljak 8.
- [ ] Administracija → **Prijave za časove** → u okviru „Podešavanja” uključi „Prijava za časove je uključena na početnoj strani”. Dnevni limit bez odobrenja treba da piše **20**.
- [ ] Odjavi se. Na početnoj strani izaberi predmet, „Ja sam: UČENIK”, „Nastavite sa Google-om” i prijavi se nalogom **Učenik**.
- [ ] Popuni profil (ime, telefon, škola, razred, saglasnost). Do tada treba da vidiš samo poruku da popuniš profil.
- [ ] Prijavi se kao nastavnik tog predmeta: u „Neraspoređeni učenici” vidiš prijavu sa imenom, telefonom i brojem dana čekanja. Ponudi se.
- [ ] Kao **Učenik**: stiglo je obaveštenje o ponudi; vidiš CV nastavnika i možeš da ga izabereš.
- [ ] Posle izbora učenik je običan učenik tog nastavnika.
- [ ] Isključi formu ako ne želiš da je ostaviš uključenu.

### 1.2 Automatsko osvežavanje sajta posle izmene CV-a
- [ ] Kao nastavnik izmeni „O meni” u CV-u (javno uključeno) i sačuvaj.
- [ ] Za oko 15 minuta u Cloudflare-u treba da se pojavi novo objavljivanje sajta, a javna stranica nastavnika treba da pokazuje novi tekst.

### 1.3 Pravi javni CV
- [ ] Jedan pravi nastavnik ima CV sa uključenim „javno”. Na početnoj strani u „Naši nastavnici” se vidi kartica, a `/nastavnici/<ime>` otvara punu stranicu bez prijave.
- [ ] Isključi „javno”: posle sledećeg osvežavanja stranica više ne postoji (piše da nije dostupna).

---

## 2. Mreža sigurnosti (8a)
- [ ] Administracija → **Pregled** → odeljak „Obaveštenja”: kartice „Neuspela obaveštenja” i „Čekaju na slanje” pokazuju **0**, a ispod piše „Sva obaveštenja su stigla” i „Slanje radi”.
- [ ] Podešavanja → „Dnevnik obaveštenja” otvara se bez greške.
- [ ] Sentry: otvori projekat i proveri da nema novih grešaka iz ovog testiranja. Ako ih ima, pošalji mi ih.

## 3. Granični slučajevi (8b)
- [ ] **Isti klik dvaput:** kao učenik zauzmi slobodan termin i brzo klikni dvaput. Treba da dobiješ jednu rezervaciju i poruku koja je tačna (ne „upravo zauzet” za tvoj sopstveni termin).
- [ ] **Bez interneta:** u pregledaču uključi „Offline” (DevTools → Network). Pojavljuje se traka „Nema internet veze…”. Kad vratiš vezu, traka nestaje sama.
- [ ] **Istekla prijava:** ostavi aplikaciju otvorenu duže od sat vremena pa napravi neku promenu. Treba da prođe (aplikacija sama obnovi prijavu) ili da te odvede na prijavu i vrati na istu stranicu posle prijave.
- [ ] **Star tab posle izdanja:** posle sledećeg izdanja ostavi jedan tab otvoren iz stare verzije pa klikni na drugu stranicu. Treba da se tiho osveži; ne sme da piše „došlo je do greške”.

## 4. Ograničenja (8c)
Ona su proverena automatskim testovima. Ručno proveri samo ono što vidiš:
- [ ] Podešavanja obaveštenja: ispod teksta dobrodošlice piše „Šalje se najviše 20 takvih poruka na sat”.
- [ ] Prijave za časove: dnevni limit je **20**.
- [ ] (Ako želiš) Kao nastavnik pokušaj da dodaš 31 učenika u 24 sata: 31. dobija poruku „Dodali ste najveći dozvoljen broj učenika za 24 sata (30)”. Administrator nema taj limit.

## 5. Brisanje na zahtev (8d)
Pripremi nalog **Učenik** i nalog **Roditelj** (Roditelj je roditelj Učenika; Učenik ima zakazan čas, i jedan održan čas sa oznakom „plaćen” ako možeš).

- [ ] Administracija → **Roditelji**: pronađi Roditelja. U koloni „Deca” piše ime Učenika, dugmeta za brisanje **nema**, a piše „Prvo obrišite učenika ili uklonite roditelja sa učenika”.
- [ ] Administracija → **Učenici**: pronađi Učenika → **Briši na zahtev**.
  - [ ] Dijalog navodi ime, koliko časova nije počelo i koliko je održano.
  - [ ] Bez upisanog imena dugme „Obriši sve podatke” javlja „Upišite ime i prezime radi potvrde.”
  - [ ] Posle upisanog imena: „Podaci osobe su obrisani.” i Učenik nestaje sa spiska.
- [ ] Provera posle brisanja:
  - [ ] Nastavnik više ne vidi Učenika; zakazani čas je otkazan, a nastavnik je dobio obaveštenje o otkazivanju (bez imena Učenika).
  - [ ] Održan čas ostaje u evidenciji nastavnika, bez imena Učenika.
  - [ ] Roditelj više nije na spisku „Roditelji” (nema drugog deteta).
  - [ ] Pokušaj da se prijaviš nalogom **Učenik**: ne ulaziš, vidiš da nisi član škole.
  - [ ] Isti email se može ponovo dodati kao učenik.
- [ ] Administracija → **Nastavnici**: obriši test nastavnika (ako si ga pravio). Dijalog sad kaže da se briše i fotografija sa CV-a. Ako je imao fotografiju, u Supabase → Storage → `cv-photos` više nema njegovog foldera.

## 6. Administratori (glavni i ostali)
Tebe (`petrovicmilos@gmail.com`) zovemo **glavni administrator**. Samo ti postavljaš i uklanjaš ostale administratore. Za ovaj deo treba ti jedan nastavnik sa Google nalogom kojim možeš da se prijaviš.

- [ ] Administracija → **Nastavnici**: pored tvog imena piše „Glavni administrator”.
- [ ] Pored aktivnog nastavnika vidiš **Postavi za administratora**. Kod deaktiviranog nastavnika tog dugmeta nema.
- [ ] Postavi nastavnika za administratora. Dijalog kaže da ima sva prava kao ti, osim postavljanja i uklanjanja administratora. Posle potvrde pored imena piše „Administrator”.
- [ ] Prijavi se tim nalogom: vidi se izbor „Administracija / Moj raspored” i administracija radi (spisak učenika, podešavanja, nastavnici).
- [ ] Kao taj novi administrator, na stranici **Nastavnici**:
  - [ ] nema dugmadi „Postavi za administratora” ni „Ukloni administratora”,
  - [ ] u tvom redu piše „Samo glavni administrator menja ovaj nalog.” i nema dugmadi (ne može da ti promeni email, telefon, lokacije ni da te deaktivira),
  - [ ] u redu običnog nastavnika sva dugmad rade kao pre.
- [ ] Vrati se kao glavni administrator: pored novog administratora je **Ukloni administratora**, a pored tvog imena ga nema.
- [ ] Ukloni mu ulogu: ostaje nastavnik, a administracija mu više nije dostupna čim osvezi stranicu.
- [ ] Obriši nalog bivšeg administratora: radi kao za svakog nastavnika. Dok je administrator, brisanje je odbijeno.

---

## 7. Nova početna strana i politika privatnosti (novi dizajn)
- [ ] Otvori `sigmatim.com` na telefonu i na računaru (bez prijave). Treba da vidiš: logo, adresu „Hajduk Veljova 62, Kruševac”, žuto dugme „Pozovi odmah” (na telefonu samo slušalica) i plavo dugme „Prijava”; naslov „Sigma tim Kruševac”, formu za izbor predmeta i fotografiju tima; plavi deo „Kako Sigma tim radi” sa tri koraka. Nema spiska nastavnika i nema bočnog skrolovanja na telefonu.
- [ ] „Pozovi odmah” otvara biranje broja 064 4994 235.
- [ ] „Počni prijavu” (dole) vraća na formu i stavlja kursor na listu predmeta.
- [ ] Dugme **Prijava** (gore desno) vodi pravo na Google. Prijavi se svojim nalogom: odmah te vraća u aplikaciju (nema posebne strane za prijavu).
- [ ] Prijavi se Google nalogom koji škola ne poznaje, bez popunjene forme: ostaješ na početnoj strani uz poruku „Prijavljeni ste kao …, ali škola taj nalog još ne poznaje”. „Odjavi se” gore desno te odjavljuje.
- [ ] Odjavi se iz aplikacije: završiš na početnoj strani (ne na strani za prijavu), bez poruke „Sesija je istekla”.
- [ ] `sigmatim.com/prijava` više ne postoji kao strana: otvara početnu.
- [ ] Politika privatnosti (link u dnu) ima isti izgled kao početna (zaglavlje, boje, slova) i isti tekst kao pre; „← Početna strana” vraća na početnu.
- [ ] Slova se učitavaju sa našeg sajta, ne sa Google-a (Dev alati → Network ne pokazuju zahteve ka fonts.googleapis.com).

## 8. Šta nije u ovoj listi, a treba da znaš
- Emailovi koji su već poslati ostaju u sandučićima primalaca i kod Brevo-a. Aplikacija to ne može da obriše.
- Oznaka „plaćen” za održan čas briše se sa učenikom (odluka vlasnika).
- Slobodno upisan tekst u beleškama nastavnika ne pretražuje se.
