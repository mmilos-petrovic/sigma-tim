import { expect, test, type Page } from '@playwright/test'
import { rpc, select, tokenFor } from './api.ts'
import { signInAs } from './helpers.ts'

const section = (page: Page, name: string | RegExp) =>
  page
    .getByRole('navigation', { name: 'Glavna navigacija' })
    .getByRole('link', { name, exact: true })
    .click()
const row = (page: Page, text: string) => page.getByRole('row', { name: new RegExp(text) })
const dialog = (page: Page, name: string) => page.getByRole('dialog', { name })
const EMAIL = 'Email adresa (Google nalog)'

test.describe("the teacher's students and parents", () => {
  test('students, parents and a student nobody teaches, against the real database', async ({
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
      // another teacher's students are not here, and a student without a teacher is in the pool (next step)
      await expect(row(page, 'Teodora Savić')).toHaveCount(0)
    })

    await test.step('adds a student', async () => {
      await page.getByRole('button', { name: 'Dodaj učenika' }).click()
      const form = dialog(page, 'Novi učenik')
      await form.getByLabel(EMAIL).fill(studentEmail.toUpperCase())
      await form.getByLabel('Ime', { exact: true }).fill('E2E')
      await form.getByLabel('Prezime').fill(`Učenik${run}`)
      await form.getByLabel('Škola').fill('OŠ Test')
      await form.getByLabel('Razred').fill('6')
      // the student's number is optional, and is kept in the international form whatever way it is typed
      await form.getByLabel('Telefon učenika (nije obavezan)').fill('00 381 65 111 2222')
      await form.getByRole('button', { name: 'Dodaj' }).click()
      await expect(page.getByRole('status')).toHaveText('Učenik je dodat.')
      await expect(row(page, student)).toBeVisible()
      // the row has the name only; the rest is in the view of the student
      await expect(row(page, student)).not.toContainText('OŠ Test')
      await row(page, student)
        .getByRole('button', { name: `Prikaži učenika ${student}` })
        .click()
      const view = dialog(page, 'Učenik')
      await expect(view).toContainText('OŠ Test')
      await expect(view).toContainText('065 1112 222')
      await expect(view).toContainText(studentEmail) // stored in lower case
      await view.getByRole('button', { name: 'Zatvori' }).click()
    })

    await test.step('links an existing parent by email: no duplicate, and the existing name is kept', async () => {
      await page
        .getByRole('button', { name: `Dodaj roditelja učeniku E2E ${`Učenik${run}`}` })
        .click()
      const form = dialog(page, 'Novi roditelj')
      await form.getByLabel(EMAIL).fill(sharedParent)
      await form.getByLabel('Ime', { exact: true }).fill('Pogrešno')
      await form.getByLabel('Prezime').fill('Ime')
      await form.getByLabel('Telefon roditelja').fill('+381 63 999 0000')
      await form.getByRole('button', { name: 'Dodaj' }).click()
      await expect(page.getByRole('status')).toHaveText('Roditelj je dodat.')
      await expect(row(page, student)).toContainText('Jelena Ilić')
      await expect(row(page, student)).not.toContainText('Pogrešno')
      // like the name, the number the parent already has is kept
      await row(page, student).getByRole('button', { name: 'Izmeni roditelja Jelena Ilić' }).click()
      const parentForm = dialog(page, 'Izmena roditelja')
      await expect(parentForm.getByLabel('Broj telefona')).toHaveValue('060 0000 005')
      await parentForm.getByRole('button', { name: 'Odustani' }).click()

      const profiles = await select<{ id: string }>(
        request,
        admin,
        `profiles?select=id&email=eq.${sharedParent}`,
      )
      expect(profiles).toHaveLength(1)
    })

    await test.step('a second parent fills the limit; the third is not offered', async () => {
      await page
        .getByRole('button', { name: `Dodaj drugog roditelja učeniku E2E Učenik${run}` })
        .click()
      const form = dialog(page, 'Novi roditelj')
      await form.getByLabel(EMAIL).fill(parentEmail)
      await form.getByLabel('Ime', { exact: true }).fill('Pogrešna')
      await form.getByLabel('Prezime').fill(`Adresa${run}`)
      // a parent needs a number: without one the form does not go
      await form.getByRole('button', { name: 'Dodaj' }).click()
      await expect(form.getByRole('alert')).toHaveText('Unesite broj telefona.')
      await form.getByLabel('Telefon roditelja').fill('+381 63 111 3333')
      await form.getByRole('button', { name: 'Dodaj' }).click()
      await expect(row(page, student)).toContainText(`Pogrešna Adresa${run}`)
      await expect(
        page.getByRole('button', {
          name: new RegExp(`^Dodaj (drugog )?roditelja učeniku E2E Učenik${run}`),
        }),
      ).toHaveCount(0)
    })

    await test.step('a wrong parent email is fixed by removing and adding the parent again', async () => {
      await page.getByRole('button', { name: `Ukloni roditelja Pogrešna Adresa${run}` }).click()
      await expect(dialog(page, 'Uklanjanje roditelja')).toContainText('gubi pristup')
      await dialog(page, 'Uklanjanje roditelja').getByRole('button', { name: 'Ukloni' }).click()
      await expect(page.getByRole('status')).toHaveText('Roditelj je uklonjen.')
      await expect(row(page, student)).not.toContainText(`Adresa${run}`)

      await page
        .getByRole('button', { name: `Dodaj drugog roditelja učeniku E2E Učenik${run}` })
        .click()
      const form = dialog(page, 'Novi roditelj')
      await form.getByLabel(EMAIL).fill(`ispravna.${parentEmail}`)
      await form.getByLabel('Ime', { exact: true }).fill('Ispravna')
      await form.getByLabel('Prezime').fill(`Adresa${run}`)
      await form.getByLabel('Telefon roditelja').fill('+381 63 111 3333')
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
      await expect(row(page, `Ispravljen Učenik${run}`)).toBeVisible()
      await row(page, `Ispravljen Učenik${run}`)
        .getByRole('button', { name: `Prikaži učenika Ispravljen Učenik${run}` })
        .click()
      const view = dialog(page, 'Učenik')
      await expect(
        view.getByText('Razred', { exact: true }).locator('xpath=following-sibling::dd'),
      ).toHaveText('7 razred')
      await view.getByRole('button', { name: 'Zatvori' }).click()

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
      await page.getByRole('button', { name: `Izmeni učenika Ispravljen Učenik${run}` }).click()
      const form = dialog(page, 'Izmena učenika')
      // an address that belongs to somebody else is refused with an explanation
      await form.getByLabel('Email adresa').fill('ucenik1@example.test')
      await expect(form).toContainText('Stari Google nalog odmah gubi pristup')
      await form.getByRole('button', { name: 'Sačuvaj' }).click()
      await expect(form.getByRole('alert')).toHaveText('Ova adresa već pripada drugoj osobi.')

      await form.getByLabel('Email adresa').fill(fixed.toUpperCase())
      await form.getByRole('button', { name: 'Sačuvaj' }).click()
      await expect(page.getByRole('status')).toHaveText('Podaci su sačuvani.')
      await row(page, `Ispravljen Učenik${run}`)
        .getByRole('button', { name: `Prikaži učenika Ispravljen Učenik${run}` })
        .click()
      await expect(dialog(page, 'Učenik')).toContainText(fixed)
      await dialog(page, 'Učenik').getByRole('button', { name: 'Zatvori' }).click()

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

    await test.step('a student nobody teaches is in the pool of the subject, not among the own students', async () => {
      // seed: Teodora's teacher left, and she has no lesson, so every teacher sees her
      await section(page, /^Neraspoređeni učenici/)
      const teodora = page.getByRole('article', { name: 'Teodora Savić' })
      await expect(teodora).toContainText('Ostao bez nastavnika')
      await section(page, 'Učenici')
      await expect(row(page, 'Teodora Savić')).toHaveCount(0)
    })

    await test.step('adds one to the pool with the box ticked', async () => {
      const pooled = `E2E Neraspoređen${run}`
      await page.getByRole('button', { name: 'Dodaj učenika' }).click()
      const form = dialog(page, 'Novi učenik')
      await form.getByLabel(EMAIL).fill(`e2e.pool.${run}@example.test`)
      await form.getByLabel('Ime', { exact: true }).fill('E2E')
      await form.getByLabel('Prezime').fill(`Neraspoređen${run}`)
      await form.getByLabel('Škola', { exact: true }).fill('OŠ Test')
      await form.getByLabel('Razred').fill('6')
      await form.getByLabel('Telefon učenika (nije obavezan)').fill('064 555 0001')
      await form.getByRole('checkbox', { name: 'Učenik nema nastavnika (neraspoređen)' }).check()
      await form.getByLabel('Predmet').selectOption({ label: 'Matematika' })
      await form.getByRole('button', { name: 'Dodaj' }).click()
      await expect(page.getByRole('status')).toHaveText(
        'Učenik je dodat na spisak neraspoređenih učenika.',
      )
      await expect(row(page, pooled)).toHaveCount(0)

      await section(page, /^Neraspoređeni učenici/)
      await expect(page.getByRole('article', { name: pooled })).toContainText('Dodao nastavnik')

      // leave the database as it was found
      const [added] = await select<{ id: string }>(
        request,
        admin,
        `students?select=id,profile:profiles!inner(email)&profile.email=eq.e2e.pool.${run}@example.test`,
      )
      await rpc(request, admin, 'delete_student', { p_student_id: added.id })
    })
  })
})
