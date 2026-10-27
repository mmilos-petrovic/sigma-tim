import { expect, test, type Page } from '@playwright/test'
import { rpc, select, storedPhotos, tokenFor } from './api.ts'
import { signInAs } from './helpers.ts'

// A valid 1x1 PNG: the app shrinks and re-encodes it as a JPEG before uploading.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const section = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('link', { name }).click()
const row = (page: Page, text: string) => page.getByRole('row', { name: new RegExp(text) })
const dialog = (page: Page, name: string) => page.getByRole('dialog', { name })

test.describe('administration', () => {
  test('the admin sets the school up from scratch, without SQL', async ({ page, request }) => {
    test.setTimeout(180_000)
    const run = Date.now().toString(36)
    const subject = `E2E predmet ${run}`
    const renamed = `${subject} izmenjen`
    const location = `E2E lokacija ${run}`
    const room = `E2E ucionica ${run}`
    const email = `e2e.${run}@example.test`
    const newEmail = `e2e.${run}.novi@example.test`

    await signInAs(page, 'Admin')
    await expect(page.getByRole('heading', { name: 'Administracija', level: 1 })).toBeVisible()

    await test.step('subjects: add, reject a duplicate, rename', async () => {
      await section(page, 'Predmeti')
      await page.getByLabel('Novi predmet').fill(subject)
      await page.getByRole('button', { name: 'Dodaj predmet' }).click()
      await expect(page.getByRole('status')).toHaveText('Predmet je dodat.')
      await expect(row(page, subject)).toBeVisible()

      await page.getByLabel('Novi predmet').fill(subject.toUpperCase())
      await page.getByRole('button', { name: 'Dodaj predmet' }).click()
      await expect(page.getByRole('alert')).toHaveText('Predmet sa tim nazivom već postoji.')

      await row(page, subject).getByRole('button', { name: 'Preimenuj' }).click()
      await dialog(page, 'Preimenovanje predmeta').getByLabel('Naziv').fill(renamed)
      await dialog(page, 'Preimenovanje predmeta').getByRole('button', { name: 'Sačuvaj' }).click()
      await expect(row(page, renamed)).toBeVisible()
    })

    await test.step('location: add, a room, a photo', async () => {
      await section(page, 'Lokacije')
      await page.getByRole('button', { name: 'Dodaj lokaciju' }).click()
      await dialog(page, 'Nova lokacija').getByLabel('Naziv').fill(location)
      await dialog(page, 'Nova lokacija').getByLabel('Adresa').fill('Ulica 1, Beograd')
      await dialog(page, 'Nova lokacija').getByRole('button', { name: 'Dodaj' }).click()

      const card = page.getByRole('article', { name: location })
      await expect(card).toBeVisible()
      await card.getByLabel('Nova učionica').fill(room)
      await card.getByRole('button', { name: 'Dodaj učionicu' }).click()
      await expect(card.getByText(room)).toBeVisible()

      await card
        .getByLabel('Dodaj fotografiju')
        .setInputFiles({ name: 'zgrada.png', mimeType: 'image/png', buffer: PNG })
      const photo = card.getByRole('img', { name: `Fotografija 1: ${location}` })
      await expect(photo).toBeVisible()
      // the signed link really serves the picture
      await expect
        .poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
        .toBe(true)
    })

    await test.step('teacher: add, a subject in use cannot be deleted, change subjects and email', async () => {
      await section(page, 'Nastavnici')
      await page.getByRole('button', { name: 'Dodaj nastavnika' }).click()
      const add = dialog(page, 'Dodaj nastavnika')
      await add.getByLabel('Email').fill(email)
      await add.getByLabel('Ime', { exact: true }).fill('E2E')
      await add.getByLabel('Prezime').fill(`Nastavnik${run}`)
      await add.getByRole('checkbox', { name: renamed }).check()
      await add.getByRole('button', { name: 'Dodaj' }).click()
      await expect(page.getByRole('status')).toHaveText('Nastavnik je dodat.')
      await expect(row(page, email)).toContainText('Još se nije prijavio')
      await expect(row(page, email)).toContainText(renamed)

      // the subject is in use now
      await section(page, 'Predmeti')
      await row(page, renamed).getByRole('button', { name: 'Obriši' }).click()
      await dialog(page, 'Brisanje predmeta').getByRole('button', { name: 'Obriši' }).click()
      await expect(dialog(page, 'Brisanje predmeta').getByRole('alert')).toHaveText(
        'Predmet se koristi (kod nastavnika ili u časovima) i ne može da se obriše.',
      )
      await dialog(page, 'Brisanje predmeta').getByRole('button', { name: 'Odustani' }).click()

      await section(page, 'Nastavnici')
      await row(page, email).getByRole('button', { name: 'Predmeti' }).click()
      const subjects = dialog(page, `Predmeti nastavnika E2E Nastavnik${run}`)
      await subjects.getByRole('checkbox', { name: 'Matematika' }).check()
      await subjects.getByRole('checkbox', { name: renamed }).uncheck()
      await subjects.getByRole('button', { name: 'Sačuvaj' }).click()
      await expect(row(page, email)).toContainText('Matematika')
      await expect(row(page, email)).not.toContainText(renamed)

      await row(page, email).getByRole('button', { name: 'Promeni email' }).click()
      await dialog(page, 'Promena email adrese').getByLabel('Nova email adresa').fill(newEmail)
      await dialog(page, 'Promena email adrese').getByRole('button', { name: 'Promeni' }).click()
      await expect(row(page, newEmail)).toBeVisible()

      // an address that belongs to someone else is refused, in Serbian
      await row(page, newEmail).getByRole('button', { name: 'Promeni email' }).click()
      await dialog(page, 'Promena email adrese')
        .getByLabel('Nova email adresa')
        .fill('ana.nikolic@example.test')
      await dialog(page, 'Promena email adrese').getByRole('button', { name: 'Promeni' }).click()
      await expect(dialog(page, 'Promena email adrese').getByRole('alert')).toHaveText(
        'Ova adresa već pripada drugoj osobi.',
      )
      await dialog(page, 'Promena email adrese').getByRole('button', { name: 'Odustani' }).click()
    })

    await test.step('teacher: deactivate shows the consequences, reactivate brings them back', async () => {
      await row(page, newEmail).getByRole('button', { name: 'Deaktiviraj' }).click()
      const confirm = dialog(page, 'Deaktivacija nastavnika')
      await expect(confirm.getByText('Budući časovi koji se brišu: 0')).toBeVisible()
      await expect(confirm.getByText('Učenici koji postaju neraspoređeni: 0')).toBeVisible()
      await confirm.getByRole('button', { name: 'Deaktiviraj' }).click()
      await expect(row(page, newEmail)).toContainText('Deaktiviran')

      await row(page, newEmail).getByRole('button', { name: 'Aktiviraj' }).click()
      await dialog(page, 'Aktivacija nastavnika').getByRole('button', { name: 'Aktiviraj' }).click()
      await expect(row(page, newEmail)).toContainText('Aktivan')
    })

    await test.step('takeover request: a teacher asks, the admin approves', async () => {
      const admin = await tokenFor(request, 'admin@example.test')
      const ana = await tokenFor(request, 'ana.nikolic@example.test')
      const studentId = await rpc<string>(request, admin, 'add_student', {
        p_email: `e2e.ucenik.${run}@example.test`,
        p_first_name: 'E2E',
        p_last_name: `Ucenik${run}`,
        p_school: 'OŠ Test',
        p_grade: '6',
        p_class_section: 'b',
      })
      await rpc(request, ana, 'request_takeover', { p_student_id: studentId })

      await section(page, 'Zahtevi za preuzimanje')
      const student = page.getByRole('article', { name: `E2E Ucenik${run}` })
      await expect(student).toContainText('OŠ Test, razred 6b')
      await student.getByRole('button', { name: 'Odobri: Ana Nikolić' }).click()
      await dialog(page, 'Odobravanje zahteva').getByRole('button', { name: 'Odobri' }).click()
      await expect(page.getByRole('status')).toHaveText('Zahtev je odobren.')
      await expect(student).toHaveCount(0)

      const [record] = await select<{ teacher_id: string }>(
        request,
        admin,
        `students?id=eq.${studentId}&select=teacher_id`,
      )
      const [anaProfile] = await select<{ id: string }>(
        request,
        admin,
        'profiles?email=eq.ana.nikolic@example.test&select=id',
      )
      expect(record.teacher_id).toBe(anaProfile.id)
    })

    await test.step('cleanup through the screens: a location with rooms cannot be deleted, then it can', async () => {
      const admin = await tokenFor(request, 'admin@example.test')
      const [{ id: locationId }] = await select<{ id: string }>(
        request,
        admin,
        `locations?name=eq.${encodeURIComponent(location)}&select=id`,
      )
      expect(await storedPhotos(request, admin, locationId)).toHaveLength(1)

      await section(page, 'Lokacije')
      const card = page.getByRole('article', { name: location })
      await card.getByRole('button', { name: 'Obriši', exact: true }).click()
      await dialog(page, 'Brisanje lokacije').getByRole('button', { name: 'Obriši' }).click()
      await expect(dialog(page, 'Brisanje lokacije').getByRole('alert')).toHaveText(
        'Lokacija ima učionice ili časove i ne može da se obriše. Prvo obrišite učionice.',
      )
      await dialog(page, 'Brisanje lokacije').getByRole('button', { name: 'Odustani' }).click()

      await card.getByRole('button', { name: `Obriši učionicu ${room}` }).click()
      await dialog(page, 'Brisanje učionice').getByRole('button', { name: 'Obriši' }).click()
      await expect(card.getByText(room)).toHaveCount(0)

      await card.getByRole('button', { name: 'Obriši', exact: true }).click()
      await dialog(page, 'Brisanje lokacije').getByRole('button', { name: 'Obriši' }).click()
      await expect(page.getByRole('status')).toHaveText('Lokacija je obrisana.')
      await expect(card).toHaveCount(0)
      // the photo file went with it
      await expect.poll(() => storedPhotos(request, admin, locationId)).toHaveLength(0)

      await section(page, 'Predmeti')
      await row(page, renamed).getByRole('button', { name: 'Obriši' }).click()
      await dialog(page, 'Brisanje predmeta').getByRole('button', { name: 'Obriši' }).click()
      await expect(page.getByRole('status')).toHaveText('Predmet je obrisan.')
    })
  })

  test('a teacher cannot read or change what the administration manages', async ({
    page,
    request,
  }) => {
    await signInAs(page, 'Nastavnik')
    await expect(page.getByRole('heading', { name: 'Moj raspored', level: 1 })).toBeVisible()
    await page.goto('/administracija/nastavnici')
    await expect(page).toHaveURL(/\/moj-raspored$/)

    // and the database says no, whatever the screen shows
    const ana = await tokenFor(request, 'ana.nikolic@example.test')
    const { url, key } = (await import('./helpers.ts')).localEnv()
    const denied = await request.post(`${url}/rest/v1/rpc/reactivate_teacher`, {
      headers: { apikey: key, Authorization: `Bearer ${ana}` },
      data: { p_teacher_id: '00000000-0000-0000-0000-000000000000' },
    })
    expect(denied.status()).toBe(403)
    const insert = await request.post(`${url}/rest/v1/subjects`, {
      headers: { apikey: key, Authorization: `Bearer ${ana}` },
      data: { name: 'Hakovan predmet' },
    })
    expect(insert.ok()).toBe(false)
  })
})
