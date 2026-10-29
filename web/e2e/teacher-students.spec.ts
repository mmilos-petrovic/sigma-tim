import { expect, test, type Page } from '@playwright/test'
import { rpc, select, tokenFor } from './api.ts'
import { signInAs } from './helpers.ts'

const section = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('link', { name }).click()
const row = (page: Page, text: string) => page.getByRole('row', { name: new RegExp(text) })
const dialog = (page: Page, name: string) => page.getByRole('dialog', { name })
const EMAIL = 'Email adresa (Google nalog)'

test.describe("the teacher's students and parents", () => {
  test('students, parents and a takeover request, against the real database', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000)
    const run = Date.now().toString(36)
    const studentEmail = `e2e.ucenik.${run}@example.test`
    const parentEmail = `e2e.roditelj.${run}@example.test`
    const sharedParent = 'roditelj1@example.test' // Jelena Ilić, a parent of Luka and Mina (seed)
    const admin = await tokenFor(request, 'admin@example.test')
    const student = `E2E Učenik${run}`

    await signInAs(page, 'Nastavnik')
    await expect(page.getByRole('heading', { name: 'Moj raspored', level: 1 })).toBeVisible()
    await section(page, 'Učenici')
    await expect(page.getByRole('heading', { name: 'Učenici', level: 1 })).toBeVisible()

    await test.step('sees their own students with the parent of the seed data', async () => {
      await expect(row(page, 'Luka Ilić')).toContainText('Jelena Ilić')
      await expect(row(page, 'Mina Ilić')).toContainText('Jelena Ilić')
      // another teacher's students are not here, a student without a teacher is in the second list
      await expect(row(page, 'Teodora Savić')).toContainText('Gimnazija')
    })

    await test.step('adds a student', async () => {
      await page.getByRole('button', { name: 'Dodaj učenika' }).click()
      const form = dialog(page, 'Novi učenik')
      await form.getByLabel(EMAIL).fill(studentEmail.toUpperCase())
      await form.getByLabel('Ime', { exact: true }).fill('E2E')
      await form.getByLabel('Prezime').fill(`Učenik${run}`)
      await form.getByLabel('Škola').fill('OŠ Test')
      await form.getByLabel('Razred').fill('6')
      await form.getByRole('button', { name: 'Dodaj' }).click()
      await expect(page.getByRole('status')).toHaveText('Učenik je dodat.')
      await expect(row(page, student)).toContainText('OŠ Test')
      await expect(row(page, student)).toContainText(studentEmail) // stored in lower case
    })

    await test.step('links an existing parent by email: no duplicate, and the existing name is kept', async () => {
      await page
        .getByRole('button', { name: `Dodaj roditelja učeniku E2E ${`Učenik${run}`}` })
        .click()
      const form = dialog(page, 'Novi roditelj')
      await form.getByLabel(EMAIL).fill(sharedParent)
      await form.getByLabel('Ime', { exact: true }).fill('Pogrešno')
      await form.getByLabel('Prezime').fill('Ime')
      await form.getByRole('button', { name: 'Dodaj' }).click()
      await expect(page.getByRole('status')).toHaveText('Roditelj je dodat.')
      await expect(row(page, student)).toContainText('Jelena Ilić')
      await expect(row(page, student)).not.toContainText('Pogrešno')

      const profiles = await select<{ id: string }>(
        request,
        admin,
        `profiles?select=id&email=eq.${sharedParent}`,
      )
      expect(profiles).toHaveLength(1)
    })

    await test.step('a second parent fills the limit; the third is not offered', async () => {
      await page.getByRole('button', { name: `Dodaj roditelja učeniku E2E Učenik${run}` }).click()
      const form = dialog(page, 'Novi roditelj')
      await form.getByLabel(EMAIL).fill(parentEmail)
      await form.getByLabel('Ime', { exact: true }).fill('Pogrešna')
      await form.getByLabel('Prezime').fill(`Adresa${run}`)
      await form.getByRole('button', { name: 'Dodaj' }).click()
      await expect(row(page, student)).toContainText(`Pogrešna Adresa${run}`)
      await expect(
        page.getByRole('button', { name: `Dodaj roditelja učeniku E2E Učenik${run}` }),
      ).toHaveCount(0)
    })

    await test.step('a wrong parent email is fixed by removing and adding the parent again', async () => {
      await page.getByRole('button', { name: `Ukloni roditelja Pogrešna Adresa${run}` }).click()
      await expect(dialog(page, 'Uklanjanje roditelja')).toContainText('gubi pristup')
      await dialog(page, 'Uklanjanje roditelja').getByRole('button', { name: 'Ukloni' }).click()
      await expect(page.getByRole('status')).toHaveText('Roditelj je uklonjen.')
      await expect(row(page, student)).not.toContainText(`Adresa${run}`)

      await page.getByRole('button', { name: `Dodaj roditelja učeniku E2E Učenik${run}` }).click()
      const form = dialog(page, 'Novi roditelj')
      await form.getByLabel(EMAIL).fill(`ispravna.${parentEmail}`)
      await form.getByLabel('Ime', { exact: true }).fill('Ispravna')
      await form.getByLabel('Prezime').fill(`Adresa${run}`)
      await form.getByRole('button', { name: 'Dodaj' }).click()
      await expect(row(page, student)).toContainText(`Ispravna Adresa${run}`)
    })

    await test.step('unlinking the shared parent keeps their other children', async () => {
      await row(page, student).getByRole('button', { name: 'Ukloni roditelja Jelena Ilić' }).click()
      await dialog(page, 'Uklanjanje roditelja').getByRole('button', { name: 'Ukloni' }).click()
      await expect(row(page, student)).not.toContainText('Jelena Ilić')
      await expect(row(page, 'Luka Ilić')).toContainText('Jelena Ilić')
      await expect(row(page, 'Mina Ilić')).toContainText('Jelena Ilić')
    })

    await test.step('corrects names, and a name belongs to the person', async () => {
      await page.getByRole('button', { name: `Izmeni učenika E2E Učenik${run}` }).click()
      await dialog(page, 'Izmena učenika').getByLabel('Ime', { exact: true }).fill('Ispravljen')
      await dialog(page, 'Izmena učenika').getByLabel('Razred').fill('7')
      await dialog(page, 'Izmena učenika').getByRole('button', { name: 'Sačuvaj' }).click()
      await expect(row(page, `Ispravljen Učenik${run}`)).toContainText('7')

      // Jelena is the parent of two students: renaming her in one row changes it in the other
      await row(page, 'Luka Ilić')
        .getByRole('button', { name: 'Izmeni roditelja Jelena Ilić' })
        .click()
      await dialog(page, 'Izmena roditelja').getByLabel('Prezime').fill('Ilić-Jović')
      await dialog(page, 'Izmena roditelja').getByRole('button', { name: 'Sačuvaj' }).click()
      await expect(row(page, 'Mina Ilić')).toContainText('Jelena Ilić-Jović')

      // put the seed data back
      await row(page, 'Luka Ilić')
        .getByRole('button', { name: 'Izmeni roditelja Jelena Ilić-Jović' })
        .click()
      await dialog(page, 'Izmena roditelja').getByLabel('Prezime').fill('Ilić')
      await dialog(page, 'Izmena roditelja').getByRole('button', { name: 'Sačuvaj' }).click()
      await expect(row(page, 'Mina Ilić')).toContainText('Jelena Ilić')
    })

    await test.step('fixes the email of their student, and the old address is gone', async () => {
      const fixed = `e2e.ispravljen.${run}@example.test`
      await page
        .getByRole('button', { name: `Promeni email učeniku Ispravljen Učenik${run}` })
        .click()
      const form = dialog(page, 'Promena email adrese')
      await expect(form).toContainText('Stari Google nalog odmah gubi pristup')
      // an address that belongs to somebody else is refused with an explanation
      await form.getByLabel('Nova email adresa').fill('ucenik1@example.test')
      await form.getByRole('button', { name: 'Promeni' }).click()
      await expect(form.getByRole('alert')).toHaveText('Ova adresa već pripada drugoj osobi.')

      await form.getByLabel('Nova email adresa').fill(fixed.toUpperCase())
      await form.getByRole('button', { name: 'Promeni' }).click()
      await expect(page.getByRole('status')).toHaveText('Email adresa je promenjena.')
      await expect(row(page, `Ispravljen Učenik${run}`)).toContainText(fixed)

      const old = await select<{ id: string }>(
        request,
        admin,
        `profiles?select=id&email=eq.${studentEmail}`,
      )
      expect(old).toHaveLength(0)
      const now = await select<{ id: string }>(
        request,
        admin,
        `profiles?select=id&email=eq.${fixed}`,
      )
      expect(now).toHaveLength(1)
    })

    await test.step('refuses to add somebody without a teacher a second time, and asks for them instead', async () => {
      await page.getByRole('button', { name: 'Dodaj učenika' }).click()
      const form = dialog(page, 'Novi učenik')
      await form.getByLabel(EMAIL).fill('ucenik3@example.test')
      await form.getByLabel('Ime', { exact: true }).fill('Teodora')
      await form.getByLabel('Prezime').fill('Savić')
      await form.getByRole('button', { name: 'Dodaj' }).click()
      await expect(form.getByRole('alert')).toContainText('Zatražite preuzimanje')
      await form.getByRole('button', { name: 'Odustani' }).click()

      const teodora = row(page, 'Teodora Savić')
      await teodora.getByRole('button', { name: 'Zatraži preuzimanje' }).click()
      await expect(page.getByRole('status')).toHaveText('Zahtev je poslat administratoru.')
      await expect(teodora).toContainText('Zahtev je poslat')

      const requests = await select<{ id: string; status: string }>(
        request,
        admin,
        'takeover_requests?select=id,status&status=eq.pending&student_id=in.(' +
          (await select<{ id: string }>(request, admin, 'students?select=id&teacher_id=is.null'))
            .map((s) => s.id)
            .join(',') +
          ')',
      )
      expect(requests.length).toBeGreaterThanOrEqual(1)
      // leave the database as it was found
      for (const pending of requests)
        await rpc(request, admin, 'reject_takeover', { p_request_id: pending.id })
    })
  })
})
