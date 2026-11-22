import { expect, test } from '@playwright/test'
import { rpc, select, tokenFor } from './api.ts'
import { signInAs } from './helpers.ts'
import { forgetStranger, setEnrolmentSettings } from './stranger.ts'

const hideCv = async (request: import('@playwright/test').APIRequestContext) =>
  rpc(request, await tokenFor(request, 'ana.nikolic@example.test'), 'save_my_cv', {
    p_about: '',
    p_show_public: false,
    p_show_members: false,
    p_experience: [],
    p_education: [],
    p_skills: [],
  })

test.describe('the public site', () => {
  test('a visitor signs up from the front page and fills in the profile', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000)
    const run = Date.now().toString(36)
    forgetStranger()
    await setEnrolmentSettings(request, { enabled: true })

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Sigma tim Kruševac', level: 1 })).toBeVisible()
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'Pozovi odmah' }),
    ).toHaveAttribute('href', 'tel:+381644994235')

    await test.step('the form leaves for Google with the choice kept', async () => {
      const subject = page.getByLabel('Izaberi predmet iz kog želiš časove')
      await subject.selectOption({ label: 'Matematika' })
      await page.getByRole('radio', { name: 'Učenik' }).check()

      // Google is not there locally: the request that would leave for it is stopped and looked at
      const left = page.waitForRequest(/\/auth\/v1\/authorize/)
      await page.route(/\/auth\/v1\/authorize/, (route) => route.abort('aborted'))
      await page.getByRole('button', { name: 'Nastavite sa Google-om' }).click()
      expect(new URL((await left).url()).searchParams.get('provider')).toBe('google')
      const kept = await page.evaluate(() => window.sessionStorage.getItem('sigma.enrolment'))
      expect(JSON.parse(kept ?? 'null')).toMatchObject({ role: 'student' })
      await page.unroute(/\/auth\/v1\/authorize/)
    })

    await test.step('back from Google, the request is made and the profile asked for', async () => {
      // the account of a person the school does not know; the choice is still waiting in this tab
      await signInAs(page, 'Stranac (bez profila)')
      await expect(page).toHaveURL(/\/upis$/)
      await expect(page.getByRole('heading', { name: 'Prijava za časove', level: 1 })).toBeVisible()
      await expect(page.getByText('Popuni profil da bi te videli nastavnici.')).toBeVisible()
      await expect(page.getByRole('region', { name: 'Prijava za Matematika' })).toBeVisible()
    })

    await test.step('the profile is saved', async () => {
      await page.getByLabel('Ime učenika', { exact: true }).fill(`Prijava${run}`)
      await page.getByLabel('Prezime učenika').fill('Test')
      await page.getByLabel('Telefon za kontakt').fill('064 555 1234')
      await page.getByLabel('Škola', { exact: true }).fill('E2E gimnazija')
      await page.getByLabel('Razred').fill('2')
      await page.getByRole('button', { name: 'Sačuvaj' }).click()
      await expect(page.getByRole('alert')).toHaveText(
        'Prihvatite politiku privatnosti da biste nastavili.',
      )
      await page.getByRole('checkbox', { name: /Prihvatam/ }).check()
      await page.getByRole('button', { name: 'Sačuvaj' }).click()
      await expect(page.getByText(/Tvoj zahtev je primljen/)).toBeVisible()
      await expect(page.getByText(`Prijava${run} Test · E2E gimnazija, 2`)).toBeVisible()
    })

    await test.step('a teacher of the subject sees it, with the phone', async () => {
      const row = (pool: { student_first_name: string }[]) =>
        pool.find((entry) => entry.student_first_name === `Prijava${run}`)
      // Ana teaches mathematics (who else may not see it is the business of the database tests)
      const ana = await rpc<
        { student_first_name: string; phone: string; applicant_role: string }[]
      >(request, await tokenFor(request, 'ana.nikolic@example.test'), 'list_enrolment_pool', {})
      expect(row(ana)).toMatchObject({ phone: '+381645551234', applicant_role: 'student' })
    })

    await test.step('signing in again finds the request, not the "not a member" page', async () => {
      await page.getByRole('button', { name: 'Odjavi se' }).click()
      await signInAs(page, 'Stranac (bez profila)')
      await expect(page).toHaveURL(/\/upis$/)
      await expect(page.getByText(/Tvoj zahtev je primljen/)).toBeVisible()
    })

    forgetStranger()
  })

  test('a CV is public for a visitor only while its teacher says so', async ({ page, request }) => {
    test.setTimeout(120_000)
    const run = Date.now().toString(36)
    const about = `Javni E2E opis ${run}`
    const token = await tokenFor(request, 'ana.nikolic@example.test')
    await hideCv(request)
    await rpc(request, token, 'save_my_cv', {
      p_about: about,
      p_show_public: true,
      p_show_members: false,
      p_experience: [{ employer: `E2E škola ${run}`, position: 'Nastavnik' }],
      p_education: [],
      p_skills: [],
    })
    const [own] = await select<{ slug: string }>(request, token, 'teacher_cv?select=slug')
    const slug = own?.slug
    expect(slug, 'the CV of Ana has a link').toBeTruthy()

    await test.step('it has a page of its own, and is not on the front page for now', async () => {
      await page.goto('/')
      await expect(page.getByLabel('Izaberi predmet iz kog želiš časove')).toBeVisible()
      await expect(page.getByRole('region', { name: 'Naši nastavnici' })).toHaveCount(0)
      await page.goto(`/nastavnici/${slug}`)
      await expect(page.getByRole('heading', { name: 'Ana Nikolić', level: 1 })).toBeVisible()
      await expect(page.getByRole('article')).toContainText(`E2E škola ${run}`)
      await expect(page).toHaveTitle('Ana Nikolić – nastavnik | Sigma Tim')
      // a visitor who is not signed in sees it: the page is not behind the login
      await expect(page.getByRole('button', { name: 'Prijava' })).toBeVisible()
    })

    await test.step('hiding it makes the page unavailable and the card disappear', async () => {
      await hideCv(request)
      await page.reload()
      await expect(
        page.getByRole('heading', { name: 'Ovaj CV nije dostupan', level: 1 }),
      ).toBeVisible()
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
      await page.goto('/')
      await expect(page.getByLabel('Izaberi predmet iz kog želiš časove')).toBeVisible()
    })
  })
})
