import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './helpers.ts'

const nav = (page: Page) => page.getByRole('navigation', { name: 'Glavna navigacija' })
const settings = (page: Page) => page.getByRole('form', { name: 'Tihi sati i podsetnici' })
const quietBox = (page: Page) =>
  settings(page).getByRole('checkbox', { name: /Ne šalji obaveštenja u tihim satima/ })
const reminderBox = (page: Page) =>
  settings(page).getByRole('checkbox', { name: 'Šalji podsetnik pre časa' })
const minutes = (page: Page) => settings(page).getByLabel('Koliko minuta pre početka časa')
const save = (page: Page) => settings(page).getByRole('button', { name: 'Sačuvaj podešavanja' })
const switches = (page: Page) => page.getByRole('region', { name: 'Email umesto obaveštenja' })
const log = (page: Page) => page.getByRole('region', { name: 'Dnevnik obaveštenja' })

/** Back to what the database starts with, so that the local data is left as it was found. */
async function restoreDefaults(page: Page) {
  // the times can only be changed while the quiet hours are on
  if (!(await quietBox(page).isChecked())) await quietBox(page).click()
  await settings(page).getByLabel('Od, sat').selectOption('22')
  await settings(page).getByLabel('Od, minuti').selectOption('00')
  await settings(page).getByLabel('Do, sat').selectOption('07')
  await settings(page).getByLabel('Do, minuti').selectOption('00')
  await quietBox(page).click()
  if (!(await reminderBox(page).isChecked())) await reminderBox(page).click()
  await minutes(page).fill('60')
  await settings(page).getByLabel('Tekst dobrodošlice').fill('')
  await settings(page).getByLabel('Kontakt podaci škole').fill('')
  await save(page).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Podešavanja su sačuvana.' }),
  ).toBeVisible()
  const reminderSwitch = switches(page).getByRole('checkbox', { name: 'Podsetnik pre časa' })
  if (await reminderSwitch.isChecked()) await reminderSwitch.click()
  const movedSwitch = switches(page).getByRole('checkbox', { name: 'Pomeren čas' })
  if (!(await movedSwitch.isChecked())) await movedSwitch.click()
}

test.describe('notification settings', () => {
  test('the admin sets quiet hours, the reminder and the email switches, and tries a notice', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await signInAs(page, 'Admin')
    await expect(page.getByRole('heading', { name: 'Administracija', level: 1 })).toBeVisible()

    await test.step('the settings link is right below the takeover requests', async () => {
      const links = await nav(page).getByRole('link').allTextContents()
      expect(links.slice(-2)).toEqual(['Zahtevi za preuzimanje', 'Podešavanja'])
      await nav(page).getByRole('link', { name: 'Podešavanja' }).click()
      await expect(page.getByRole('heading', { name: 'Podešavanja', level: 1 })).toBeVisible()
      await expect(settings(page)).toBeVisible()
      await restoreDefaults(page)
    })

    await test.step('quiet hours, reminder and texts are saved and survive a reload', async () => {
      await quietBox(page).click()
      await settings(page).getByLabel('Od, sat').selectOption('21')
      await settings(page).getByLabel('Od, minuti').selectOption('30')
      await settings(page).getByLabel('Do, sat').selectOption('06')
      await minutes(page).fill('90')
      await settings(page).getByLabel('Tekst dobrodošlice').fill('Dobro došli u Sigma Tim.')
      await settings(page).getByLabel('Kontakt podaci škole').fill('Tel 011 123 4567')
      await save(page).click()
      await expect(
        page.getByRole('status').filter({ hasText: 'Podešavanja su sačuvana.' }),
      ).toBeVisible()

      await page.reload()
      await expect(settings(page)).toBeVisible()
      await expect(quietBox(page)).toBeChecked()
      await expect(settings(page).getByLabel('Od, sat')).toHaveValue('21')
      await expect(settings(page).getByLabel('Od, minuti')).toHaveValue('30')
      await expect(settings(page).getByLabel('Do, sat')).toHaveValue('06')
      await expect(minutes(page)).toHaveValue('90')
      await expect(settings(page).getByLabel('Tekst dobrodošlice')).toHaveValue(
        'Dobro došli u Sigma Tim.',
      )
      await expect(settings(page).getByLabel('Kontakt podaci škole')).toHaveValue(
        'Tel 011 123 4567',
      )
    })

    await test.step('what the database refuses is explained', async () => {
      await settings(page).getByLabel('Do, sat').selectOption('21')
      await settings(page).getByLabel('Do, minuti').selectOption('30')
      await save(page).click()
      await expect(page.getByRole('alert')).toHaveText(
        'Tihi sati ne mogu da počnu i završe se u isto vreme.',
      )
      await settings(page).getByLabel('Do, sat').selectOption('06')
      await settings(page).getByLabel('Do, minuti').selectOption('00')
      await minutes(page).fill('3')
      await save(page).click()
      await expect(page.getByRole('alert')).toHaveText(
        'Vreme podsetnika mora biti između 5 i 720 minuta.',
      )
    })

    await test.step('email switches save at once; the welcome and the test cannot be switched', async () => {
      await switches(page).getByRole('checkbox', { name: 'Pomeren čas' }).click()
      await page.reload()
      await expect(switches(page).getByRole('checkbox', { name: 'Pomeren čas' })).not.toBeChecked()
      await switches(page).getByRole('checkbox', { name: 'Podsetnik pre časa' }).click()
      await page.reload()
      await expect(
        switches(page).getByRole('checkbox', { name: 'Podsetnik pre časa' }),
      ).toBeChecked()

      for (const name of [/^Dobrodošlica\s+\(uvek/, /^Probno obaveštenje\s+\(uvek/]) {
        const box = switches(page).getByRole('checkbox', { name })
        await expect(box).toBeChecked()
        await expect(box).toBeDisabled()
      }
    })

    await test.step('a test notice is queued for the administrator and shows in the log', async () => {
      await page.getByRole('button', { name: 'Pošalji probno obaveštenje' }).click()
      await expect(page.getByText(/Probno obaveštenje je u redu za slanje/)).toBeVisible()
      const newest = log(page).getByRole('row').nth(1)
      await expect(newest).toContainText('Probno obaveštenje')
      await expect(newest).toContainText('U redu za slanje')
    })

    await test.step('the log can be filtered by state', async () => {
      await log(page).getByLabel('Stanje').selectOption('failed')
      await expect(log(page).getByText('Probno obaveštenje')).toHaveCount(0)
      await log(page).getByLabel('Stanje').selectOption('queued')
      await expect(log(page).getByText('Probno obaveštenje').first()).toBeVisible()
    })

    await restoreDefaults(page)
  })

  test('a teacher who is not an admin cannot open the settings', async ({ page }) => {
    await signInAs(page, 'Nastavnik')
    await expect(page.getByRole('heading', { name: 'Moj raspored', level: 1 })).toBeVisible()
    await page.goto('/administracija/podesavanja')
    await expect(page).toHaveURL(/\/moj-raspored$/)
    await expect(page.getByRole('heading', { name: 'Podešavanja', level: 1 })).toHaveCount(0)
  })
})
