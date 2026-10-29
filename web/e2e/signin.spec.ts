import { expect, test } from '@playwright/test'
import { accessToken, readable, signInAs, signOut } from './helpers.ts'

const heading = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('heading', { name, level: 1 })

test.describe('the five test accounts', () => {
  test('admin opens the administration, and only that', async ({ page }) => {
    await signInAs(page, 'Admin')
    await expect(heading(page, 'Administracija')).toBeVisible()
    await expect(page).toHaveURL(/\/administracija$/)
    await expect(page.getByRole('navigation', { name: 'Izbor prikaza' })).toHaveCount(0)

    await page.goto('/ucenik')
    await expect(page).toHaveURL(/\/administracija$/)
  })

  test('admin and teacher chooses a context, switches, and returns to the last one', async ({
    page,
  }) => {
    await signInAs(page, 'Admin i nastavnik')
    await expect(heading(page, 'Izaberite prikaz')).toBeVisible()
    await page.getByRole('main').getByRole('link', { name: 'Moj raspored' }).click()
    await expect(heading(page, 'Moj raspored')).toBeVisible()

    const switcher = page.getByRole('navigation', { name: 'Izbor prikaza' })
    await switcher.getByRole('link', { name: 'Administracija' }).click()
    await expect(heading(page, 'Administracija')).toBeVisible()

    // A new sign-in returns to the context used last, without asking.
    await signOut(page)
    await signInAs(page, 'Admin i nastavnik')
    await expect(heading(page, 'Administracija')).toBeVisible()
    await expect(page).toHaveURL(/\/administracija$/)

    // The choice survives a reload as well.
    await page.reload()
    await expect(heading(page, 'Administracija')).toBeVisible()
  })

  test('teacher opens their schedule and cannot open the administration', async ({ page }) => {
    await signInAs(page, 'Nastavnik')
    await expect(heading(page, 'Moj raspored')).toBeVisible()
    await expect(page.locator('[data-layout]')).toHaveAttribute('data-layout', 'desktop')

    await page.goto('/administracija')
    await expect(page).toHaveURL(/\/moj-raspored$/)
  })

  test('student gets the phone layout and sees only their own data', async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await signInAs(page, 'Učenik')
    await expect(heading(page, 'Moji časovi')).toBeVisible()
    await expect(page.locator('[data-layout]')).toHaveAttribute('data-layout', 'mobile')
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)

    // What the database lets this account read: themselves and their teacher, nobody else.
    const token = await accessToken(page)
    expect(await readable(request, token, 'profiles', 'email')).toEqual([
      'ana.nikolic@example.test',
      'ucenik1@example.test',
    ])
    // Lessons: only those the student takes part in (the teacher may have scheduled some by now, so not "none").
    const lessons = await readable(request, token, 'lessons', 'id')
    const attended = await readable(request, token, 'lesson_students', 'lesson_id')
    expect(lessons.every((id) => attended.includes(id))).toBe(true)
    expect(await readable(request, token, 'push_subscriptions', 'id')).toEqual([])
  })

  test('parent sees their children and their teacher, not other students', async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await signInAs(page, 'Roditelj')
    await expect(heading(page, 'Časovi dece')).toBeVisible()

    const token = await accessToken(page)
    expect(await readable(request, token, 'profiles', 'email')).toEqual([
      'ana.nikolic@example.test',
      'roditelj1@example.test',
      'ucenik1@example.test',
      'ucenik2@example.test',
    ])
  })

  test('a Google account the school has not approved sees the notice and no data', async ({
    page,
    request,
  }) => {
    await signInAs(page, 'Stranac (bez profila)')
    await expect(heading(page, 'Još niste član škole')).toBeVisible()
    await expect(page.getByText('stranac@example.test')).toBeVisible()
    await expect(page.getByText(/Pozovite nastavnika da vam zakaže prvi čas/)).toBeVisible()

    for (const path of ['/moj-raspored', '/administracija', '/ucenik', '/izbor']) {
      await page.goto(path)
      await expect(heading(page, 'Još niste član škole')).toBeVisible()
    }

    const token = await accessToken(page)
    expect(await readable(request, token, 'profiles', 'email')).toEqual([])
    expect(await readable(request, token, 'students', 'id')).toEqual([])
    expect(await readable(request, token, 'subjects', 'name')).toEqual([])
  })
})

test.describe('sessions and failures', () => {
  test('a signed-out visitor is sent to sign in and comes back to the page afterwards', async ({
    page,
  }) => {
    await page.goto('/moj-raspored')
    await expect(heading(page, 'Prijava')).toBeVisible()
    await expect(page).toHaveURL(/\/prijava$/)

    await page.getByRole('button', { name: 'Nastavnik', exact: true }).click()
    await expect(heading(page, 'Moj raspored')).toBeVisible()
  })

  test('signing out ends the session on this device', async ({ page }) => {
    await signInAs(page, 'Nastavnik')
    await expect(heading(page, 'Moj raspored')).toBeVisible()
    await signOut(page)
    await expect(page.getByText('Sesija je istekla')).toHaveCount(0)

    await page.goto('/moj-raspored')
    await expect(heading(page, 'Prijava')).toBeVisible()
  })

  test('a session the server rejects shows the expiry notice', async ({ page }) => {
    await signInAs(page, 'Nastavnik')
    await expect(heading(page, 'Moj raspored')).toBeVisible()

    await page.route('**/rest/v1/rpc/my_roles', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{"code":"PGRST301","message":"JWT expired"}',
      }),
    )
    await page.reload()
    await expect(heading(page, 'Prijava')).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('Sesija je istekla. Prijavite se ponovo.')
  })

  test('being offline is an error with a retry, never "not a member"', async ({ page }) => {
    await signInAs(page, 'Nastavnik')
    await expect(heading(page, 'Moj raspored')).toBeVisible()

    await page.route('**/rest/v1/rpc/my_roles', (route) => route.abort('connectionfailed'))
    await page.reload()
    await expect(page.getByRole('alert')).toContainText('Došlo je do greške')
    await expect(page.getByText('Još niste član škole')).toHaveCount(0)

    await page.unroute('**/rest/v1/rpc/my_roles')
    await page.getByRole('button', { name: 'Pokušaj ponovo' }).click()
    await expect(heading(page, 'Moj raspored')).toBeVisible()
  })

  test('a failed Google sign-in comes back with a message', async ({ page }) => {
    await page.goto('/prijava?error=access_denied&error_description=User+denied')
    await expect(page.getByRole('alert')).toContainText('Prijava nije uspela. Pokušajte ponovo.')
  })

  test('the Google button leaves for Google through Supabase', async ({ page }) => {
    await page.goto('/moj-raspored')
    // The local stack has no Google client. Send the browser straight back, as Google would after a refusal,
    // and check that the app asked for the right provider and callback and kept the page to return to.
    await page.route('**/auth/v1/authorize**', (route) =>
      route.fulfill({ status: 302, headers: { location: 'http://127.0.0.1:5173/prijava' } }),
    )
    const authorize = page.waitForRequest((request) => request.url().includes('/auth/v1/authorize'))
    await page.getByRole('button', { name: 'Prijavi se Google nalogom' }).click()
    const url = new URL((await authorize).url())
    expect(url.searchParams.get('provider')).toBe('google')
    expect(url.searchParams.get('redirect_to')).toBe('http://127.0.0.1:5173/prijava')
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    await expect(heading(page, 'Prijava')).toBeVisible()
    expect(await page.evaluate(() => window.sessionStorage.getItem('sigma.returnTo'))).toBe(
      '/moj-raspored',
    )
  })
})
